import type { IPasswordHasher } from '../../application/ports';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export class BcryptPasswordHasher implements IPasswordHasher {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
