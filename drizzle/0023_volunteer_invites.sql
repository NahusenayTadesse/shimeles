CREATE TABLE `volunteer_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`token` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`hidden_parts` text DEFAULT '[]' NOT NULL,
	`sent_at` integer,
	`completed_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_invites_token_unique` ON `volunteer_invites` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_invites_application_unique` ON `volunteer_invites` (`volunteer_application_id`);