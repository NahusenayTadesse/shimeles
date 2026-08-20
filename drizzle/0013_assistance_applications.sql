CREATE TABLE `application_needs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_submission_id` integer NOT NULL,
	`need_id` integer NOT NULL,
	`detail` text,
	`estimated_amount` integer,
	`currency` text DEFAULT 'ETB' NOT NULL,
	`urgency` text DEFAULT 'weeks' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`form_submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`need_id`) REFERENCES `assistance_needs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_need_unique` ON `application_needs` (`form_submission_id`,`need_id`);--> statement-breakpoint
CREATE INDEX `application_needs_need_idx` ON `application_needs` (`need_id`);--> statement-breakpoint
CREATE TABLE `application_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_submission_id` integer NOT NULL,
	`applying_for` text DEFAULT 'self' NOT NULL,
	`relationship` text,
	`full_name` text,
	`date_of_birth` text,
	`approximate_age` integer,
	`gender` text DEFAULT 'undisclosed' NOT NULL,
	`phone` text,
	`city` text,
	`address_line` text,
	`region_id` integer,
	`household_size` integer,
	`dependants_count` integer,
	`monthly_income` integer,
	`income_source` text,
	`is_employed` integer,
	`has_disability` integer,
	`health_detail` text,
	`other_support` text,
	`safe_to_contact` integer DEFAULT true NOT NULL,
	`contact_notes` text,
	`best_time_to_contact` text,
	`alternate_contact_name` text,
	`alternate_contact_phone` text,
	`written_language_id` integer,
	`consent_to_verify_at` integer,
	`consent_to_store_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`form_submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`written_language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_subject_unique` ON `application_subjects` (`form_submission_id`);--> statement-breakpoint
CREATE INDEX `application_subjects_name_idx` ON `application_subjects` (`full_name`);--> statement-breakpoint
CREATE INDEX `application_subjects_phone_idx` ON `application_subjects` (`phone`);--> statement-breakpoint
CREATE TABLE `assistance_need_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`description` text,
	`icon` text,
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
CREATE UNIQUE INDEX `assistance_need_categories_slug_unique` ON `assistance_need_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `assistance_need_categories_active_idx` ON `assistance_need_categories` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `assistance_needs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`description` text,
	`category_id` integer,
	`pillar_id` integer,
	`evidence_hint` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`category_id`) REFERENCES `assistance_need_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistance_needs_slug_unique` ON `assistance_needs` (`slug`);--> statement-breakpoint
CREATE INDEX `assistance_needs_pillar_idx` ON `assistance_needs` (`pillar_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `assistance_needs_active_idx` ON `assistance_needs` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `languages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`native_name` text,
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
CREATE UNIQUE INDEX `languages_slug_unique` ON `languages` (`slug`);--> statement-breakpoint
CREATE INDEX `languages_active_idx` ON `languages` (`is_active`,`sort_order`);--> statement-breakpoint
ALTER TABLE `beneficiaries` ADD `language_id` integer REFERENCES languages(id);