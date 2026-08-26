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
	`secretCiphertext` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhookEndpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhookEndpoints_marketplace_url_unique` UNIQUE(`marketplaceId`,`url`)
);
