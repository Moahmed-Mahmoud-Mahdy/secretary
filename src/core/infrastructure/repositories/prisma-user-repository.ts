import type { PrismaClient } from '@prisma/client';
import type { IUserRepository } from '../../domain/repositories';
import type { UserRecord } from '../../domain/types';

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? this.toRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { id } });
    return user ? this.toRecord(user) : null;
  }

  async create(data: { name: string; email: string; passwordHash: string }): Promise<UserRecord> {
    const user = await this.db.user.create({ data: { name: data.name, email: data.email.toLowerCase(), passwordHash: data.passwordHash } });
    return this.toRecord(user);
  }

  async setMonthlyBudget(userId: string, amount: number | null): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { monthlyBudget: amount } });
  }

  private toRecord(user: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    monthlyBudget: number | null;
    createdAt: Date;
  }): UserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      monthlyBudget: user.monthlyBudget,
      createdAt: user.createdAt,
    };
  }
}
