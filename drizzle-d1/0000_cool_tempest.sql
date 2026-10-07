CREATE TABLE `apiKeys` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerUserId` integer NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`lastFour` text NOT NULL,
	`merchantAccountId` text,
	`marketplaceId` text,
	`sellerId` text,
	`sellerDisplayName` text,
	`secretHash` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastUsedAt` integer,
	`revokedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apiKeys_secretHash_unique` ON `apiKeys` (`secretHash`);--> statement-breakpoint
CREATE TABLE `merchantAccounts` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplaceId` text NOT NULL,
	`externalSellerId` text NOT NULL,
	`ownerUserId` integer,
	`displayName` text NOT NULL,
	`receivingAddress` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`walletVerifiedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchantAccounts_marketplace_seller_unique` ON `merchantAccounts` (`marketplaceId`,`externalSellerId`);--> statement-breakpoint
CREATE TABLE `ownershipChallenges` (
	`id` text PRIMARY KEY NOT NULL,
	`merchantAccountId` text NOT NULL,
	`marketplaceId` text NOT NULL,
	`sellerId` text NOT NULL,
	`walletAddress` text NOT NULL,
	`message` text NOT NULL,
	`nonceHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ownershipChallenges_nonceHash_unique` ON `ownershipChallenges` (`nonceHash`);--> statement-breakpoint
CREATE UNIQUE INDEX `ownershipChallenges_account_created_unique` ON `ownershipChallenges` (`merchantAccountId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `paymentIntents` (
	`id` text PRIMARY KEY NOT NULL,
	`externalOrderId` text NOT NULL,
	`marketplaceId` text,
	`sellerId` text,
	`merchantAccountId` text,
	`idempotencyKey` text,
	`itemName` text NOT NULL,
	`buyerLabel` text,
	`returnUrl` text,
	`orderContext` text,
	`amountAtomic` text NOT NULL,
	`platformFeeBps` integer DEFAULT 0 NOT NULL,
	`platformFeeAmount` text,
	`merchantPayoutAmount` text,
	`splitContractAddress` text,
	`asset` text DEFAULT 'USDC' NOT NULL,
	`network` text DEFAULT 'arc-testnet' NOT NULL,
	`merchantAddress` text NOT NULL,
	`buyerAddress` text,
	`status` text DEFAULT 'requires_payment' NOT NULL,
	`transactionHash` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paymentIntents_idempotencyKey_unique` ON `paymentIntents` (`idempotencyKey`);--> statement-breakpoint
CREATE TABLE `paymentTransactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paymentIntentId` text NOT NULL,
	`transactionHash` text NOT NULL,
	`fromAddress` text NOT NULL,
	`toAddress` text NOT NULL,
	`treasuryAddress` text,
	`tokenAddress` text NOT NULL,
	`amountAtomic` text NOT NULL,
	`platformFeeAmount` text,
	`merchantPayoutAmount` text,
	`chainId` integer NOT NULL,
	`finalizedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paymentTransactions_paymentIntentId_unique` ON `paymentTransactions` (`paymentIntentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `paymentTransactions_transactionHash_unique` ON `paymentTransactions` (`transactionHash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`profileImage` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastSignedIn` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE TABLE `walletLoginChallenges` (
	`id` text PRIMARY KEY NOT NULL,
	`walletAddress` text NOT NULL,
	`message` text NOT NULL,
	`nonceHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `walletLoginChallenges_nonceHash_unique` ON `walletLoginChallenges` (`nonceHash`);--> statement-breakpoint
CREATE TABLE `webhookDeliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`endpointId` text NOT NULL,
	`eventId` text NOT NULL,
	`eventType` text NOT NULL,
	`paymentIntentId` text NOT NULL,
	`payload` text NOT NULL,
	`signature` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` integer,
	`lastError` text,
	`deliveredAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhookDeliveries_endpoint_event_unique` ON `webhookDeliveries` (`endpointId`,`eventId`);--> statement-breakpoint
CREATE TABLE `webhookEndpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplaceId` text NOT NULL,
	`merchantAccountId` text,
	`ownerUserId` integer NOT NULL,
	`url` text NOT NULL,
	`urlHash` text NOT NULL,
	`secretCiphertext` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhookEndpoints_marketplace_url_hash_unique` ON `webhookEndpoints` (`marketplaceId`,`urlHash`);
--> statement-breakpoint
-- For the direct-to-seller, zero-fee Testnet pilot only. Application code must
-- verify the Arc receipt before inserting a payment transaction. This trigger
-- is the database-side guard against a stale or inconsistent intent.
CREATE TRIGGER `paymentTransactions_validate_insert`
BEFORE INSERT ON `paymentTransactions`
BEGIN
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `paymentIntents`
		WHERE `id` = NEW.`paymentIntentId`
			AND `status` IN ('requires_payment', 'submitted', 'verifying', 'expired')
			AND `transactionHash` IS NULL
			AND `amountAtomic` = NEW.`amountAtomic`
			AND lower(`merchantAddress`) = lower(NEW.`toAddress`)
			AND `platformFeeBps` = 0
			AND COALESCE(NEW.`platformFeeAmount`, '0') = '0'
			AND COALESCE(NEW.`merchantPayoutAmount`, NEW.`amountAtomic`) = NEW.`amountAtomic`
			AND NEW.`treasuryAddress` IS NULL
			AND NEW.`chainId` = 5042002
			AND lower(NEW.`tokenAddress`) = '0x3600000000000000000000000000000000000000'
	) THEN RAISE(ABORT, 'payment_intent_claim_conflict') END;
END;
--> statement-breakpoint
CREATE TRIGGER `paymentTransactions_settle_intent`
AFTER INSERT ON `paymentTransactions`
BEGIN
	UPDATE `paymentIntents` SET
		`status` = 'succeeded',
		`buyerAddress` = NEW.`fromAddress`,
		`transactionHash` = NEW.`transactionHash`,
		`platformFeeAmount` = COALESCE(NEW.`platformFeeAmount`, '0'),
		`merchantPayoutAmount` = COALESCE(NEW.`merchantPayoutAmount`, NEW.`amountAtomic`),
		`updatedAt` = unixepoch() * 1000
	WHERE `id` = NEW.`paymentIntentId`;
END;
--> statement-breakpoint
-- Consuming a verified wallet challenge and activating the seller must be one
-- state transition. The application must still verify the wallet signature and
-- current owner before issuing the conditional UPDATE of usedAt.
CREATE TRIGGER `ownershipChallenges_activate_seller`
AFTER UPDATE OF `usedAt` ON `ownershipChallenges`
WHEN OLD.`usedAt` IS NULL AND NEW.`usedAt` IS NOT NULL
BEGIN
	SELECT CASE WHEN NEW.`usedAt` > NEW.`expiresAt`
		THEN RAISE(ABORT, 'ownership_challenge_expired') END;
	UPDATE `merchantAccounts` SET
		`status` = 'active',
		`walletVerifiedAt` = NEW.`usedAt`,
		`updatedAt` = NEW.`usedAt`
	WHERE `id` = NEW.`merchantAccountId`
		AND `marketplaceId` = NEW.`marketplaceId`
		AND `externalSellerId` = NEW.`sellerId`
		AND lower(`receivingAddress`) = lower(NEW.`walletAddress`)
		AND `status` IN ('pending', 'active');
	SELECT CASE WHEN changes() != 1
		THEN RAISE(ABORT, 'ownership_challenge_account_mismatch') END;
END;
