CREATE TABLE `dashboardSessions` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`revokedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboardSessions_user_idx` ON `dashboardSessions` (`userId`);--> statement-breakpoint
CREATE INDEX `dashboardSessions_expiry_idx` ON `dashboardSessions` (`expiresAt`);