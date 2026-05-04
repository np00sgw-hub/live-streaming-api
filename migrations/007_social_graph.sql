-- ============================================================
-- Social Graph Enhancement Migration
-- Adds follows table, visitor tracking, and social indexes
-- ============================================================

-- ============================================================
-- Follows Table (Follow / Following System)
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

-- Prevent self-follows via check constraint
-- Note: Application layer should also enforce this

-- Indexes for efficient follow queries
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id, created_at DESC);

-- ============================================================
-- Profile Visitors Table
-- ============================================================
CREATE TABLE IF NOT EXISTS profile_visitors (
  visitor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visit_count INTEGER NOT NULL DEFAULT 1,
  first_visit_at BIGINT NOT NULL,
  last_visit_at BIGINT NOT NULL,
  PRIMARY KEY (visitor_id, profile_id)
);

-- Indexes for visitor queries
CREATE INDEX IF NOT EXISTS idx_visitors_profile ON profile_visitors(profile_id, last_visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_visitor ON profile_visitors(visitor_id, last_visit_at DESC);

-- ============================================================
-- User Social Stats Trigger Function
-- Automatically updates followers/following/friends counts
-- ============================================================

-- Function to update follower count
CREATE OR REPLACE FUNCTION update_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET followers = followers + 1 WHERE id = NEW.following_id;
    UPDATE users SET following = following + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET followers = GREATEST(0, followers - 1) WHERE id = OLD.following_id;
    UPDATE users SET following = GREATEST(0, following - 1) WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for follows table
DROP TRIGGER IF EXISTS follows_count_trigger ON follows;
CREATE TRIGGER follows_count_trigger
AFTER INSERT OR DELETE ON follows
FOR EACH ROW
EXECUTE FUNCTION update_follower_count();

-- ============================================================
-- Function to update friend count
-- ============================================================
CREATE OR REPLACE FUNCTION update_friend_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET friends = friends + 1 WHERE id = NEW.user_a;
    UPDATE users SET friends = friends + 1 WHERE id = NEW.user_b;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET friends = GREATEST(0, friends - 1) WHERE id = OLD.user_a;
    UPDATE users SET friends = GREATEST(0, friends - 1) WHERE id = OLD.user_b;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for friendships table
DROP TRIGGER IF EXISTS friendships_count_trigger ON friendships;
CREATE TRIGGER friendships_count_trigger
AFTER INSERT OR DELETE ON friendships
FOR EACH ROW
EXECUTE FUNCTION update_friend_count();

-- ============================================================
-- Function to update visitor count
-- ============================================================
CREATE OR REPLACE FUNCTION update_visitor_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET visitors = visitors + 1 WHERE id = NEW.profile_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profile_visitors table
DROP TRIGGER IF EXISTS visitors_count_trigger ON profile_visitors;
CREATE TRIGGER visitors_count_trigger
AFTER INSERT ON profile_visitors
FOR EACH ROW
EXECUTE FUNCTION update_visitor_count();

-- ============================================================
-- Add is_online column to users if not exists
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='users' AND column_name='is_online') THEN
    ALTER TABLE users ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Index for online users
CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online, level DESC) WHERE is_online = TRUE;

-- ============================================================
-- Add last_active column to users if not exists
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='users' AND column_name='last_active') THEN
    ALTER TABLE users ADD COLUMN last_active BIGINT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- Add composite indexes for friend_requests
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_id, status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_id, status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status, timestamp DESC);

-- ============================================================
-- Migration Complete
-- ============================================================
