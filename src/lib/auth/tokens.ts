/**
 * Token and PIN utilities.
 * - Join tokens: URL-safe random strings for party access
 * - PINs: 6-digit codes for admin authentication
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
 * Hash a PIN using SHA-256.
 * This is what we store in the database for admin PINs.
 */
export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

/**
 * Verify a PIN against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyPin(pin: string, storedHash: string): boolean {
  const pinHash = hashPin(pin);
  // Constant-time comparison to prevent timing attacks
  if (pinHash.length !== storedHash.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < pinHash.length; i++) {
    result |= pinHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}
