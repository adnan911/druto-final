ALTER TABLE `merchantAccounts` MODIFY COLUMN `status` enum('pending','active','disabled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `merchantAccounts` ADD `ownerUserId` int;--> statement-breakpoint
ALTER TABLE `merchantAccounts` ADD `walletVerifiedAt` timestamp;