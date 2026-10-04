import { ConflictError, UnauthorizedError, ValidationError } from '../../domain/errors';
import { serializeUser } from '../../domain/services/serialize';
import type { UserRecord, UserDTO } from '../../domain/types';
import type { IPasswordHasher, ITokenService } from '../ports';
import type { IUserRepository } from '../../domain/repositories';

// ============================================================
// Authentication use cases (BRD §30) — register / login / me.
// Passwords are hashed (bcrypt), sessions use JWT (7 days).
// ============================================================

export interface AuthResult {
  user: UserDTO;
  token: string;
  ttlSeconds: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export class AuthUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService
  ) {}

  async register(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!name || name.length < 2) throw new ValidationError('الاسم قصير أوي — اكتب اسمك الحقيقي');
    if (!email || !EMAIL_PATTERN.test(email)) throw new ValidationError('الإيميل مش شكله صحيح');
    if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`الباسورد لازم يكون ${MIN_PASSWORD_LENGTH} حروف على الأقل`);
    }

    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictError('الإيميل ده متسجل قبل كده — سجل دخول بدل ما تعمل حساب جديد');

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({ name, email, passwordHash });
    return this.buildResult(user);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const email = input.email?.trim().toLowerCase();
    if (!email || !input.password) throw new ValidationError('اكتب الإيميل والباسورد');

    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedError('الإيميل أو الباسورد غلط');

    const valid = await this.hasher.verify(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('الإيميل أو الباسورد غلط');

    return this.buildResult(user);
  }

  async me(userId: string): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();
    return serializeUser(user);
  }

  /** Edit the profile (display name) — BRD §30 personal settings. */
  async updateProfile(userId: string, input: { name?: string }): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();

    const patch: { name?: string } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 2) throw new ValidationError('الاسم قصير أوي — اكتب اسمك الحقيقي');
      if (name.length > 40) throw new ValidationError('الاسم طويل أوي — 40 حرف بالحد الأقصى');
      patch.name = name;
    }
    if (Object.keys(patch).length === 0) return serializeUser(user);

    const updated = await this.users.update(userId, patch);
    if (!updated) throw new UnauthorizedError();
    return serializeUser(updated);
  }

  private async buildResult(user: UserRecord): Promise<AuthResult> {
    const token = await this.tokens.issue({ sub: user.id, email: user.email });
    return {
      user: serializeUser(user),
      token,
      ttlSeconds: TOKEN_TTL_SECONDS,
    };
  }
}

export { TOKEN_TTL_SECONDS };
