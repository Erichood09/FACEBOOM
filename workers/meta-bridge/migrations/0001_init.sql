CREATE TABLE IF NOT EXISTS meta_conversations (
  psid TEXT PRIMARY KEY,
  sender_name TEXT NOT NULL DEFAULT '',
  last_message TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS meta_messages (
  message_id TEXT PRIMARY KEY,
  psid TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'received'
);

CREATE INDEX IF NOT EXISTS idx_meta_messages_psid_created
  ON meta_messages(psid, created_at DESC);

CREATE TABLE IF NOT EXISTS meta_comments (
  comment_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL DEFAULT '',
  sender_id TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  message_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  reply_text TEXT NOT NULL DEFAULT '',
  replied_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_meta_comments_created
  ON meta_comments(created_at DESC);
