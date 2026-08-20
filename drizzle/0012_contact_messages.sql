CREATE TABLE `contact_message_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_message_id` integer NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`is_internal` integer DEFAULT false NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`sent_at` integer,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`contact_message_id`) REFERENCES `contact_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_message_replies_message_idx` ON `contact_message_replies` (`contact_message_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_number` text NOT NULL,
	`subject_id` integer,
	`subject_other` text,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`organization` text,
	`message` text NOT NULL,
	`preferred_channel` text DEFAULT 'either' NOT NULL,
	`region_id` integer,
	`source` text DEFAULT 'web_form' NOT NULL,
	`data` text,
	`status_id` integer,
	`priority` text DEFAULT 'normal' NOT NULL,
	`assigned_to_id` text,
	`first_responded_at` integer,
	`closed_at` integer,
	`is_read` integer DEFAULT false NOT NULL,
	`is_spam` integer DEFAULT false NOT NULL,
	`join_newsletter` integer DEFAULT false NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`subject_id`) REFERENCES `contact_subjects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`status_id`) REFERENCES `status_options`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_messages_reference_number_unique` ON `contact_messages` (`reference_number`);--> statement-breakpoint
CREATE INDEX `contact_messages_status_idx` ON `contact_messages` (`status_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_subject_idx` ON `contact_messages` (`subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_assignee_idx` ON `contact_messages` (`assigned_to_id`);--> statement-breakpoint
CREATE INDEX `contact_messages_unread_idx` ON `contact_messages` (`is_read`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_email_idx` ON `contact_messages` (`email`);--> statement-breakpoint
CREATE TABLE `contact_offices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`address_line` text,
	`city` text,
	`region_id` integer,
	`phone` text,
	`email` text,
	`opening_hours` text,
	`map_url` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_offices_slug_unique` ON `contact_offices` (`slug`);--> statement-breakpoint
CREATE INDEX `contact_offices_active_idx` ON `contact_offices` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `contact_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`description` text,
	`icon` text,
	`notify_emails` text,
	`default_assignee_id` text,
	`target_response_hours` integer,
	`public_response_note` text,
	`suggested_pillar_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`default_assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suggested_pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_subjects_slug_unique` ON `contact_subjects` (`slug`);--> statement-breakpoint
CREATE INDEX `contact_subjects_active_idx` ON `contact_subjects` (`is_active`,`sort_order`);--> statement-breakpoint
/*
  Carries the existing contact-form submissions into their own table.

  `form_submissions` rows are left exactly as they are rather than deleted or
  soft-deleted: this is a copy, not a move. Nothing else reads a pillar-less
  submission once the messages screen points at `contact_messages`, and leaving
  the originals in place means a migration that turns out to have mangled a
  message is recoverable by reading the row it came from.

  `status_id` is deliberately NULL: the source status belongs to the
  `application` context and would be the wrong vocabulary here. The contact
  seed assigns the default contact status to any message still missing one.
*/
INSERT INTO `contact_messages` (
  `reference_number`, `subject_other`, `full_name`, `email`, `phone`, `message`,
  `preferred_channel`, `source`, `data`, `status_id`, `priority`, `is_read`,
  `is_spam`, `join_newsletter`, `language`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  fs.`reference_number`,
  json_extract(fs.`data`, '$.subject'),
  COALESCE(NULLIF(TRIM(fs.`submitted_by_name`), ''), json_extract(fs.`data`, '$.name'), 'Unnamed sender'),
  COALESCE(NULLIF(TRIM(fs.`submitted_by_email`), ''), json_extract(fs.`data`, '$.email')),
  COALESCE(NULLIF(TRIM(fs.`submitted_by_phone`), ''), json_extract(fs.`data`, '$.phone')),
  COALESCE(json_extract(fs.`data`, '$.message'), ''),
  'either',
  'web_form',
  fs.`data`,
  NULL,
  'normal',
  fs.`is_read`,
  0,
  0,
  fs.`language`,
  fs.`created_at`,
  fs.`updated_at`,
  fs.`deleted_at`
FROM `form_submissions` fs
JOIN `form_definitions` fd ON fd.`id` = fs.`form_definition_id`
WHERE fd.`slug` = 'contact-form'
  AND fs.`reference_number` NOT IN (SELECT `reference_number` FROM `contact_messages`);
