import { createHmac, createHash } from 'crypto';
import type { ZegoTokenPayload, ZegoRole } from './zego-schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Secure Token Generation & Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically signed Zego token
 *
 * Token structure:
 * {
 *   payload: base64(JSON),
 *   signature: hex(HMAC-SHA256(payload, appSign))
 * }
 *
 * Format: base64(payload).hex(signature)
 *
 * @param appId - Zego app ID
 * @param appSign - Zego app sign (server secret)
 * @param userId - User ID
 * @param roomId - Room ID
 * @param role - User role in room
 * @param ttlMinutes - Token time-to-live in minutes (default 60)
 * @returns Signed token string
 */
export function generateZegoToken(
  appId: string,
  appSign: string,
  userId: string,
  roomId: string,
  role: ZegoRole = 'audience',
  ttlMinutes: number = 60
): string {
  const now = Date.now();
  const expiresAt = now + ttlMinutes * 60 * 1000;

  const payload: ZegoTokenPayload = {
    appId,
    userId,
    roomId,
    role,
    timestamp: now,
    expiresAt,
  };

  // 1. Serialize and encode payload
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString('base64');

  // 2. Generate HMAC-SHA256 signature
  const signature = createHmac('sha256', appSign)
    .update(payloadBase64)
    .digest('hex');

  // 3. Combine: base64(payload).hex(signature)
  return `${payloadBase64}.${signature}`;
}

/**
 * Verify and decode a signed Zego token
 *
 * @param token - Token string from client
 * @param appSign - Server secret to verify signature
 * @returns Decoded payload or null if invalid/expired
 */
export function verifyZegoToken(token: string, appSign: string): ZegoTokenPayload | null {
  try {
    // 1. Split token: payload and signature
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.warn('[Zego] Token format invalid: expected 2 parts');
      return null;
    }

    const [payloadBase64, signature] = parts;

    // 2. Verify signature
    const expectedSignature = createHmac('sha256', appSign)
      .update(payloadBase64)
      .digest('hex');
    if (signature !== expectedSignature) {
      console.warn('[Zego] Token signature mismatch');
      return null;
    }

    // 3. Decode payload
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const payload: ZegoTokenPayload = JSON.parse(payloadJson);

    // 4. Check expiry
    if (payload.expiresAt < Date.now()) {
      console.warn('[Zego] Token expired');
      return null;
    }

    // 5. Validate required fields
    if (!payload.appId || !payload.userId || !payload.roomId) {
      console.warn('[Zego] Token missing required fields');
      return null;
    }

    return payload;
  } catch (err) {
    console.warn('[Zego] Token verification error:', err);
    return null;
  }
}

/**
 * Generate a hash of a token for caching/tracking
 * Use SHA256 to avoid storing full token
 *
 * @param token - Token string
 * @returns Hex hash
 */
export function hashZegoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isTokenExpired(expiresAt: number, bufferMs: number = 5 * 60 * 1000): boolean {
  return Date.now() + bufferMs > expiresAt;
}

/**
 * Calculate seconds until token expiry
 */
export function secondsUntilExpiry(expiresAt: number): number {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const defaultRateLimitConfig: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * Simple in-memory rate limiter
 * In production, use Redis or similar
 */
class SimpleRateLimiter {
  private store = new Map<string, number[]>();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...defaultRateLimitConfig, ...config };
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.store.get(key) || [];

    // Remove old requests outside window
    const validRequests = requests.filter((time) => now - time < this.config.windowMs);

    if (validRequests.length < this.config.maxRequests) {
      validRequests.push(now);
      this.store.set(key, validRequests);
      return true;
    }

    return false;
  }

  getRemainingRequests(key: string): number {
    const now = Date.now();
    const requests = (this.store.get(key) || []).filter(
      (time) => now - time < this.config.windowMs
    );
    return Math.max(0, this.config.maxRequests - requests.length);
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export const zegoTokenRateLimiter = new SimpleRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000, // 10 tokens per minute per user
});

