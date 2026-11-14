CREATE TABLE `apiKeys` (
	`id` varchar(32) NOT NULL,
	`ownerUserId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`prefix` varchar(32) NOT NULL,
	`lastFour` varchar(4) NOT NULL,
	`merchantAccountId` varchar(32),
	`marketplaceId` varchar(128),
	`sellerId` varchar(128),
	`sellerDisplayName` varchar(255),
	`secretHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	`revokedAt` timestamp,
	CONSTRAINT `apiKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiKeys_secretHash_unique` UNIQUE(`secretHash`)
);
--> statement-breakpoint
CREATE TABLE `merchantAccounts` (
	`id` varchar(32) NOT NULL,
	`marketplaceId` varchar(128) NOT NULL,
	`externalSellerId` varchar(128) NOT NULL,
	`ownerUserId` int,
	`displayName` varchar(255) NOT NULL,
	`receivingAddress` varchar(42) NOT NULL,
	`status` enum('pending','active','disabled') NOT NULL DEFAULT 'pending',
	`walletVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchantAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchantAccounts_marketplace_seller_unique` UNIQUE(`marketplaceId`,`externalSellerId`)
);
--> statement-breakpoint
CREATE TABLE `ownershipChallenges` (
	`id` varchar(32) NOT NULL,
	`merchantAccountId` varchar(32) NOT NULL,
	`marketplaceId` varchar(128) NOT NULL,
	`sellerId` varchar(128) NOT NULL,
	`walletAddress` varchar(42) NOT NULL,
	`message` text NOT NULL,
	`nonceHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ownershipChallenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `ownershipChallenges_nonceHash_unique` UNIQUE(`nonceHash`),
	CONSTRAINT `ownershipChallenges_account_created_unique` UNIQUE(`merchantAccountId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `paymentIntents` (
	`id` varchar(32) NOT NULL,
	`externalOrderId` varchar(128) NOT NULL,
	`marketplaceId` varchar(128),
	`sellerId` varchar(128),
	`merchantAccountId` varchar(32),
	`idempotencyKey` varchar(128),
	`itemName` varchar(255) NOT NULL,
	`buyerLabel` varchar(255),
	`returnUrl` varchar(2048),
	`orderContext` text,
	`amountAtomic` varchar(64) NOT NULL,
	`platformFeeBps` int DEFAULT 200,
	`platformFeeAmount` varchar(64),
	`merchantPayoutAmount` varchar(64),
	`splitContractAddress` varchar(42),
	`asset` varchar(16) NOT NULL DEFAULT 'USDC',
	`network` varchar(32) NOT NULL DEFAULT 'arc-testnet',
	`merchantAddress` varchar(42) NOT NULL,
	`buyerAddress` varchar(42),
	`status` enum('requires_payment','submitted','verifying','succeeded','failed','expired') NOT NULL DEFAULT 'requires_payment',
	`transactionHash` varchar(66),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentIntents_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentIntents_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `paymentTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentIntentId` varchar(32) NOT NULL,
	`transactionHash` varchar(66) NOT NULL,
	`fromAddress` varchar(42) NOT NULL,
	`toAddress` varchar(42) NOT NULL,
	`treasuryAddress` varchar(42),
	`tokenAddress` varchar(42) NOT NULL,
	`amountAtomic` varchar(64) NOT NULL,
	`platformFeeAmount` varchar(64),
	`merchantPayoutAmount` varchar(64),
	`chainId` int NOT NULL,
	`finalizedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentTransactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentTransactions_transactionHash_unique` UNIQUE(`transactionHash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`profileImage` text,
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `walletLoginChallenges` (
	`id` varchar(32) NOT NULL,
	`walletAddress` varchar(42) NOT NULL,
	`message` text NOT NULL,
	`nonceHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `walletLoginChallenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `walletLoginChallenges_nonceHash_unique` UNIQUE(`nonceHash`)
);
--> statement-breakpoint
CREATE TABLE `webhookDeliveries` (
	`id` varchar(32) NOT NULL,
	`endpointId` varchar(32) NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`paymentIntentId` varchar(32) NOT NULL,
	`payload` text NOT NULL,
	`signature` varchar(255) NOT NULL,
	`status` enum('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp,
	`lastError` text,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhookDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhookDeliveries_endpoint_event_unique` UNIQUE(`endpointId`,`eventId`)
);
--> statement-breakpoint
CREATE TABLE `webhookEndpoints` (
	`id` varchar(32) NOT NULL,
	`marketplaceId` varchar(128) NOT NULL,
	`merchantAccountId` varchar(32),
	`ownerUserId` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`urlHash` varchar(64) GENERATED ALWAYS AS (sha2(`url`, 256)) VIRTUAL,
	`secretCiphertext` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhookEndpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhookEndpoints_marketplace_url_hash_unique` UNIQUE(`marketplaceId`,`urlHash`)
);
