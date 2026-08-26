CREATE TABLE `merchantAccounts` (
	`id` varchar(32) NOT NULL,
	`marketplaceId` varchar(128) NOT NULL,
	`externalSellerId` varchar(128) NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`receivingAddress` varchar(42) NOT NULL,
	`status` enum('pending','active','disabled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchantAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchantAccounts_marketplace_seller_unique` UNIQUE(`marketplaceId`,`externalSellerId`)
);
--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD `marketplaceId` varchar(128);--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD `sellerId` varchar(128);--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD `merchantAccountId` varchar(32);