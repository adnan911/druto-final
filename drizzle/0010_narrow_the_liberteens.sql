ALTER TABLE `apiKeys` ADD `merchantAccountId` varchar(32);--> statement-breakpoint
ALTER TABLE `apiKeys` ADD `marketplaceId` varchar(128);--> statement-breakpoint
ALTER TABLE `apiKeys` ADD `sellerId` varchar(128);--> statement-breakpoint
ALTER TABLE `apiKeys` ADD `sellerDisplayName` varchar(255);