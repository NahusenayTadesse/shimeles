CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_user_idx` ON `audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `beneficiaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`email` text,
	`household_id` integer,
	`region_id` integer,
	`date_of_birth` text,
	`gender` text DEFAULT 'undisclosed' NOT NULL,
	`preferred_language` text DEFAULT 'am' NOT NULL,
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
CREATE INDEX `beneficiaries_household_idx` ON `beneficiaries` (`household_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_region_idx` ON `beneficiaries` (`region_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_phone_idx` ON `beneficiaries` (`phone`);--> statement-breakpoint
CREATE INDEX `beneficiaries_name_idx` ON `beneficiaries` (`full_name`);--> statement-breakpoint
CREATE TABLE `content_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`block_type` text DEFAULT 'rich_text' NOT NULL,
	`heading` text,
	`heading_am` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`content` text,
	`is_published` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `content_blocks_page_idx` ON `content_blocks` (`page_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `disbursements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_submission_id` integer,
	`beneficiary_id` integer,
	`pillar_id` integer,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'ETB' NOT NULL,
	`paid_to` text NOT NULL,
	`disbursement_date` text NOT NULL,
	`fund_source` text DEFAULT 'general_fund' NOT NULL,
	`designation_pillar_id` integer,
	`designation_initiative_id` integer,
	`receipt_file_id` integer,
	`narrative` text,
	`recorded_by` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`form_submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`designation_pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`designation_initiative_id`) REFERENCES `future_initiatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`receipt_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `disbursements_submission_idx` ON `disbursements` (`form_submission_id`);--> statement-breakpoint
CREATE INDEX `disbursements_beneficiary_idx` ON `disbursements` (`beneficiary_id`);--> statement-breakpoint
CREATE INDEX `disbursements_date_idx` ON `disbursements` (`disbursement_date`);--> statement-breakpoint
CREATE INDEX `disbursements_pillar_idx` ON `disbursements` (`pillar_id`);--> statement-breakpoint
CREATE TABLE `donation_reconciliation_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donation_id` integer NOT NULL,
	`matched_by` text,
	`matched_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`bank_reference_note` text,
	`previous_status` text,
	`new_status` text,
	`amount_matched` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`donation_id`) REFERENCES `donations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reconciliation_donation_idx` ON `donation_reconciliation_log` (`donation_id`);--> statement-breakpoint
