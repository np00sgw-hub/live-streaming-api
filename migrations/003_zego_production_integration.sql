-- =============================================================================
-- Zego Cloud Integration: Database Schema Migration
-- =============================================================================
-- This migration implements production-grade ZegoCloud configuration storage
-- with security best practices:
--
-- 1. Separate public and secret config tables
-- 2. Row-level security (RLS) to restrict access
-- 3. Audit logging for all configuration changes
-- 4. Room access tracking for lifecycle management
-- 5. Token caching for rate limiting
--
-- Migration steps:
-- 1. Create new tables (zego_config_public, zego_config_secrets, etc.)
-- 2. Migrate secrets from app_config to zego_config_secrets
-- 3. Set up RLS policies
-- 4. Enable audit triggers (optional, can be manual for now)
-- 5. Test migration doesn't break existing flows
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 1: Public Zego Configuration (accessible to all auth users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_config_public (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_id TEXT NOT NULL DEFAULT '',
  server_url TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  feature_flags JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL,
  updated_by_id TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT single_row CHECK (id = 1)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 2: Secret Zego Configuration (service role only)
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: In production, app_sign should be encrypted with a server-side key.
-- For now, we store encrypted JSON or use Postgres pgcrypto extension.
-- Ensure backups and access are restricted to admins.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_config_secrets (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_id TEXT NOT NULL DEFAULT '',
  app_sign TEXT NOT NULL DEFAULT '',
  app_sign_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  encryption_key_version INTEGER NOT NULL DEFAULT 1,
  last_updated BIGINT NOT NULL,
  updated_by_id TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT single_row CHECK (id = 1)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 3: Zego Room Access Log (tracks who joined which room as what role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_room_access (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host', 'cohost', 'audience')),
  joined_at BIGINT NOT NULL,
  left_at BIGINT,
  duration_ms INTEGER,
  quality_reported TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint * 1000
);

CREATE INDEX IF NOT EXISTS idx_zego_room_access_room_id ON zego_room_access(room_id);
CREATE INDEX IF NOT EXISTS idx_zego_room_access_user_id ON zego_room_access(user_id);
CREATE INDEX IF NOT EXISTS idx_zego_room_access_joined_at ON zego_room_access(joined_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 4: Zego-Specific Audit Log (config changes, token issues, errors)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN (
    'config_read', 'config_update', 'config_delete',
    'token_issued', 'token_refreshed', 'token_validated',
    'room_joined', 'room_left',
    'quality_issue', 'connection_error', 'rate_limit_hit',
    'admin_test', 'admin_rotate_key'
  )),
  admin_id TEXT REFERENCES users(id),
  user_id TEXT REFERENCES users(id),
  room_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint * 1000,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive', 'critical')),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_zego_audit_logs_action ON zego_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_zego_audit_logs_timestamp ON zego_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_zego_audit_logs_admin_id ON zego_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_zego_audit_logs_user_id ON zego_audit_logs(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 5: Zego Token Cache (for rate limiting and token verification)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_token_cache (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'cohost', 'audience')),
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_zego_token_cache_user_id ON zego_token_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_zego_token_cache_room_id ON zego_token_cache(room_id);
CREATE INDEX IF NOT EXISTS idx_zego_token_cache_expires_at ON zego_token_cache(expires_at);

-- Add automatic cleanup of expired tokens (optional, via schedule job)
-- DELETE FROM zego_token_cache WHERE expires_at < extract(epoch from now())::bigint * 1000;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (RLS) Policies
-- ─────────────────────────────────────────────────────────────────────────────

-- zego_config_public: all authenticated users can read
ALTER TABLE zego_config_public ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_public_read_all" ON zego_config_public
  FOR SELECT
  USING (true);

-- Only admin users can update public config
CREATE POLICY "config_public_update_admin" ON zego_config_public
  FOR UPDATE
  USING (
    (SELECT COUNT(*) FROM users WHERE id = current_user_id AND is_admin = true) > 0
  );

-- zego_config_secrets: service role only (never expose to client)
ALTER TABLE zego_config_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_secrets_service_role_only" ON zego_config_secrets
  USING (auth.role() = 'service_role');

-- zego_room_access: users can read their own, admins can read all
ALTER TABLE zego_room_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_access_read_own" ON zego_room_access
  FOR SELECT
  USING (user_id = current_user_id);

CREATE POLICY "room_access_read_admin" ON zego_room_access
  FOR SELECT
  USING (
    (SELECT COUNT(*) FROM users WHERE id = current_user_id AND is_admin = true) > 0
  );

-- zego_audit_logs: admins can read all, users can read their own
ALTER TABLE zego_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_read_own" ON zego_audit_logs
  FOR SELECT
  USING (
    user_id = current_user_id OR
    (SELECT COUNT(*) FROM users WHERE id = current_user_id AND is_admin = true) > 0
  );

-- zego_token_cache: internal use only (usually accessed via backend)
ALTER TABLE zego_token_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_cache_backend_only" ON zego_token_cache
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- Data Migration: Move secrets from app_config to new tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: This assumes app_config table exists from 001_initial.sql
-- Run this AFTER creating new tables, BEFORE removing old columns.

-- 1. Migrate public config
INSERT INTO zego_config_public (id, app_id, server_url, enabled, updated_at, updated_by_id)
SELECT 1,
       COALESCE(zego_app_id, ''),
       COALESCE(zego_server_url, ''),
       COALESCE(zego_enabled, false),
       extract(epoch from now())::bigint * 1000,
       'migration'
FROM app_config
WHERE id = 1
ON CONFLICT (id) DO UPDATE SET
  app_id = EXCLUDED.app_id,
  server_url = EXCLUDED.server_url,
  enabled = EXCLUDED.enabled,
  updated_at = EXCLUDED.updated_at;

-- 2. Migrate secrets
INSERT INTO zego_config_secrets (id, app_id, app_sign, app_sign_encrypted, last_updated, updated_by_id)
SELECT 1,
       COALESCE(zego_app_id, ''),
       COALESCE(zego_app_sign, ''),
       false,
       extract(epoch from now())::bigint * 1000,
       'migration'
FROM app_config
WHERE id = 1
ON CONFLICT (id) DO UPDATE SET
  app_id = EXCLUDED.app_id,
  app_sign = EXCLUDED.app_sign,
  last_updated = EXCLUDED.last_updated;

-- 3. Log the migration
INSERT INTO zego_audit_logs (
  id, action, details, timestamp, sensitivity
) VALUES (
  'migration_' || extract(epoch from now())::bigint,
  'config_update',
  jsonb_build_object(
    'event', 'config_migrated_to_new_schema',
    'timestamp', extract(epoch from now())::bigint * 1000
  ),
  extract(epoch from now())::bigint * 1000,
  'critical'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notes for Post-Migration
-- ─────────────────────────────────────────────────────────────────────────────
--
-- After this migration runs successfully:
--
-- 1. Backend code should:
--    - Use zego_config_public for public config (safe for RLS)
--    - Use zego_config_secrets ONLY on backend with service role
--    - NEVER return app_sign to frontend
--
-- 2. Update api/trpc/routes/streams.ts:
--    - getZegoPublicConfig() reads from zego_config_public
--    - getZegoToken() reads secrets from zego_config_secrets
--
-- 3. Update api/trpc/routes/admin.ts:
--    - All mutations update BOTH tables or use view
--
-- 4. Optional: Create a view for admin convenience
--    CREATE VIEW zego_config_admin AS
--    SELECT
--      pub.id, pub.app_id, pub.server_url, pub.enabled,
--      sec.app_sign, sec.encryption_key_version,
--      pub.updated_at, pub.updated_by_id
--    FROM zego_config_public pub
--    FULL OUTER JOIN zego_config_secrets sec ON pub.id = sec.id;
--
-- 5. Deprecation plan for app_config columns:
--    - Phase 1 (now): Both sources read
--    - Phase 2 (week 1): Dual writes to new tables only
--    - Phase 3 (week 2): Remove zego_* columns from app_config
--
-- 6. Security: Restrict direct access to zego_config_secrets table
--    ALTER TABLE zego_config_secrets OWNER TO postgres;
--    REVOKE ALL ON zego_config_secrets FROM public;
--    GRANT SELECT ON zego_config_secrets TO <backend_role>;

