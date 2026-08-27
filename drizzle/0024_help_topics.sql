CREATE TABLE `help_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context` text DEFAULT 'donate' NOT NULL,
	`question` text NOT NULL,
	`question_am` text,
	`answer` text NOT NULL,
	`answer_am` text,
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
CREATE INDEX `help_topics_context_idx` ON `help_topics` (`context`,`is_active`,`sort_order`);