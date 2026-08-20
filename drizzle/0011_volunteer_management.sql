CREATE TABLE `volunteer_application_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`skill_id` integer NOT NULL,
	`proficiency` text DEFAULT 'intermediate' NOT NULL,
	`years_experience` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `volunteer_skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_application_skill_unique` ON `volunteer_application_skills` (`volunteer_application_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `volunteer_application_skills_skill_idx` ON `volunteer_application_skills` (`skill_id`);--> statement-breakpoint
CREATE TABLE `volunteer_availability` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`time_slot_id` integer NOT NULL,
	`effective_from` text,
	`effective_until` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`time_slot_id`) REFERENCES `volunteer_time_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_availability_unique` ON `volunteer_availability` (`volunteer_application_id`,`time_slot_id`);--> statement-breakpoint
CREATE INDEX `volunteer_availability_slot_idx` ON `volunteer_availability` (`time_slot_id`);--> statement-breakpoint
CREATE TABLE `volunteer_credentials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`profession_id` integer,
	`other_profession` text,
	`license_number` text,
	`licensing_body` text,
	`specialization` text,
	`years_experience` integer,
	`issued_on` text,
	`expires_on` text,
	`document_file_id` integer,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`verified_by` text,
	`verified_at` integer,
	`verification_note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profession_id`) REFERENCES `volunteer_professions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `volunteer_credentials_application_idx` ON `volunteer_credentials` (`volunteer_application_id`);--> statement-breakpoint
CREATE INDEX `volunteer_credentials_status_idx` ON `volunteer_credentials` (`verification_status`);--> statement-breakpoint
CREATE INDEX `volunteer_credentials_expiry_idx` ON `volunteer_credentials` (`expires_on`);--> statement-breakpoint
CREATE TABLE `volunteer_interests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`pillar_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_interest_unique` ON `volunteer_interests` (`volunteer_application_id`,`pillar_id`);--> statement-breakpoint
CREATE INDEX `volunteer_interests_pillar_idx` ON `volunteer_interests` (`pillar_id`);--> statement-breakpoint
CREATE TABLE `volunteer_professions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`category` text DEFAULT 'medical' NOT NULL,
	`requires_license` integer DEFAULT true NOT NULL,
	`default_licensing_body` text,
	`description` text,
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
CREATE UNIQUE INDEX `volunteer_professions_slug_unique` ON `volunteer_professions` (`slug`);--> statement-breakpoint
CREATE INDEX `volunteer_professions_active_idx` ON `volunteer_professions` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `volunteer_professions_category_idx` ON `volunteer_professions` (`category`,`sort_order`);--> statement-breakpoint
CREATE TABLE `volunteer_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`relationship` text,
	`organization` text,
	`email` text,
	`phone` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_note` text,
	`contacted_by` text,
	`contacted_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contacted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `volunteer_references_application_idx` ON `volunteer_references` (`volunteer_application_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `volunteer_references_status_idx` ON `volunteer_references` (`status`);--> statement-breakpoint
CREATE TABLE `volunteer_skill_categories` (
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
CREATE UNIQUE INDEX `volunteer_skill_categories_slug_unique` ON `volunteer_skill_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `volunteer_skill_categories_active_idx` ON `volunteer_skill_categories` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `volunteer_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`description` text,
	`category_id` integer,
	`requires_credential` integer DEFAULT false NOT NULL,
	`hint` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`category_id`) REFERENCES `volunteer_skill_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_skills_slug_unique` ON `volunteer_skills` (`slug`);--> statement-breakpoint
CREATE INDEX `volunteer_skills_category_idx` ON `volunteer_skills` (`category_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `volunteer_skills_active_idx` ON `volunteer_skills` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `volunteer_time_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`label_am` text,
	`day_of_week` integer,
	`start_time` text,
	`end_time` text,
	`description` text,
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
CREATE UNIQUE INDEX `volunteer_time_slots_slug_unique` ON `volunteer_time_slots` (`slug`);--> statement-breakpoint
CREATE INDEX `volunteer_time_slots_active_idx` ON `volunteer_time_slots` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `volunteer_time_slots_day_idx` ON `volunteer_time_slots` (`day_of_week`,`start_time`);--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `city` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `date_of_birth` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `occupation` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `emergency_contact_name` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `emergency_contact_phone` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `emergency_contact_relationship` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `hours_per_week` integer;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `commitment_months` integer;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `available_from` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `motivation` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `heard_about` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `is_professional` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `background_check_consent_at` integer;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `code_of_conduct_agreed_at` integer;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `has_prior_conviction` integer;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `prior_conviction_detail` text;