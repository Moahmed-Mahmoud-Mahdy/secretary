import { SignJWT, jwtVerify } from 'jose';
import type { ITokenService, TokenPayload } from '../../application/ports';

const DEFAULT_SECRET = 'sekretir-dev-secret-please-set-AUTH_SECRET-env';

export class JoseTokenService implements ITokenService {
  private readonly secret: Uint8Array;

  constructor(secret?: string) {
    this.secret = new TextEncoder().encode(secret || DEFAULT_SECRET);
  }

  async issue(payload: TokenPayload): Promise<string> {
    return new SignJWT({ email: payload.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(this.secret);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (!payload.sub) return null;
      return { sub: payload.sub, email: String(payload.email ?? '') };
    } catch {
      return null;
    }
  }
}