CREATE TABLE `donations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donor_id` integer,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'ETB' NOT NULL,
	`frequency` text DEFAULT 'one_time' NOT NULL,
	`designation_type` text DEFAULT 'general_fund' NOT NULL,
	`designation_pillar_id` integer,
	`designation_initiative_id` integer,
	`payment_method_id` integer,
	`payment_account_id` integer,
	`status` text DEFAULT 'pending_reconciliation' NOT NULL,
	`reference_code` text NOT NULL,
	`provider_transaction_id` text,
	`receipt_file_id` integer,
	`receipt_sent_at` integer,
	`completed_at` integer,
	`donor_message` text,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`recurring_pledge_id` integer,
	`region_id` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`donor_id`) REFERENCES `donors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`designation_pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`designation_initiative_id`) REFERENCES `future_initiatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`receipt_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donations_reference_code_unique` ON `donations` (`reference_code`);--> statement-breakpoint
CREATE INDEX `donations_status_idx` ON `donations` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `donations_donor_idx` ON `donations` (`donor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `donations_designation_idx` ON `donations` (`designation_type`,`designation_pillar_id`);--> statement-breakpoint
CREATE INDEX `donations_pledge_idx` ON `donations` (`recurring_pledge_id`);--> statement-breakpoint
CREATE TABLE `donors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`is_diaspora` integer DEFAULT false NOT NULL,
	`country` text,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`lifetime_total` integer DEFAULT 0 NOT NULL,
	`lifetime_currency` text DEFAULT 'ETB' NOT NULL,
	`donation_count` integer DEFAULT 0 NOT NULL,
	`last_donation_at` integer,
	`accepts_contact` integer DEFAULT true NOT NULL,
	`notes` text,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `donors_email_idx` ON `donors` (`email`);--> statement-breakpoint
CREATE INDEX `donors_phone_idx` ON `donors` (`phone`);--> statement-breakpoint
CREATE INDEX `donors_name_idx` ON `donors` (`full_name`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`original_filename` text NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`pillar_id` integer,
	`uploaded_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_path_unique` ON `files` (`storage_path`);--> statement-breakpoint
CREATE INDEX `files_public_idx` ON `files` (`is_public`);--> statement-breakpoint
CREATE INDEX `files_pillar_idx` ON `files` (`pillar_id`);--> statement-breakpoint
CREATE TABLE `form_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`pillar_id` integer,
	`title` text NOT NULL,
	`title_am` text,
	`intro_text` text,
	`intro_text_am` text,
	`success_message` text,
	`success_message_am` text,
	`requires_documents` integer DEFAULT false NOT NULL,
	`is_low_barrier` integer DEFAULT false NOT NULL,
	`reference_prefix` text DEFAULT 'GEN' NOT NULL,
	`status_context` text DEFAULT 'application' NOT NULL,
	`notify_emails` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_definitions_slug_unique` ON `form_definitions` (`slug`);--> statement-breakpoint
CREATE INDEX `form_definitions_pillar_idx` ON `form_definitions` (`pillar_id`);--> statement-breakpoint
CREATE TABLE `form_fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_definition_id` integer NOT NULL,
	`field_key` text NOT NULL,
	`label` text NOT NULL,
	`label_am` text,
	`hint` text,
	`hint_am` text,
	`placeholder` text,
	`field_type` text DEFAULT 'text' NOT NULL,
	`options` text,
	`is_required` integer DEFAULT false NOT NULL,
	`validation` text,
	`show_when_field_key` text,
	`show_when_value` text,
	`maps_to` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`form_definition_id`) REFERENCES `form_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_fields_key_unique` ON `form_fields` (`form_definition_id`,`field_key`);--> statement-breakpoint
CREATE INDEX `form_fields_form_idx` ON `form_fields` (`form_definition_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `form_submission_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_submission_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	`label` text,
	`field_key` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`form_submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submission_documents_submission_idx` ON `form_submission_documents` (`form_submission_id`);--> statement-breakpoint
CREATE TABLE `form_submission_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_submission_id` integer NOT NULL,
	`author_id` text,
	`note` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`form_submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submission_notes_submission_idx` ON `form_submission_notes` (`form_submission_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_definition_id` integer NOT NULL,
	`reference_number` text NOT NULL,
	`data` text,
	`status_id` integer,
	`pillar_id` integer,
	`submitted_by_beneficiary_id` integer,
	`submitted_by_name` text,
	`submitted_by_phone` text,
	`submitted_by_email` text,
	`assigned_reviewer_id` text,
	`region_id` integer,
	`language` text DEFAULT 'en' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`form_definition_id`) REFERENCES `form_definitions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`status_id`) REFERENCES `status_options`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_by_beneficiary_id`) REFERENCES `beneficiaries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_submissions_reference_number_unique` ON `form_submissions` (`reference_number`);--> statement-breakpoint
CREATE INDEX `form_submissions_pillar_status_idx` ON `form_submissions` (`pillar_id`,`status_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `form_submissions_form_idx` ON `form_submissions` (`form_definition_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `form_submissions_reviewer_idx` ON `form_submissions` (`assigned_reviewer_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_beneficiary_idx` ON `form_submissions` (`submitted_by_beneficiary_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_region_idx` ON `form_submissions` (`region_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_phone_idx` ON `form_submissions` (`submitted_by_phone`);--> statement-breakpoint
CREATE TABLE `future_initiatives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`description` text,
	`description_am` text,
	`icon` text DEFAULT 'Building2' NOT NULL,
	`image` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`goal_amount` integer,
	`currency` text DEFAULT 'ETB' NOT NULL,
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
CREATE UNIQUE INDEX `future_initiatives_slug_unique` ON `future_initiatives` (`slug`);--> statement-breakpoint
CREATE INDEX `future_initiatives_status_idx` ON `future_initiatives` (`status`,`sort_order`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`region_id` integer,
	`notes` text,
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
CREATE INDEX `households_region_idx` ON `households` (`region_id`);--> statement-breakpoint
CREATE TABLE `impact_metrics_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`pillar_id` integer,
	`region_id` integer,
	`value` integer DEFAULT 0 NOT NULL,
	`currency` text,
	`computed_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `impact_metrics_unique` ON `impact_metrics_cache` (`key`,`pillar_id`,`region_id`);--> statement-breakpoint
CREATE TABLE `navigation_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`label_am` text,
	`page_id` integer,
	`url` text,
	`placement` text DEFAULT 'header' NOT NULL,
	`parent_id` integer,
	`is_cta` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `navigation_items_placement_idx` ON `navigation_items` (`placement`,`sort_order`);--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`subscribed_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`unsubscribed_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'homepage' NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_email_unique` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_unsubscribe_token_unique` ON `newsletter_subscribers` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `newsletter_active_idx` ON `newsletter_subscribers` (`is_active`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`title_am` text,
	`meta_description` text,
	`meta_description_am` text,
	`share_image` text,
	`is_published` integer DEFAULT true NOT NULL,
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
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE INDEX `pages_published_idx` ON `pages` (`is_published`,`sort_order`);--> statement-breakpoint
CREATE TABLE `payment_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_method_id` integer NOT NULL,
	`account_name` text NOT NULL,
	`account_number` text NOT NULL,
	`bank_name` text,
	`branch` text,
	`swift_code` text,
	`currency` text DEFAULT 'ETB' NOT NULL,
	`is_for_diaspora` integer DEFAULT false NOT NULL,
	`instructions` text,
	`instructions_am` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payment_accounts_method_idx` ON `payment_accounts` (`payment_method_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`kind` text DEFAULT 'bank_transfer' NOT NULL,
	`logo` text,
	`instructions` text,
	`instructions_am` text,
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
CREATE UNIQUE INDEX `payment_methods_slug_unique` ON `payment_methods` (`slug`);--> statement-breakpoint
CREATE INDEX `payment_methods_active_idx` ON `payment_methods` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `pillars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`summary` text,
	`summary_am` text,
	`description` text,
	`description_am` text,
	`icon` text DEFAULT 'HeartHandshake' NOT NULL,
	`color` text DEFAULT 'clay' NOT NULL,
	`image` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`has_public_application` integer DEFAULT true NOT NULL,
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
CREATE UNIQUE INDEX `pillars_slug_unique` ON `pillars` (`slug`);--> statement-breakpoint
CREATE INDEX `pillars_active_idx` ON `pillars` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `recurring_pledges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donor_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'ETB' NOT NULL,
	`designation_type` text DEFAULT 'general_fund' NOT NULL,
	`designation_pillar_id` integer,
	`designation_initiative_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`next_reminder_date` text,
	`last_reminder_sent_at` integer,
	`reminder_channel` text DEFAULT 'email' NOT NULL,
	`started_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`donor_id`) REFERENCES `donors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`designation_pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`designation_initiative_id`) REFERENCES `future_initiatives`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurring_pledges_donor_idx` ON `recurring_pledges` (`donor_id`);--> statement-breakpoint
CREATE INDEX `recurring_pledges_due_idx` ON `recurring_pledges` (`status`,`next_reminder_date`);--> statement-breakpoint
CREATE TABLE `regions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`is_default` integer DEFAULT false NOT NULL,
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
CREATE UNIQUE INDEX `regions_slug_unique` ON `regions` (`slug`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`value_am` text,
	`value_type` text DEFAULT 'text' NOT NULL,
	`label` text NOT NULL,
	`hint` text,
	`group` text DEFAULT 'general' NOT NULL,
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
CREATE UNIQUE INDEX `site_settings_key_unique` ON `site_settings` (`key`);--> statement-breakpoint
CREATE INDEX `site_settings_group_idx` ON `site_settings` (`group`,`sort_order`);--> statement-breakpoint
CREATE TABLE `status_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context` text DEFAULT 'application' NOT NULL,
	`stage` text NOT NULL,
	`label` text NOT NULL,
	`label_am` text,
	`color` text DEFAULT 'slate' NOT NULL,
	`public_description` text,
	`public_description_am` text,
	`is_default` integer DEFAULT false NOT NULL,
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
CREATE INDEX `status_options_context_idx` ON `status_options` (`context`,`sort_order`);--> statement-breakpoint
CREATE TABLE `translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`en` text NOT NULL,
	`am` text,
	`group` text DEFAULT 'general' NOT NULL,
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
CREATE UNIQUE INDEX `translations_key_unique` ON `translations` (`key`);--> statement-breakpoint
CREATE INDEX `translations_group_idx` ON `translations` (`group`);--> statement-breakpoint
CREATE TABLE `user_pillar_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`pillar_id` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_pillar_unique` ON `user_pillar_assignments` (`user_id`,`pillar_id`);--> statement-breakpoint
CREATE INDEX `user_pillar_user_idx` ON `user_pillar_assignments` (`user_id`);--> statement-breakpoint
CREATE TABLE `volunteer_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_number` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`region_id` integer,
	`areas_of_interest` text,
	`skills` text,
	`availability` text,
	`professional_credentials` text,
	`data` text,
	`status_id` integer,
	`references_checked` integer DEFAULT false NOT NULL,
	`credentials_verified` integer,
	`safeguarding_checklist_complete` integer DEFAULT false NOT NULL,
	`assigned_reviewer_id` text,
	`language` text DEFAULT 'en' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`status_id`) REFERENCES `status_options`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volunteer_applications_reference_number_unique` ON `volunteer_applications` (`reference_number`);--> statement-breakpoint
CREATE INDEX `volunteer_applications_status_idx` ON `volunteer_applications` (`status_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `volunteer_applications_reviewer_idx` ON `volunteer_applications` (`assigned_reviewer_id`);--> statement-breakpoint
CREATE INDEX `volunteer_applications_region_idx` ON `volunteer_applications` (`region_id`);--> statement-breakpoint
CREATE TABLE `volunteer_placements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`pillar_id` integer,
	`region_id` integer,
	`role_description` text,
	`hours_per_week` integer,
	`started_at` text,
	`ended_at` text,
	`supervisor_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supervisor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `volunteer_placements_application_idx` ON `volunteer_placements` (`volunteer_application_id`);--> statement-breakpoint
CREATE INDEX `volunteer_placements_pillar_idx` ON `volunteer_placements` (`pillar_id`);--> statement-breakpoint
CREATE TABLE `volunteer_safeguarding_checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`label_am` text,
	`description` text,
	`professional_only` integer DEFAULT false NOT NULL,
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
CREATE INDEX `safeguarding_items_active_idx` ON `volunteer_safeguarding_checklist_items` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `volunteer_safeguarding_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volunteer_application_id` integer NOT NULL,
	`checklist_item_id` integer NOT NULL,
	`completed_by` text,
	`completed_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`note` text,
	`evidence_file_id` integer,
	FOREIGN KEY (`volunteer_application_id`) REFERENCES `volunteer_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checklist_item_id`) REFERENCES `volunteer_safeguarding_checklist_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`evidence_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `safeguarding_check_unique` ON `volunteer_safeguarding_checks` (`volunteer_application_id`,`checklist_item_id`);--> statement-breakpoint
CREATE INDEX `safeguarding_checks_application_idx` ON `volunteer_safeguarding_checks` (`volunteer_application_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`group` text DEFAULT 'General' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_name_unique` ON `permissions` (`name`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_unique` ON `role_permissions` (`role_id`,`permission_id`);--> statement-breakpoint
CREATE INDEX `role_permissions_role_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_slug_unique` ON `roles` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `special_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`permission_id` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `special_permissions_unique` ON `special_permissions` (`user_id`,`permission_id`);--> statement-breakpoint
CREATE INDEX `special_permissions_user_idx` ON `special_permissions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`role_id` integer,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`phone` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `user_role_id_idx` ON `user` (`role_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);