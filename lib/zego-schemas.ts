import * as z from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zego Configuration Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ZegoRoleSchema = z.enum(['host', 'cohost', 'audience']);
export type ZegoRole = z.infer<typeof ZegoRoleSchema>;

export const ZegoPublicConfigSchema = z.object({
  appId: z.string().min(1, 'App ID is required').max(20),
  serverUrl: z.string().url('Invalid server URL').optional().or(z.literal('')),
  enabled: z.boolean(),
  isConfigured: z.boolean(),
  featureFlags: z.record(z.boolean()).optional(),
});
export type ZegoPublicConfig = z.infer<typeof ZegoPublicConfigSchema>;

export const ZegoSecretsSchema = z.object({
  appId: z.string().min(1, 'App ID is required').max(20),
  appSign: z.string().min(1, 'App Sign is required').min(32, 'App Sign too short'),
  serverUrl: z.string().url('Invalid server URL').optional(),
});
export type ZegoSecrets = z.infer<typeof ZegoSecretsSchema>;

export const ZegoTokenPayloadSchema = z.object({
  appId: z.string(),
  userId: z.string(),
  roomId: z.string(),
  role: ZegoRoleSchema,
  timestamp: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  signature: z.string().optional(), // HMAC-SHA256 hex
});
export type ZegoTokenPayload = z.infer<typeof ZegoTokenPayloadSchema>;

export const ZegoTokenRequestSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required').max(128),
  role: ZegoRoleSchema.optional().default('audience'),
});
export type ZegoTokenRequest = z.infer<typeof ZegoTokenRequestSchema>;

export const ZegoTokenResponseSchema = z.object({
  token: z.string(),
  appId: z.string(),
  serverUrl: z.string().optional(),
  userId: z.string(),
  roomId: z.string(),
  expiresAt: z.number(),
  expiresIn: z.number(), // seconds
  role: ZegoRoleSchema,
});
export type ZegoTokenResponse = z.infer<typeof ZegoTokenResponseSchema>;

export const ZegoStreamAuthSchema = z.object({
  streamId: z.string().min(1).max(128),
});
export type ZegoStreamAuth = z.infer<typeof ZegoStreamAuthSchema>;

export const ZegoAudioRoomAuthSchema = z.object({
  roomId: z.string().min(1).max(128),
  seatIndex: z.number().int().min(0).max(12).optional(),
});
export type ZegoAudioRoomAuth = z.infer<typeof ZegoAudioRoomAuthSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Admin Configuration Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ZegoAdminConfigInputSchema = z.object({
  appId: z.string().min(1, 'App ID is required').max(20),
  appSign: z.string().min(32, 'App Sign must be at least 32 characters'),
  serverUrl: z.string().url('Invalid server URL').optional(),
  enabled: z.boolean(),
});
export type ZegoAdminConfigInput = z.infer<typeof ZegoAdminConfigInputSchema>;

export const ZegoAdminConfigUpdateSchema = z.object({
  appId: z.string().min(1).max(20).optional(),
  appSign: z.string().min(32).optional(),
  serverUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});
export type ZegoAdminConfigUpdate = z.infer<typeof ZegoAdminConfigUpdateSchema>;

export const ZegoAdminTestInputSchema = z.object({
  appId: z.string().min(1).max(20),
  appSign: z.string().min(32),
  serverUrl: z.string().url().optional(),
});
export type ZegoAdminTestInput = z.infer<typeof ZegoAdminTestInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Room Access Tracking Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ZegoRoomAccessSchema = z.object({
  roomId: z.string().min(1).max(128),
  userId: z.string().min(1),
  role: ZegoRoleSchema,
  joinedAt: z.number().int().positive(),
  leftAt: z.number().int().positive().optional(),
  qualityReported: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
});
export type ZegoRoomAccess = z.infer<typeof ZegoRoomAccessSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Quality & Metrics Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ZegoNetworkQualitySchema = z.enum([
  'excellent',
  'good',
  'medium',
  'poor',
  'disconnected',
]);
export type ZegoNetworkQuality = z.infer<typeof ZegoNetworkQualitySchema>;

export const ZegoQualityReportSchema = z.object({
  roomId: z.string(),
  quality: ZegoNetworkQualitySchema,
  latency: z.number().int().min(0).optional(),
  packetLoss: z.number().min(0).max(1).optional(),
  bitrate: z.number().int().min(0).optional(),
  timestamp: z.number().int().positive(),
});
export type ZegoQualityReport = z.infer<typeof ZegoQualityReportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ZegoAuditActionSchema = z.enum([
  'config_read',
  'config_update',
  'config_delete',
  'token_issued',
  'token_refreshed',
  'token_validated',
  'room_joined',
  'room_left',
  'quality_issue',
  'connection_error',
  'rate_limit_hit',
  'admin_test',
  'admin_rotate_key',
]);
export type ZegoAuditAction = z.infer<typeof ZegoAuditActionSchema>;

export const ZegoAuditLogEntrySchema = z.object({
  action: ZegoAuditActionSchema,
  adminId: z.string().optional(),
  userId: z.string().optional(),
  roomId: z.string().optional(),
  details: z.record(z.unknown()),
  timestamp: z.number().int().positive(),
  sensitivity: z.enum(['normal', 'sensitive', 'critical']).optional(),
  ipAddress: z.string().ip().optional(),
});
export type ZegoAuditLogEntry = z.infer<typeof ZegoAuditLogEntrySchema>;

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
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a Zego token payload structure
 */
export function validateZegoTokenPayload(payload: unknown): payload is ZegoTokenPayload {
  try {
    ZegoTokenPayloadSchema.parse(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate Zego room ID format
 * Expected format: "stream_<streamId>" or "room_<roomId>" etc.
 */
export function validateZegoRoomId(roomId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(roomId);
}

/**
 * Validate Zego app ID format (usually numeric string)
 */
export function validateZegoAppId(appId: string): boolean {
  return /^\d{6,20}$/.test(appId);
}

/**
 * Validate Zego app sign format (usually hex string, 32-256 chars)
 */
export function validateZegoAppSign(appSign: string): boolean {
  return /^[a-f0-9]{32,256}$/i.test(appSign);
}
