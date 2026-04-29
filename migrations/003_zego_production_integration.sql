-- =============================================================================
-- Zego Cloud Integration: Production Schema (FIXED)
-- =============================================================================

-- ─────────────────────────────────────────────
-- TABLE 1: PUBLIC CONFIG
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_config_public (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_id TEXT NOT NULL DEFAULT '',
  server_url TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  feature_flags JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL,
  updated_by_id TEXT NOT NULL DEFAULT 'system'
);

-- ─────────────────────────────────────────────
-- TABLE 2: SECRET CONFIG (BACKEND ONLY)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_config_secrets (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_id TEXT NOT NULL DEFAULT '',
  app_sign TEXT NOT NULL DEFAULT '',
  app_sign_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  encryption_key_version INTEGER NOT NULL DEFAULT 1,
  last_updated BIGINT NOT NULL,
  updated_by_id TEXT NOT NULL DEFAULT 'system'
);

-- ─────────────────────────────────────────────
-- TABLE 3: ROOM ACCESS LOG
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_room_access (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host', 'cohost', 'audience')),
  joined_at BIGINT NOT NULL,
  left_at BIGINT,
  duration_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint * 1000
);

CREATE INDEX IF NOT EXISTS idx_room_room_id ON zego_room_access(room_id);
CREATE INDEX IF NOT EXISTS idx_room_user_id ON zego_room_access(user_id);

-- ─────────────────────────────────────────────
-- TABLE 4: AUDIT LOGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  admin_id TEXT REFERENCES users(id),
  user_id TEXT REFERENCES users(id),
  room_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint * 1000,
  sensitivity TEXT DEFAULT 'normal'
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON zego_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON zego_audit_logs(action);

-- ─────────────────────────────────────────────
-- TABLE 5: TOKEN CACHE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zego_token_cache (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'cohost', 'audience')),
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  signature_valid BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_token_user ON zego_token_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_token_room ON zego_token_cache(room_id);

-- =============================================================================
-- 🔐 ENABLE RLS
-- =============================================================================
ALTER TABLE zego_config_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE zego_config_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE zego_room_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE zego_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zego_token_cache ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- ✅ POLICIES (FIXED)
-- =============================================================================

-- PUBLIC CONFIG
CREATE POLICY "public_read"
ON zego_config_public
FOR SELECT
USING (true);

CREATE POLICY "public_update_admin"
ON zego_config_public
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()::text AND is_admin = true
  )
);

-- SECRETS (ONLY SERVICE ROLE)
CREATE POLICY "secrets_backend_only"
ON zego_config_secrets
USING (auth.role() = 'service_role');

-- ROOM ACCESS
CREATE POLICY "room_read_own"
ON zego_room_access
FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY "room_read_admin"
ON zego_room_access
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()::text AND is_admin = true
  )
);

-- AUDIT LOGS
CREATE POLICY "audit_read"
ON zego_audit_logs
FOR SELECT
USING (
  user_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()::text AND is_admin = true
  )
);

-- TOKEN CACHE (BACKEND ONLY)
CREATE POLICY "token_backend"
ON zego_token_cache
USING (auth.role() = 'service_role');

-- =============================================================================
-- 🔄 DATA MIGRATION (SAFE)
-- =============================================================================

-- PUBLIC
INSERT INTO zego_config_public (id, app_id, server_url, enabled, updated_at)
SELECT 1,
  COALESCE(zego_app_id, ''),
  COALESCE(zego_server_url, ''),
  COALESCE(zego_enabled, false),
  extract(epoch from now())::bigint * 1000
FROM app_config
WHERE id = 1
ON CONFLICT (id) DO UPDATE SET
  app_id = EXCLUDED.app_id,
  server_url = EXCLUDED.server_url,
  enabled = EXCLUDED.enabled;

-- SECRETS
INSERT INTO zego_config_secrets (id, app_id, app_sign, last_updated)
SELECT 1,
  COALESCE(zego_app_id, ''),
  COALESCE(zego_app_sign, ''),
  extract(epoch from now())::bigint * 1000
FROM app_config
WHERE id = 1
ON CONFLICT (id) DO UPDATE SET
  app_id = EXCLUDED.app_id,
  app_sign = EXCLUDED.app_sign;

-- AUDIT ENTRY
INSERT INTO zego_audit_logs (id, action, details)
VALUES (
  'migration_' || extract(epoch from now())::bigint,
  'config_update',
  jsonb_build_object('event', 'zego_migrated')
);