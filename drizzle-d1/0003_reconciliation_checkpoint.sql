CREATE TABLE `reconciliationCheckpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`cycleId` text DEFAULT '' NOT NULL,
	`phase` text DEFAULT 'complete' NOT NULL,
	`cutoff` integer DEFAULT 0 NOT NULL,
	`intentUpper` text DEFAULT '' NOT NULL,
	`transactionUpper` integer DEFAULT 0 NOT NULL,
	`expectedIntents` integer DEFAULT 0 NOT NULL,
	`expectedTransactions` integer DEFAULT 0 NOT NULL,
	`intentCursor` text DEFAULT '' NOT NULL,
	`transactionCursor` integer DEFAULT 0 NOT NULL,
	`report` text DEFAULT '{}' NOT NULL,
	`leaseToken` text,
	`leaseUntil` integer DEFAULT 0 NOT NULL,
	`startedAt` integer DEFAULT 0 NOT NULL,
	`completedAt` integer,
	`updatedAt` integer DEFAULT 0 NOT NULL
);
