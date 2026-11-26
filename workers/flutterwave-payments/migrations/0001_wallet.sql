CREATE TABLE IF NOT EXISTS wallet_packages (
  package_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_orders (
  tx_ref TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  package_id TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  provider_transaction_id TEXT UNIQUE,
  checkout_url TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS payment_orders_uid_created
  ON payment_orders (uid, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  ledger_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  tx_ref TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('topup', 'adjustment', 'reversal')),
  coins_delta INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wallet_ledger_uid_created
  ON wallet_ledger (uid, created_at DESC);
