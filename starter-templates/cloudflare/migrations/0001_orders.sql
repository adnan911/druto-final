CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  accessHash TEXT NOT NULL UNIQUE,
  productId TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
  title TEXT NOT NULL,
  amountAtomic TEXT NOT NULL,
  marketplaceId TEXT NOT NULL,
  sellerId TEXT NOT NULL,
  merchantAccountId TEXT NOT NULL,
  recipient TEXT NOT NULL,
  intentId TEXT UNIQUE,
  checkoutUrl TEXT,
  expiresAt INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
  transactionHash TEXT UNIQUE,
  createdAt INTEGER NOT NULL,
  paidAt INTEGER
);
CREATE TABLE acceptedEvents (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL REFERENCES orders(id),
  intentId TEXT NOT NULL,
  amountAtomic TEXT NOT NULL,
  marketplaceId TEXT NOT NULL,
  sellerId TEXT NOT NULL,
  merchantAccountId TEXT NOT NULL,
  recipient TEXT NOT NULL,
  transactionHash TEXT NOT NULL,
  acceptedAt INTEGER NOT NULL
);
CREATE TABLE fulfillmentJobs (
  orderId TEXT PRIMARY KEY REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','complete')),
  createdAt INTEGER NOT NULL
);
-- All validation, event insertion, paid state and fulfillment enqueue are one
-- SQLite statement/transaction. A failure rolls back the entire settlement.
CREATE TRIGGER validate_event BEFORE INSERT ON acceptedEvents
WHEN NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.id=NEW.orderId AND o.intentId=NEW.intentId
  AND o.amountAtomic=NEW.amountAtomic AND o.marketplaceId=NEW.marketplaceId
  AND o.sellerId=NEW.sellerId AND o.merchantAccountId=NEW.merchantAccountId
  AND o.recipient=NEW.recipient
  AND (o.transactionHash IS NULL OR o.transactionHash=NEW.transactionHash)
)
BEGIN SELECT RAISE(ABORT,'Order/event mismatch'); END;
CREATE TRIGGER settle_event AFTER INSERT ON acceptedEvents
BEGIN
  UPDATE orders SET status='paid',transactionHash=NEW.transactionHash,paidAt=NEW.acceptedAt
    WHERE id=NEW.orderId AND status='pending';
  INSERT INTO fulfillmentJobs(orderId,createdAt) VALUES(NEW.orderId,NEW.acceptedAt)
    ON CONFLICT(orderId) DO NOTHING;
END;
