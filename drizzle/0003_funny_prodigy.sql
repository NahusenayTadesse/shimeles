CREATE TABLE `donation_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`company_name` text NOT NULL,
	`company_logo` text,
	`url` text NOT NULL,
	`is_paypal` integer DEFAULT false NOT NULL,
	`audience` text DEFAULT 'anyone' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`button_label` text,
	`note` text,
	`is_featured` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donation_campaigns_slug_unique` ON `donation_campaigns` (`slug`);--> statement-breakpoint
CREATE INDEX `donation_campaigns_active_idx` ON `donation_campaigns` (`is_active`,`sort_order`);