ALTER TABLE `paymentIntents` ADD `platformFeeBps` int DEFAULT 200;--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD `platformFeeAmount` varchar(64);--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD `merchantPayoutAmount` varchar(64);--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD `splitContractAddress` varchar(42);--> statement-breakpoint
ALTER TABLE `paymentTransactions` ADD `treasuryAddress` varchar(42);--> statement-breakpoint
ALTER TABLE `paymentTransactions` ADD `platformFeeAmount` varchar(64);--> statement-breakpoint
ALTER TABLE `paymentTransactions` ADD `merchantPayoutAmount` varchar(64);