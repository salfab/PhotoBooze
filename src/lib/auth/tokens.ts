/**
 * Join token generation and validation utilities.
 * Join tokens are URL-safe random strings that guests use to join a party.
 * We store SHA-256 hashes in the database for security.
 */

import { randomBytes, createHash } from 'crypto';

const JOIN_TOKEN_LENGTH = 32; // 32 bytes = 256 bits of entropy

/**
 * Generate a cryptographically secure join token.
 * Returns a URL-safe base64 string.
 */
export function generateJoinToken(): string {
  const bytes = randomBytes(JOIN_TOKEN_LENGTH);
  // URL-safe base64 encoding
  return bytes.toString('base64url');
}

/**
 * Hash a join token using SHA-256.
 * This is what we store in the database.
 */
export function hashJoinToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a join token against a stored hash.
 */
export function verifyJoinToken(token: string, storedHash: string): boolean {
  const tokenHash = hashJoinToken(token);
  // Constant-time comparison to prevent timing attacks
  if (tokenHash.length !== storedHash.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < tokenHash.length; i++) {
    result |= tokenHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}
