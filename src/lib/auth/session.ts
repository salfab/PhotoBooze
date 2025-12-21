/**
 * Session management using JWT stored in HttpOnly cookies.
 * Uses jose library for JWT operations (edge-compatible).
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionPayload, SessionData } from '@/types/auth';

const SESSION_COOKIE_NAME = 'photobooze_session';
const SESSION_EXPIRY_HOURS = 12;

/**
 * Get the secret key for JWT signing.
 * Must be at least 32 characters.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a session JWT for a guest.
 */
export async function createSession(partyId: string, uploaderId: string): Promise<string> {
  const secretKey = getSecretKey();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  const token = await new SignJWT({
    partyId,
    uploaderId,
  } satisfies Omit<SessionPayload, 'iat' | 'exp'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey);

  return token;
}

/**
 * Verify and decode a session JWT.
 * Returns null if invalid or expired.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);

    // Validate required fields
    if (
      typeof payload.partyId !== 'string' ||
      typeof payload.uploaderId !== 'string'
    ) {
      return null;
    }

    return {
      partyId: payload.partyId,
      uploaderId: payload.uploaderId,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}

/**
 * Set the session cookie for a guest.
 */
export async function setSessionCookie(partyId: string, uploaderId: string): Promise<void> {
  const token = await createSession(partyId, uploaderId);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
  });
}

/**
 * Get the current session from cookies.
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifySession(token);
  if (!payload) {
    return null;
  }

  return {
    partyId: payload.partyId,
    uploaderId: payload.uploaderId,
    expiresAt: new Date(payload.exp * 1000),
  };
}

/**
 * Clear the session cookie.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Check if user has a valid session for a specific party.
 */
export async function hasSessionForParty(partyId: string): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.partyId === partyId;
}