export const zegoAdminRateLimiter = new SimpleRateLimiter({
  maxRequests: 20,
  windowMs: 60 * 1000, // 20 config changes per minute per admin
});

// ─────────────────────────────────────────────────────────────────────────────
// Authorization Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if user is authorized to request token for a room as a specific role
 *
 * @param userId - User requesting access
 * @param roomId - Target room ID
 * @param requestedRole - Requested role
 * @param roomOwnerId - ID of room/stream owner
 * @param isUserBanned - Is user banned
 * @returns { allowed: boolean; reason?: string }
 */
export function checkRoomAuthorization(
  userId: string,
  roomId: string,
  requestedRole: ZegoRole,
  roomOwnerId: string | null,
  isUserBanned: boolean
): { allowed: boolean; reason?: string } {
  // Check: User is banned
  if (isUserBanned) {
    return { allowed: false, reason: 'User is banned' };
  }

  // Host role: only room owner
  if (requestedRole === 'host') {
    if (userId !== roomOwnerId) {
      return { allowed: false, reason: 'Only room owner can be host' };
    }
  }

  // Cohost role: only room owner or invited cohosts (future: check invites table)
  if (requestedRole === 'cohost') {
    if (userId !== roomOwnerId) {
      // TODO: Check if user is in cohosts list
      return { allowed: false, reason: 'User is not a cohost' };
    }
  }

  // Audience: generally allowed (except if banned or room is private & user not invited)
  // TODO: Check if room is private and user is invited

  return { allowed: true };
}

/**
 * Generate a unique room ID for a stream/audio room
 */
export function generateZegoRoomId(prefix: string, uniqueId?: string): string {
  const id = uniqueId ?? `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return `${prefix}_${id}`;
}

/**
 * Extract stream ID from Zego room ID
 * Expected format: "stream_<streamId>" or "room_<roomId>"
 */
export function extractResourceIdFromRoomId(roomId: string): string | null {
  const match = roomId.match(/^[a-z]+_(.+)$/);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Messages (Safe for Clients)
// ─────────────────────────────────────────────────────────────────────────────

export const ZegoErrorMessages = {
  NOT_CONFIGURED: 'ZegoCloud is not configured',
  INVALID_ROOM_ID: 'Invalid room ID',
  INVALID_ROLE: 'Invalid role',
  UNAUTHORIZED: 'Not authorized to join this room',
  RATE_LIMITED: 'Too many token requests. Please try again later.',
  TOKEN_INVALID: 'Invalid token',
  TOKEN_EXPIRED: 'Token expired',
  USER_BANNED: 'User account is banned',
  ROOM_NOT_FOUND: 'Room not found',
  INTERNAL_ERROR: 'Internal server error',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Logging Helpers (Safe)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log Zego-related events safely (without exposing secrets)
 */
export function logZegoEvent(
  action: string,
  details: Record<string, unknown>,
  isError: boolean = false
): void {
  const sanitized = {
    ...details,
    appSign: undefined, // Never log secrets
    token: details.token ? '[token]' : undefined,
  };

  const level = isError ? 'error' : 'info';
  console[level as 'log' | 'error'](`[ZegoCloud] ${action}:`, sanitized);
}

/**
 * Log rate limit hit
 */
export function logRateLimitHit(userId: string, endpoint: string): void {
  logZegoEvent(`Rate limit hit on ${endpoint}`, { userId }, true);
}

/**
 * Log authorization failure
 */
export function logAuthorizationFailure(
  userId: string,
  roomId: string,
  reason: string
): void {
  logZegoEvent('Authorization failed', { userId, roomId, reason }, true);
}

/**
 * Log token generation
 */
export function logTokenGenerated(
  userId: string,
  roomId: string,
  role: ZegoRole,
  expiresAt: number
): void {
  logZegoEvent('Token generated', {
    userId,
    roomId,
    role,
    expiresInMinutes: Math.round((expiresAt - Date.now()) / 60000),
  });
}
