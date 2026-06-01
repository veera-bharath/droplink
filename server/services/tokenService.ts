import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

export class TokenService {
  private static sessionToken: string;
  // Plaintext only while set in the current process — never loaded from disk.
  private static customPassword: string | null = null;
  // Hash + salt loaded from disk (used for validation after a restart).
  private static passwordHash: string | null = null;
  private static passwordSalt: string | null = null;

  private static getConfigFile(): string {
    const uploadsDir = process.env.DROPLINK_UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    return path.join(uploadsDir, '.config.json');
  }

  private static deriveHash(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  }

  /**
   * Loads the custom password configuration from local disk.
   * Migrates any legacy plaintext entry to a hashed representation on first load.
   */
  public static loadPasswordConfig(): void {
    try {
      const configFile = this.getConfigFile();
      if (!fs.existsSync(configFile)) return;

      const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));

      if (typeof data.passwordHash === 'string' && typeof data.passwordSalt === 'string') {
        // Normal path: hash already stored
        this.passwordHash = data.passwordHash;
        this.passwordSalt = data.passwordSalt;
      } else if (typeof data.password === 'string') {
        // Migration: hash the legacy plaintext and overwrite the file
        const salt = crypto.randomBytes(32).toString('hex');
        const hash = this.deriveHash(data.password, salt);
        this.passwordHash = hash;
        this.passwordSalt = salt;

        const migrated = { ...data, passwordHash: hash, passwordSalt: salt };
        delete migrated.password;
        fs.writeFileSync(configFile, JSON.stringify(migrated, null, 2), 'utf8');
      }
    } catch (err: any) {
      console.error('[TokenService] Failed to load password config:', err.message);
    }
  }

  /**
   * Generates a random 6-character alphanumeric session token on server startup.
   */
  public static generateSessionToken(): string {
    if (!this.sessionToken) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let token = '';
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) {
        token += chars[bytes[i] % chars.length];
      }
      this.sessionToken = token;

      // Auto-load custom password on token initialization (startup)
      this.loadPasswordConfig();
    }
    return this.sessionToken;
  }

  /**
   * Retrieves the currently active session token.
   */
  public static getSessionToken(): string {
    if (!this.sessionToken) {
      return this.generateSessionToken();
    }
    return this.sessionToken;
  }

  /**
   * Returns the plaintext custom password for the current session, or null if unavailable.
   * Only set while the password was configured in this process — not populated after a restart.
   */
  public static getCustomPassword(): string | null {
    return this.customPassword;
  }

  /**
   * Sets and persists the custom password.
   * Stores a PBKDF2 hash + random salt on disk; plaintext is kept only in memory.
   */
  public static setCustomPassword(password: string | null): void {
    const trimmed = password && password.trim() ? password.trim() : null;
    this.customPassword = trimmed;

    if (trimmed) {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = this.deriveHash(trimmed, salt);
      this.passwordHash = hash;
      this.passwordSalt = salt;
    } else {
      this.passwordHash = null;
      this.passwordSalt = null;
    }

    try {
      const configFile = this.getConfigFile();
      const dir = path.dirname(configFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let configData: any = {};
      if (fs.existsSync(configFile)) {
        try {
          configData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        } catch (e) {}
      }

      // Always remove any legacy plaintext entry
      delete configData.password;

      if (this.passwordHash && this.passwordSalt) {
        configData.passwordHash = this.passwordHash;
        configData.passwordSalt = this.passwordSalt;
      } else {
        delete configData.passwordHash;
        delete configData.passwordSalt;
      }

      fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), 'utf8');
    } catch (err: any) {
      console.error('[TokenService] Failed to save password config:', err.message);
    }
  }

  /**
   * Checks if a custom password is configured (either in-memory or as a stored hash).
   */
  public static isPasswordEnabled(): boolean {
    return this.customPassword !== null || this.passwordHash !== null;
  }

  /**
   * Validates a client-supplied token against the session token or the custom password.
   */
  public static validateToken(token?: string | string[]): boolean {
    if (!token) return false;

    const tokenStr = Array.isArray(token) ? token[0] : token;
    const cleanToken = tokenStr.trim();

    // 1. Session token (case-insensitive)
    if (cleanToken.toUpperCase() === this.sessionToken.toUpperCase()) {
      return true;
    }

    // 2. Custom password — plaintext comparison when available in the current session
    if (this.customPassword && cleanToken === this.customPassword) {
      return true;
    }

    // 3. Hash comparison when only the stored hash is available (e.g. after a restart)
    if (!this.customPassword && this.passwordHash && this.passwordSalt) {
      const candidate = this.deriveHash(cleanToken, this.passwordSalt);
      if (crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(this.passwordHash, 'hex'))) {
        return true;
      }
    }

    return false;
  }
}
