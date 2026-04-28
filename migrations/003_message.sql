CREATE INDEX IF NOT EXISTS idx_messages_sender_time
ON messages(sender_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_time
ON messages(receiver_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a
ON friendships(user_a);

CREATE INDEX IF NOT EXISTS idx_friendships_user_b
ON friendships(user_b);