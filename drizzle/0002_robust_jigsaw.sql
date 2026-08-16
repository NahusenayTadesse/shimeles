PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_beneficiaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`email` text,
	`household_id` integer,
	`region_id` integer,
	`date_of_birth` text,
	`gender` text DEFAULT 'undisclosed' NOT NULL,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_beneficiaries`("id", "full_name", "phone", "email", "household_id", "region_id", "date_of_birth", "gender", "preferred_language", "notes", "is_active", "created_by", "updated_by", "created_at", "updated_at", "deleted_at", "deleted_by") SELECT "id", "full_name", "phone", "email", "household_id", "region_id", "date_of_birth", "gender", "preferred_language", "notes", "is_active", "created_by", "updated_by", "created_at", "updated_at", "deleted_at", "deleted_by" FROM `beneficiaries`;--> statement-breakpoint
DROP TABLE `beneficiaries`;--> statement-breakpoint
ALTER TABLE `__new_beneficiaries` RENAME TO `beneficiaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `beneficiaries_household_idx` ON `beneficiaries` (`household_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_region_idx` ON `beneficiaries` (`region_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_phone_idx` ON `beneficiaries` (`phone`);--> statement-breakpoint
CREATE INDEX `beneficiaries_name_idx` ON `beneficiaries` (`full_name`);