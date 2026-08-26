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
