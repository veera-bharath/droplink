import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export class TokenService {
  private static sessionToken: string;
  private static customPassword: string | null = null;

  private static getConfigFile(): string {
    const uploadsDir = process.env.DROPLINK_UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    return path.join(uploadsDir, '.config.json');
  }

  /**
   * Loads the custom password configuration from local disk.
   */
  public static loadPasswordConfig(): void {
    try {
      const configFile = this.getConfigFile();
      if (fs.existsSync(configFile)) {
        const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (typeof data.password === 'string') {
          this.customPassword = data.password;
        }
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
      // 6 characters of uppercase letters/numbers, easy to read and type manually if needed
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
   * Retrieves the configured custom password.
   */
  public static getCustomPassword(): string | null {
    return this.customPassword;
  }

  /**
   * Sets and persists the custom password.
   */
  public static setCustomPassword(password: string | null): void {
    this.customPassword = password && password.trim() ? password.trim() : null;
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

      if (this.customPassword) {
        configData.password = this.customPassword;
      } else {
        delete configData.password;
      }

      fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), 'utf8');
    } catch (err: any) {
      console.error('[TokenService] Failed to save password config:', err.message);
    }
  }

  /**
   * Checks if a custom password is set.
   */
  public static isPasswordEnabled(): boolean {
    return this.customPassword !== null;
  }

  /**
   * Validates if a client-supplied token matches either the session token or the custom password.
   */
  public static validateToken(token?: string | string[]): boolean {
    if (!token) return false;
    
    // Support either query strings, headers, or URL params
    const tokenStr = Array.isArray(token) ? token[0] : token;
    const cleanToken = tokenStr.trim();

    // 1. Validate against session token (case-insensitive)
    if (cleanToken.toUpperCase() === this.sessionToken.toUpperCase()) {
      return true;
    }

    // 2. Validate against custom password (case-sensitive)
    if (this.customPassword && cleanToken === this.customPassword) {
      return true;
    }

    return false;
  }
}

