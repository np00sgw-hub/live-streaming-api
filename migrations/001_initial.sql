-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male','female')),
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  vip_level INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  diamonds INTEGER NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0,
  following INTEGER NOT NULL DEFAULT 0,
  friends INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_agency BOOLEAN NOT NULL DEFAULT FALSE,
  agency_name TEXT NOT NULL DEFAULT '',
  special_id TEXT NOT NULL DEFAULT '',
  frame_url TEXT NOT NULL DEFAULT '',
  entry_effect TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  last_login BIGINT NOT NULL,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- Transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('topup','gift_sent','gift_received','vip_purchase','withdrawal','admin_credit','admin_debit','diamond_exchange')),
  amount INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','pending','failed')),
  timestamp BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- Withdrawal Requests
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  account_info TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at BIGINT NOT NULL,
  processed_at BIGINT,
  processed_by TEXT,
  rejection_reason TEXT
);

-- ============================================================
-- Gifts catalogue
-- ============================================================
CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  price INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('popular','luxury','romantic','funny')),
  is_animated BOOLEAN NOT NULL DEFAULT FALSE,
  svga_url TEXT NOT NULL DEFAULT '',
  sound_url TEXT NOT NULL DEFAULT '',
  sound_duration INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- Gift Transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_transactions (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id),
  receiver_id TEXT NOT NULL REFERENCES users(id),
  gift_id TEXT NOT NULL,
  gift_name TEXT NOT NULL,
  gift_icon TEXT NOT NULL,
  gift_price INTEGER NOT NULL,
  count INTEGER NOT NULL,
  total_value INTEGER NOT NULL,
  room_id TEXT NOT NULL DEFAULT '',
  timestamp BIGINT NOT NULL
);

-- ============================================================
-- Messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id),
  receiver_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','gift','image','system','broadcast')),
  gift_icon TEXT NOT NULL DEFAULT '',
  gift_name TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp BIGINT NOT NULL
);

-- ============================================================
-- Friendships
-- ============================================================
CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_a, user_b)
);

-- ============================================================
-- Friend Requests
-- ============================================================
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id),
  to_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  timestamp BIGINT NOT NULL
);

-- ============================================================
-- Streams
-- ============================================================
CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  thumbnail TEXT NOT NULL DEFAULT '',
  viewer_count INTEGER NOT NULL DEFAULT 0,
  is_live BOOLEAN NOT NULL DEFAULT TRUE,
  category TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_pk BOOLEAN NOT NULL DEFAULT FALSE,
  country TEXT NOT NULL DEFAULT '',
  gift_score INTEGER NOT NULL DEFAULT 0,
  started_at BIGINT NOT NULL,
  ended_at BIGINT
);

-- ============================================================
-- Party Rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS party_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_id TEXT NOT NULL REFERENCES users(id),
  cover_image TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 1,
  max_seats INTEGER NOT NULL DEFAULT 8,
  type TEXT NOT NULL DEFAULT 'audio' CHECK (type IN ('audio','video')),
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT NOT NULL DEFAULT '',
  background_theme TEXT NOT NULL DEFAULT 'cosmic',
  welcome_message TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL
);

-- ============================================================
-- App Config (single-row table)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name TEXT NOT NULL DEFAULT 'LiveApp',
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  min_app_version TEXT NOT NULL DEFAULT '1.0.0',
  max_stream_duration INTEGER NOT NULL DEFAULT 240,
  gift_commission_rate FLOAT NOT NULL DEFAULT 0.6,
  min_withdrawal_amount INTEGER NOT NULL DEFAULT 100,
  pm_cost_non_friend INTEGER NOT NULL DEFAULT 10,
  zego_app_id TEXT NOT NULL DEFAULT '',
  zego_app_sign TEXT NOT NULL DEFAULT '',
  zego_server_url TEXT NOT NULL DEFAULT '',
  zego_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  announcement_text TEXT NOT NULL DEFAULT '',
  announcement_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- Audit Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT NOT NULL,
  timestamp BIGINT NOT NULL
);

