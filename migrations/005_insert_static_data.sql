-- =============================================================================
-- Static Data Insert Migration
-- This migration populates the static data tables with data from the frontend mocks
-- =============================================================================

-- ============================================================
-- VIP Packages
-- ============================================================
INSERT INTO vip_packages (id, name, level, price, duration_days, perks, color, is_active, created_at) VALUES
  ('vip1', 'Silver VIP', 1, 500, 30, ARRAY['Silver Badge', 'Custom Entry', 'Priority Chat', 'Exclusive Emojis'], '#C0C0C0', TRUE, extract(epoch from now())::bigint * 1000),
  ('vip2', 'Gold VIP', 2, 2000, 30, ARRAY['Gold Badge', 'Animated Entry', 'VIP Frame', 'Bonus Coins', 'Name Color'], '#FFD700', TRUE, extract(epoch from now())::bigint * 1000),
  ('vip3', 'Diamond VIP', 3, 5000, 30, ARRAY['Diamond Badge', 'Premium Entry', 'Exclusive Frame', '2x Bonus', 'Custom ID', 'Priority Support'], '#00D4FF', TRUE, extract(epoch from now())::bigint * 1000),
  ('vip4', 'Crown VIP', 4, 15000, 30, ARRAY['Crown Badge', 'Royal Entry', 'Legendary Frame', '3x Bonus', 'Custom ID', 'Dedicated Manager', 'All Emojis'], '#FF2D55', TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Top-up Packages
-- ============================================================
INSERT INTO topup_packages (id, coins, price, bonus, is_popular, is_active, sort_order, created_at) VALUES
  ('p1', 60, 0.99, 0, FALSE, TRUE, 1, extract(epoch from now())::bigint * 1000),
  ('p2', 300, 4.99, 15, FALSE, TRUE, 2, extract(epoch from now())::bigint * 1000),
  ('p3', 680, 9.99, 50, TRUE, TRUE, 3, extract(epoch from now())::bigint * 1000),
  ('p4', 1580, 19.99, 150, FALSE, TRUE, 4, extract(epoch from now())::bigint * 1000),
  ('p5', 3280, 39.99, 400, FALSE, TRUE, 5, extract(epoch from now())::bigint * 1000),
  ('p6', 6880, 79.99, 1000, FALSE, TRUE, 6, extract(epoch from now())::bigint * 1000),
  ('p7', 16880, 199.99, 3000, FALSE, TRUE, 7, extract(epoch from now())::bigint * 1000),
  ('p8', 34880, 399.99, 8000, FALSE, TRUE, 8, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Avatar Frames
-- ============================================================
INSERT INTO avatar_frames (id, name, preview, price, rarity, colors, is_animated, required_vip_level, is_active, created_at) VALUES
  ('af1', 'Neon Pulse', '💠', 200, 'common', ARRAY['#00D4FF', '#0A84FF'], FALSE, 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('af2', 'Golden Ring', '🔆', 500, 'rare', ARRAY['#FFD700', '#FF9500'], FALSE, 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('af3', 'Flame Halo', '🔥', 1200, 'epic', ARRAY['#FF2D55', '#FF6B00'], TRUE, 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('af4', 'Diamond Crown', '💎', 3000, 'legendary', ARRAY['#A594FF', '#7B61FF'], TRUE, 3, TRUE, extract(epoch from now())::bigint * 1000),
  ('af5', 'Cherry Blossom', '🌸', 350, 'common', ARRAY['#FF69B4', '#FFB6C1'], FALSE, 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('af6', 'Thunder Ring', '⚡', 800, 'rare', ARRAY['#FFD700', '#FFA500'], TRUE, 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('af7', 'Ice Crystal', '❄️', 1500, 'epic', ARRAY['#E0F7FA', '#80DEEA'], TRUE, 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('af8', 'Galaxy Aura', '🌌', 5000, 'legendary', ARRAY['#7B61FF', '#FF2D55'], TRUE, 4, TRUE, extract(epoch from now())::bigint * 1000),
  ('af9', 'Emerald Vine', '🍀', 600, 'rare', ARRAY['#34C759', '#2E7D32'], FALSE, 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('af10', 'Sunset Glow', '🌅', 900, 'rare', ARRAY['#FF9500', '#FF2D55'], TRUE, 1, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Entry Effects
-- ============================================================
INSERT INTO entry_effects (id, name, preview, price, rarity, colors, description, required_vip_level, is_active, created_at) VALUES
  ('ee1', 'Spark Shower', '✨', 300, 'common', ARRAY['#FFD700', '#FFA500'], 'Golden sparks rain down', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee2', 'Lightning Bolt', '⚡', 800, 'rare', ARRAY['#0A84FF', '#00D4FF'], 'Electric bolt entrance', 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee3', 'Phoenix Rise', '🔥', 2000, 'epic', ARRAY['#FF2D55', '#FF6B00'], 'Rise from flames', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee4', 'Royal Arrival', '👑', 5000, 'legendary', ARRAY['#FFD700', '#7B61FF'], 'A crown descends with fanfare', 3, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee5', 'Petal Storm', '🌸', 400, 'common', ARRAY['#FF69B4', '#FFB6C1'], 'Cherry blossoms swirl around', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee6', 'Ice Breaker', '🧊', 1000, 'rare', ARRAY['#80DEEA', '#E0F7FA'], 'Ice shatters on entry', 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee7', 'Dragon Roar', '🐉', 3500, 'epic', ARRAY['#34C759', '#FFD700'], 'A dragon circles the screen', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee8', 'Supernova', '💥', 8000, 'legendary', ARRAY['#FF2D55', '#7B61FF'], 'Cosmic explosion entrance', 4, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee9', 'Bubble Pop', '🫧', 250, 'common', ARRAY['#0A84FF', '#5AC8FA'], 'Colorful bubbles pop', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('ee10', 'Shadow Step', '🌑', 1200, 'rare', ARRAY['#2C2C2E', '#5C5C78'], 'Emerge from the shadows', 1, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Broadcast Themes
-- ============================================================
INSERT INTO broadcast_themes (id, name, preview, price, rarity, colors, gradient_colors, description, required_vip_level, is_active, created_at) VALUES
  ('bt1', 'Midnight Sky', '🌌', 300, 'common', ARRAY['#1A0A30', '#0D0D2B'], ARRAY['#1A0A30', '#0D0D2B', '#0B0B1A'], 'Deep space atmosphere', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt2', 'Ocean Wave', '🌊', 500, 'rare', ARRAY['#0077B6', '#00B4D8'], ARRAY['#023E8A', '#0077B6', '#0B0B1A'], 'Calm blue ocean vibes', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt3', 'Sunset Blaze', '🌇', 800, 'rare', ARRAY['#FF6B35', '#FF2D55'], ARRAY['#FF6B35', '#C2185B', '#1A0A20'], 'Warm sunset gradient', 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt4', 'Neon City', '🏙️', 1200, 'epic', ARRAY['#FF2D55', '#7B61FF'], ARRAY['#2D0040', '#7B61FF', '#FF2D55'], 'Cyberpunk neon glow', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt5', 'Forest Mist', '🌲', 400, 'common', ARRAY['#2E7D32', '#1B5E20'], ARRAY['#1B3A20', '#2E7D32', '#0B0B1A'], 'Peaceful forest ambiance', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt6', 'Aurora Borealis', '🌈', 2500, 'epic', ARRAY['#00E676', '#00BCD4'], ARRAY['#004D40', '#00E676', '#1A237E'], 'Northern lights dance', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt7', 'Royal Purple', '👑', 5000, 'legendary', ARRAY['#9C27B0', '#FFD700'], ARRAY['#4A0072', '#9C27B0', '#FFD700'], 'Majestic royal atmosphere', 3, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt8', 'Cherry Blossom', '🌸', 600, 'rare', ARRAY['#F48FB1', '#F06292'], ARRAY['#4A1032', '#F06292', '#1A0A20'], 'Sakura petal ambiance', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt9', 'Volcanic Fire', '🌋', 3500, 'epic', ARRAY['#FF3D00', '#FF6D00'], ARRAY['#BF360C', '#FF3D00', '#1A0505'], 'Fiery eruption background', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('bt10', 'Cosmic Galaxy', '🪐', 8000, 'legendary', ARRAY['#7B61FF', '#00D4FF'], ARRAY['#0D0040', '#7B61FF', '#00D4FF'], 'Deep galaxy exploration', 4, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Emoji Sets
-- ============================================================
INSERT INTO emoji_sets (id, name, icon, is_enabled, sort_order, created_at) VALUES
  ('eset_love', 'Love', '❤️', TRUE, 0, extract(epoch from now())::bigint * 1000),
  ('eset_fun', 'Fun', '🎉', TRUE, 1, extract(epoch from now())::bigint * 1000),
  ('eset_cute', 'Cute', '🐱', TRUE, 2, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Emojis
-- ============================================================
INSERT INTO emojis (id, set_id, name, preview, format, sort_order, is_active, created_at) VALUES
  -- Love Set
  ('em_love_1', 'eset_love', 'Heart', '❤️', 'gif', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_love_2', 'eset_love', 'Kiss', '😘', 'gif', 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_love_3', 'eset_love', 'Heart Eyes', '😍', 'gif', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_love_4', 'eset_love', 'Hug', '🤗', 'gif', 3, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_love_5', 'eset_love', 'Blush', '☺️', 'gif', 4, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_love_6', 'eset_love', 'Sparkle Heart', '💖', 'gif', 5, TRUE, extract(epoch from now())::bigint * 1000),
  -- Fun Set
  ('em_fun_1', 'eset_fun', 'Party', '🎉', 'gif', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_fun_2', 'eset_fun', 'Fire', '🔥', 'gif', 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_fun_3', 'eset_fun', 'LOL', '🤣', 'gif', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_fun_4', 'eset_fun', 'Cool', '😎', 'gif', 3, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_fun_5', 'eset_fun', 'Clap', '👏', 'gif', 4, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_fun_6', 'eset_fun', 'Rocket', '🚀', 'gif', 5, TRUE, extract(epoch from now())::bigint * 1000),
  -- Cute Set
  ('em_cute_1', 'eset_cute', 'Cat', '🐱', 'gif', 0, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_cute_2', 'eset_cute', 'Puppy', '🐶', 'gif', 1, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_cute_3', 'eset_cute', 'Bear', '🧸', 'gif', 2, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_cute_4', 'eset_cute', 'Bunny', '🐰', 'gif', 3, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_cute_5', 'eset_cute', 'Star', '⭐', 'gif', 4, TRUE, extract(epoch from now())::bigint * 1000),
  ('em_cute_6', 'eset_cute', 'Rainbow', '🌈', 'gif', 5, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PK Reward Tiers
-- ============================================================
INSERT INTO pk_reward_tiers (tier, label, min_points, bonus_multiplier, award_bonus, color, icon, is_active) VALUES
  ('bronze', 'Bronze', 0, 1.0, 0, '#CD7F32', '🥉', TRUE),
  ('silver', 'Silver', 50, 1.2, 500, '#C0C0C0', '🥈', TRUE),
  ('gold', 'Gold', 150, 1.5, 2000, '#FFD700', '🥇', TRUE),
  ('platinum', 'Platinum', 400, 2.0, 5000, '#E5E4E2', '💎', TRUE),
  ('diamond', 'Diamond', 1000, 3.0, 15000, '#B9F2FF', '👑', TRUE),
  ('legend', 'Legend', 3000, 5.0, 50000, '#FF2D55', '🏆', TRUE)
ON CONFLICT (tier) DO NOTHING;

-- ============================================================
-- Cashback Gifts
-- ============================================================
INSERT INTO cashback_gifts (id, name, icon, price, type, coin_pool, is_active, created_at) VALUES
  ('cb_g1', 'Gold Bag', '💰', 500, 'local', 300, TRUE, extract(epoch from now())::bigint * 1000),
  ('cb_g2', 'Diamond Bag', '💎', 2000, 'global', 1500, TRUE, extract(epoch from now())::bigint * 1000),
  ('cb_g3', 'Royal Chest', '👑', 5000, 'global', 4000, TRUE, extract(epoch from now())::bigint * 1000),
  ('cb_g4', 'Lucky Pouch', '🍀', 200, 'local', 120, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Audio Tracks
-- ============================================================
INSERT INTO audio_tracks (id, title, artist, duration, cover_url, audio_url, genre, is_uploaded, is_active, created_at) VALUES
  ('track_1', 'Chill Vibes', 'LoFi Beats', 185, 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'Lo-Fi', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_2', 'Night Drive', 'Synthwave Dreams', 214, 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'Synthwave', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_3', 'Party Mode', 'DJ Electric', 198, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'EDM', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_4', 'Sunset Groove', 'Tropical House', 232, 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'Tropical', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_5', 'Bass Drop', 'Heavy Beats', 176, 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 'Bass', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_6', 'Acoustic Morning', 'Soft Strings', 203, 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 'Acoustic', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_7', 'Urban Flow', 'Street Beats', 191, 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 'Hip-Hop', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_8', 'Deep Focus', 'Ambient Sounds', 245, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 'Ambient', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_9', 'Bollywood Beats', 'Desi Vibes', 217, 'https://images.unsplash.com/photo-1504680177321-2e6a879aac86?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', 'Bollywood', FALSE, TRUE, extract(epoch from now())::bigint * 1000),
  ('track_10', 'Jazz Cafe', 'Smooth Jazz', 228, 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200&h=200&fit=crop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', 'Jazz', FALSE, TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Sports Matches (Football)
-- ============================================================
INSERT INTO sports_matches (id, sport, league, league_icon, team_a_name, team_a_short_name, team_a_logo, team_a_color, team_b_name, team_b_short_name, team_b_logo, team_b_color, score_a, score_b, odds_home, odds_draw, odds_away, status, start_time, is_featured, created_at) VALUES
  ('fm_1', 'football', 'Premier League', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester City', 'MCI', '⚽', '#6CABDD', 'Arsenal', 'ARS', '⚽', '#EF0107', NULL, NULL, 1.85, 3.40, 4.20, 'upcoming', 'Today, 20:00', TRUE, extract(epoch from now())::bigint * 1000),
  ('fm_2', 'football', 'La Liga', '🇪🇸', 'Real Madrid', 'RMA', '⚽', '#FEBE10', 'Barcelona', 'BAR', '⚽', '#A50044', 2, 1, 2.10, 3.25, 3.50, 'live', '65''', TRUE, extract(epoch from now())::bigint * 1000),
  ('fm_3', 'football', 'Serie A', '🇮🇹', 'AC Milan', 'MIL', '⚽', '#FB090B', 'Inter Milan', 'INT', '⚽', '#010E80', NULL, NULL, 2.50, 3.10, 2.90, 'upcoming', 'Tomorrow, 18:45', FALSE, extract(epoch from now())::bigint * 1000),
  ('fm_4', 'football', 'Bundesliga', '🇩🇪', 'Bayern Munich', 'BAY', '⚽', '#DC052D', 'Dortmund', 'BVB', '⚽', '#FDE100', 3, 3, 1.55, 4.00, 5.50, 'live', '78''', FALSE, extract(epoch from now())::bigint * 1000),
  ('fm_5', 'football', 'Ligue 1', '🇫🇷', 'PSG', 'PSG', '⚽', '#004170', 'Marseille', 'OM', '⚽', '#2FAEE0', 1, 0, 1.30, 5.50, 8.00, 'finished', 'FT', FALSE, extract(epoch from now())::bigint * 1000),
  ('fm_6', 'football', 'Champions League', '🏆', 'Liverpool', 'LIV', '⚽', '#C8102E', 'Juventus', 'JUV', '⚽', '#000000', NULL, NULL, 1.95, 3.60, 3.80, 'upcoming', 'Wed, 21:00', TRUE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Sports Matches (Cricket)
-- ============================================================
INSERT INTO sports_matches (id, sport, league, league_icon, team_a_name, team_a_short_name, team_a_logo, team_a_color, team_b_name, team_b_short_name, team_b_logo, team_b_color, score_a, score_b, odds_home, odds_draw, odds_away, status, start_time, is_featured, created_at) VALUES
  ('cm_1', 'cricket', 'IPL', '🏏', 'Mumbai Indians', 'MI', '🏏', '#004BA0', 'Chennai Super Kings', 'CSK', '🏏', '#FFCB05', NULL, NULL, 1.90, 8.00, 1.95, 'live', '2nd Inn', TRUE, extract(epoch from now())::bigint * 1000),
  ('cm_2', 'cricket', 'IPL', '🏏', 'Royal Challengers', 'RCB', '🏏', '#EC1C24', 'Kolkata Knight Riders', 'KKR', '🏏', '#3A225D', 186, 142, 1.45, 12.0, 2.80, 'live', '16.3 ov', FALSE, extract(epoch from now())::bigint * 1000),
  ('cm_3', 'cricket', 'World Cup', '🌍', 'India', 'IND', '🏏', '#0066B3', 'Australia', 'AUS', '🏏', '#FFCD00', NULL, NULL, 1.75, 15.0, 2.15, 'upcoming', 'Tomorrow, 14:00', TRUE, extract(epoch from now())::bigint * 1000),
  ('cm_4', 'cricket', 'T20 Blast', '🇬🇧', 'Delhi Capitals', 'DC', '🏏', '#17479E', 'Rajasthan Royals', 'RR', '🏏', '#EA1A85', NULL, NULL, 2.20, 10.0, 1.70, 'upcoming', 'Today, 19:30', FALSE, extract(epoch from now())::bigint * 1000),
  ('cm_5', 'cricket', 'IPL', '🏏', 'Sunrisers Hyderabad', 'SRH', '🏏', '#FF822A', 'Punjab Kings', 'PBKS', '🏏', '#ED1B24', 205, 189, 1.60, 9.00, 2.40, 'finished', 'FT', FALSE, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;
