CREATE TABLE `paymentIntents` (
	`id` varchar(32) NOT NULL,
	`externalOrderId` varchar(128) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`amountAtomic` varchar(64) NOT NULL,
	`asset` varchar(16) NOT NULL DEFAULT 'USDC',
	`network` varchar(32) NOT NULL DEFAULT 'arc-testnet',
	`merchantAddress` varchar(42) NOT NULL,
	`buyerAddress` varchar(42),
	`status` enum('requires_payment','submitted','verifying','succeeded','failed','expired') NOT NULL DEFAULT 'requires_payment',
	`transactionHash` varchar(66),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentIntents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paymentTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentIntentId` varchar(32) NOT NULL,
	`transactionHash` varchar(66) NOT NULL,
	`fromAddress` varchar(42) NOT NULL,
	`toAddress` varchar(42) NOT NULL,
	`tokenAddress` varchar(42) NOT NULL,
	`amountAtomic` varchar(64) NOT NULL,
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
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