-- ============================================================
-- Seed default admin user
-- ============================================================
INSERT INTO users (
  id, name, email, password_hash, avatar, level, gender,
  is_vip, vip_level, coins, diamonds, followers, following,
  friends, visitors, bio, is_admin, is_agency, agency_name,
  special_id, frame_url, entry_effect, created_at, last_login,
  is_banned, ban_reason
) VALUES (
  'u_admin', 'Admin', 'admin@app.com', 'hashed_1iqxm4_8',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
  99, 'male', TRUE, 4, 999999, 99999, 100000, 0, 0, 0,
  'Platform Administrator', TRUE, FALSE, '', '000000001', '', '',
  extract(epoch from now())::bigint * 1000,
  extract(epoch from now())::bigint * 1000,
  FALSE, ''
) ON CONFLICT (id) DO NOTHING;

-- Seed app_config row
INSERT INTO app_config (
  id, app_name, maintenance_mode, min_app_version, max_stream_duration,
  gift_commission_rate, min_withdrawal_amount, pm_cost_non_friend,
  zego_app_id, zego_app_sign, zego_server_url, zego_enabled,
  announcement_text, announcement_enabled
) VALUES (
  1, 'LiveApp', FALSE, '1.0.0', 240,
  0.6, 100, 10,
  '945579812', '92c951b810aad076c7ccc636fbd672d7e81b2d4',
  'wss://webliveroom945579812-api.coolzcloud.com/ws', TRUE,
  '', FALSE
) ON CONFLICT (id) DO NOTHING;

-- Seed default gifts
INSERT INTO gifts (id, name, icon, price, category, is_animated, svga_url, sound_url, sound_duration, is_active, created_at) VALUES
  ('g1',  'Rose',     '🌹', 1,     'popular',  FALSE, '', '', 0,  TRUE, extract(epoch from now())::bigint * 1000),
  ('g2',  'Heart',    '❤️', 5,     'romantic', FALSE, '', '', 0,  TRUE, extract(epoch from now())::bigint * 1000),
  ('g3',  'Star',     '⭐', 10,    'popular',  FALSE, '', '', 0,  TRUE, extract(epoch from now())::bigint * 1000),
  ('g4',  'Diamond',  '💎', 100,   'luxury',   TRUE,  '', '', 10, TRUE, extract(epoch from now())::bigint * 1000),
  ('g5',  'Crown',    '👑', 500,   'luxury',   TRUE,  '', '', 12, TRUE, extract(epoch from now())::bigint * 1000),
  ('g6',  'Rocket',   '🚀', 1000,  'luxury',   TRUE,  '', '', 15, TRUE, extract(epoch from now())::bigint * 1000),
  ('g7',  'Kiss',     '💋', 20,    'romantic', FALSE, '', '', 0,  TRUE, extract(epoch from now())::bigint * 1000),
  ('g8',  'Fire',     '🔥', 50,    'popular',  FALSE, '', '', 0,  TRUE, extract(epoch from now())::bigint * 1000),
  ('g9',  'Car',      '🏎️', 5000,  'luxury',   TRUE,  '', '', 13, TRUE, extract(epoch from now())::bigint * 1000),
  ('g10', 'Castle',   '🏰', 10000, 'luxury',   TRUE,  '', '', 15, TRUE, extract(epoch from now())::bigint * 1000),
  ('g11', 'Laugh',    '😂', 2,     'funny',    FALSE, '', '', 0,  TRUE, extract(epoch from now())::bigint * 1000),
  ('g12', 'Bouquet',  '💐', 200,   'romantic', TRUE,  '', '', 10, TRUE, extract(epoch from now())::bigint * 1000),
  ('g13', 'Ring',     '💍', 2000,  'romantic', TRUE,  '', '', 12, TRUE, extract(epoch from now())::bigint * 1000),
  ('g14', 'Yacht',    '🛥️', 20000, 'luxury',   TRUE,  '', '', 15, TRUE, extract(epoch from now())::bigint * 1000),
  ('g15', 'Planet',   '🪐', 50000, 'luxury',   TRUE,  '', '', 14, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;