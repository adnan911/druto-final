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
