-- ============================================================
-- Migration 006: Fix Streaming - Add Constraints & Heartbeat
-- (SAFE VERSION - Handles duplicate data before constraint)
-- ============================================================

-- ============================================================
-- 0. PRE-CLEAN: Fix duplicate active streams (CRITICAL FIX)
--    Keeps latest stream per host, ends older ones
-- ============================================================
WITH ranked_streams AS (
  SELECT 
    id,
    host_id,
    ROW_NUMBER() OVER (
      PARTITION BY host_id 
      ORDER BY started_at DESC
    ) as rn
  FROM streams
  WHERE is_live = true
)
UPDATE streams
SET 
  is_live = false,
  ended_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
WHERE id IN (
  SELECT id 
  FROM ranked_streams 
  WHERE rn > 1
);

-- Optional: Verify duplicates are gone
-- SELECT host_id, COUNT(*) 
-- FROM streams 
-- WHERE is_live = true 
-- GROUP BY host_id 
-- HAVING COUNT(*) > 1;

-- ============================================================
-- 1. Add heartbeat/updated_at column
-- ============================================================
ALTER TABLE streams
ADD COLUMN IF NOT EXISTS updated_at BIGINT 
NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- ============================================================
-- 2. Lock table (prevents race condition during index creation)
-- ============================================================
LOCK TABLE streams IN SHARE ROW EXCLUSIVE MODE;

-- ============================================================
-- 3. Create UNIQUE PARTIAL INDEX
--    Ensures only 1 stream per host can have is_live = true
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_streams_unique_active_per_host
ON streams(host_id) 
WHERE is_live = true;

-- ============================================================
-- 4. Create index for stale stream queries (auto-expire)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_streams_updated_at_live
ON streams(updated_at DESC)
WHERE is_live = true;

-- ============================================================
-- 5. Create index for quick lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_streams_host_status
ON streams(host_id, is_live);

-- ============================================================
-- 6. AUTO-CLEANUP: End orphaned streams (>24 hours old)
-- ============================================================
UPDATE streams
SET 
  is_live = false, 
  ended_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
WHERE 
  is_live = true 
  AND started_at < ((EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 86400000);

-- Verify cleanup worked
SELECT COUNT(*) as "Stale streams cleaned up" 
FROM streams 
WHERE is_live = false AND ended_at > 0;

-- ============================================================
-- 7. Backfill updated_at for existing rows
-- ============================================================
UPDATE streams
SET updated_at = COALESCE(started_at, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
WHERE updated_at IS NULL;

-- ============================================================
-- 8. Add column comments
-- ============================================================
COMMENT ON COLUMN streams.is_live IS 
'Indicates if stream is currently active. Only 1 per host can be true (enforced by unique index).';

COMMENT ON COLUMN streams.updated_at IS 
'Last heartbeat/update timestamp. Used for stale stream detection (>30min = stale).';

-- ============================================================
-- 9. Verify schema
-- ============================================================
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'streams'
ORDER BY indexname;

-- ============================================================
-- DONE ✅
-- ============================================================


ALTER TABLE streams
ADD COLUMN IF NOT EXISTS created_at BIGINT;

-- Backfill data
UPDATE streams
SET created_at = COALESCE(started_at, updated_at);

-- Optional: make it NOT NULL
ALTER TABLE streams
ALTER COLUMN created_at SET NOT NULL;