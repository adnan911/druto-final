ALTER TABLE `paymentIntents` ADD `idempotencyKey` varchar(128);--> statement-breakpoint
ALTER TABLE `paymentIntents` ADD CONSTRAINT `paymentIntents_idempotencyKey_unique` UNIQUE(`idempotencyKey`);