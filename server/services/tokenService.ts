import crypto from 'crypto';

export class TokenService {
  private static sessionToken: string;

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
   * Validates if a client-supplied token matches the active session token.
   */
  public static validateToken(token?: string | string[]): boolean {
    if (!token) return false;
    
    // Support either query strings, headers, or URL params
    const tokenStr = Array.isArray(token) ? token[0] : token;
    return tokenStr.trim().toUpperCase() === this.sessionToken.toUpperCase();
  }
}
