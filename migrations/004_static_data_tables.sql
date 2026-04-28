-- =============================================================================
-- Static Data Tables Migration
-- This migration creates tables for all static/config data that was previously
-- hardcoded in the frontend. This enables dynamic management via admin panel.
-- =============================================================================

-- ============================================================
-- VIP Packages
-- ============================================================
CREATE TABLE IF NOT EXISTS vip_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 4),
  price INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  perks TEXT[] NOT NULL,
  color TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Top-up Packages
-- ============================================================
CREATE TABLE IF NOT EXISTS topup_packages (
  id TEXT PRIMARY KEY,
  coins INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Avatar Frames
-- ============================================================
CREATE TABLE IF NOT EXISTS avatar_frames (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  preview TEXT NOT NULL,
  price INTEGER NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  colors TEXT[] NOT NULL,
  is_animated BOOLEAN NOT NULL DEFAULT FALSE,
  required_vip_level INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Entry Effects
-- ============================================================
CREATE TABLE IF NOT EXISTS entry_effects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  preview TEXT NOT NULL,
  price INTEGER NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  colors TEXT[] NOT NULL,
  description TEXT NOT NULL,
  required_vip_level INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Broadcast Themes
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcast_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  preview TEXT NOT NULL,
  price INTEGER NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  colors TEXT[] NOT NULL,
  gradient_colors TEXT[] NOT NULL,
  description TEXT NOT NULL,
  required_vip_level INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Emoji Sets
-- ============================================================
CREATE TABLE IF NOT EXISTS emoji_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS emojis (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES emoji_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preview TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('gif', 'png', 'svg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Agencies
-- ============================================================
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  member_count INTEGER NOT NULL DEFAULT 0,
  max_members INTEGER NOT NULL,
  description TEXT NOT NULL,
  benefits TEXT[] NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
  commission_rate INTEGER NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  referral_code TEXT NOT NULL UNIQUE,
  rating DECIMAL(3,2) NOT NULL DEFAULT 0,
  total_earnings BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Agency Members
-- ============================================================
CREATE TABLE IF NOT EXISTS agency_members (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 1,
  joined_at BIGINT NOT NULL,
  total_diamonds_earned BIGINT NOT NULL DEFAULT 0,
  commission_paid BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at BIGINT,
  UNIQUE(agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_members_agency ON agency_members(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_user ON agency_members(user_id);

-- ============================================================
-- PK Reward Tiers
-- ============================================================
CREATE TABLE IF NOT EXISTS pk_reward_tiers (
  tier TEXT PRIMARY KEY CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'legend')),
  label TEXT NOT NULL,
  min_points INTEGER NOT NULL,
  bonus_multiplier DECIMAL(3,2) NOT NULL,
  award_bonus INTEGER NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- PK Challenge Banners
-- ============================================================
CREATE TABLE IF NOT EXISTS pk_challenge_banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  banner_image TEXT NOT NULL,
  player_a_name TEXT NOT NULL,
  player_a_avatar TEXT NOT NULL,
  player_a_level INTEGER NOT NULL,
  player_b_name TEXT NOT NULL,
  player_b_avatar TEXT NOT NULL,
  player_b_level INTEGER NOT NULL,
  scheduled_date BIGINT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  prize_pool INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled')),
  match_type TEXT NOT NULL CHECK (match_type IN ('solo', 'team', 'tournament')),
  entry_fee INTEGER NOT NULL DEFAULT 0,
  max_viewers INTEGER NOT NULL,
  tags TEXT[] NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Scheduled Lives
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_lives (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scheduled_date BIGINT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  valid_days INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('video', 'audio', 'pk')),
  status TEXT NOT NULL CHECK (status IN ('upcoming', 'completed', 'cancelled', 'expired')),
  reminders INTEGER NOT NULL DEFAULT 0,
  cover_image TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_lives_host ON scheduled_lives(host_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_lives_date ON scheduled_lives(scheduled_date);

-- ============================================================
-- Status Posts
-- ============================================================
CREATE TABLE IF NOT EXISTS status_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video', 'text')),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  caption TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  is_liked_by_current_user BOOLEAN NOT NULL DEFAULT FALSE,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_posts_user ON status_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_status_posts_created ON status_posts(created_at DESC);

-- ============================================================
-- Cashback Gifts
-- ============================================================
CREATE TABLE IF NOT EXISTS cashback_gifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  price INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('local', 'global')),
  coin_pool INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Active Cashback Bags
-- ============================================================
CREATE TABLE IF NOT EXISTS cashback_bags (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('local', 'global')),
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  sender_avatar TEXT NOT NULL,
  sender_level INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  total_coins INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'opened', 'expired')),
  time_remaining INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Audio Tracks
-- ============================================================
CREATE TABLE IF NOT EXISTS audio_tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  duration INTEGER NOT NULL,
  cover_url TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  genre TEXT NOT NULL,
  is_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by TEXT REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_genre ON audio_tracks(genre);

-- ============================================================
-- Sports Betting Matches
-- ============================================================
CREATE TABLE IF NOT EXISTS sports_matches (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL CHECK (sport IN ('football', 'cricket', 'basketball', 'tennis')),
  league TEXT NOT NULL,
  league_icon TEXT NOT NULL,
  team_a_name TEXT NOT NULL,
  team_a_short_name TEXT NOT NULL,
  team_a_logo TEXT NOT NULL,
  team_a_color TEXT NOT NULL,
  team_b_name TEXT NOT NULL,
  team_b_short_name TEXT NOT NULL,
  team_b_logo TEXT NOT NULL,
  team_b_color TEXT NOT NULL,
  score_a INTEGER,
  score_b INTEGER,
  odds_home DECIMAL(5,2) NOT NULL,
  odds_draw DECIMAL(5,2) NOT NULL,
  odds_away DECIMAL(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('upcoming', 'live', 'finished', 'cancelled')),
  start_time TEXT NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sports_matches_sport ON sports_matches(sport);
CREATE INDEX IF NOT EXISTS idx_sports_matches_status ON sports_matches(status);

-- ============================================================
-- Placed Bets
-- ============================================================
CREATE TABLE IF NOT EXISTS placed_bets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  match_id TEXT NOT NULL REFERENCES sports_matches(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('home', 'draw', 'away')),
  amount INTEGER NOT NULL,
  potential_win INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'won', 'lost', 'cancelled')),
  placed_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_placed_bets_user ON placed_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_placed_bets_match ON placed_bets(match_id);

-- ============================================================
-- User Virtual Items Ownership
-- ============================================================
CREATE TABLE IF NOT EXISTS user_avatar_frames (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frame_id TEXT NOT NULL REFERENCES avatar_frames(id),
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, frame_id)
);

CREATE TABLE IF NOT EXISTS user_entry_effects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effect_id TEXT NOT NULL REFERENCES entry_effects(id),
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, effect_id)
);

