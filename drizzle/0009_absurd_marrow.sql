CREATE TABLE `apiKeys` (
	`id` varchar(32) NOT NULL,
	`ownerUserId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`prefix` varchar(32) NOT NULL,
	`lastFour` varchar(4) NOT NULL,
	`secretHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	`revokedAt` timestamp,
	CONSTRAINT `apiKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiKeys_secretHash_unique` UNIQUE(`secretHash`),
	CONSTRAINT `apiKeys_owner_created_unique` UNIQUE(`ownerUserId`,`createdAt`)
);