CREATE TABLE IF NOT EXISTS user_broadcast_themes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES broadcast_themes(id),
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, theme_id)
);

-- ============================================================
-- PK Battles (Real-time battle data)
-- ============================================================
CREATE TABLE IF NOT EXISTS pk_battles (
  id TEXT PRIMARY KEY,
  host_a_id TEXT NOT NULL REFERENCES users(id),
  host_b_id TEXT NOT NULL REFERENCES users(id),
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  time_remaining INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  win_streak_a INTEGER NOT NULL DEFAULT 0,
  win_streak_b INTEGER NOT NULL DEFAULT 0,
  coins_bet INTEGER NOT NULL DEFAULT 0,
  points_for_win INTEGER NOT NULL DEFAULT 3,
  room_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  ended_at BIGINT
);

-- ============================================================
-- PK Points Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS pk_points_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_losses INTEGER NOT NULL DEFAULT 0,
  total_draws INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  earnings_from_points INTEGER NOT NULL DEFAULT 0,
  current_tier TEXT NOT NULL DEFAULT 'bronze',
  updated_at BIGINT NOT NULL
);

-- ============================================================
-- PK Match History
-- ============================================================
CREATE TABLE IF NOT EXISTS pk_match_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  opponent_id TEXT NOT NULL REFERENCES users(id),
  opponent_name TEXT NOT NULL,
  opponent_avatar TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  points_earned INTEGER NOT NULL DEFAULT 0,
  bonus_earned DECIMAL(5,2) NOT NULL DEFAULT 0,
  coins_wagered INTEGER NOT NULL DEFAULT 0,
  match_id TEXT REFERENCES pk_battles(id),
  timestamp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pk_match_history_user ON pk_match_history(user_id);
CREATE INDEX IF NOT EXISTS idx_pk_match_history_timestamp ON pk_match_history(timestamp DESC);

-- ============================================================
-- Gift Statistics (Computed daily/weekly)
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  week_sent INTEGER NOT NULL DEFAULT 0,
  week_received INTEGER NOT NULL DEFAULT 0,
  month_sent INTEGER NOT NULL DEFAULT 0,
  month_received INTEGER NOT NULL DEFAULT 0,
  top_gifts_sent JSONB NOT NULL DEFAULT '[]',
  top_gifts_received JSONB NOT NULL DEFAULT '[]',
  weekly_history JSONB NOT NULL DEFAULT '[]',
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_gift_stats_user ON gift_stats(user_id);
