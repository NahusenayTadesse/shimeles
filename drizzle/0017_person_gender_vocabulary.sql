/*
 The person-gender vocabulary becomes female | male | prefer_not_to_say.

 `other` is dropped and `undisclosed` folded into `prefer_not_to_say`, which
 was always the same answer under a second name. The apply form even rendered
 the stored value `undisclosed` under the label "Prefer not to say".

 These UPDATEs run *before* the table rebuilds below, because those rebuilds
 copy the column across verbatim: normalising afterwards would work for these
 two tables but leave the window in between, and drizzle-kit will not emit them
 at all on its own. `volunteer_applications` is normalised at the end, since it
 has no default to change and so is not rebuilt.

 SQLite does not enforce a text enum, so this is the only thing that actually
 rewrites the data. Rows already holding `female` or `male` are untouched.
*/
UPDATE `application_subjects` SET `gender` = 'prefer_not_to_say' WHERE `gender` IN ('other', 'undisclosed');--> statement-breakpoint
UPDATE `beneficiaries` SET `gender` = 'prefer_not_to_say' WHERE `gender` IN ('other', 'undisclosed');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_application_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_submission_id` integer NOT NULL,
	`applying_for` text DEFAULT 'self' NOT NULL,
	`relationship` text,
	`full_name` text,
	`date_of_birth` text,
	`approximate_age` integer,
	`gender` text DEFAULT 'prefer_not_to_say' NOT NULL,
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
	`declared_accurate_at` integer,
	`acknowledged_no_guarantee_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`form_submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`written_language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_application_subjects`("id", "form_submission_id", "applying_for", "relationship", "full_name", "date_of_birth", "approximate_age", "gender", "phone", "city", "address_line", "region_id", "household_size", "dependants_count", "monthly_income", "income_source", "is_employed", "has_disability", "health_detail", "other_support", "safe_to_contact", "contact_notes", "best_time_to_contact", "alternate_contact_name", "alternate_contact_phone", "written_language_id", "consent_to_verify_at", "consent_to_store_at", "declared_accurate_at", "acknowledged_no_guarantee_at", "created_at", "updated_at", "deleted_at") SELECT "id", "form_submission_id", "applying_for", "relationship", "full_name", "date_of_birth", "approximate_age", "gender", "phone", "city", "address_line", "region_id", "household_size", "dependants_count", "monthly_income", "income_source", "is_employed", "has_disability", "health_detail", "other_support", "safe_to_contact", "contact_notes", "best_time_to_contact", "alternate_contact_name", "alternate_contact_phone", "written_language_id", "consent_to_verify_at", "consent_to_store_at", "declared_accurate_at", "acknowledged_no_guarantee_at", "created_at", "updated_at", "deleted_at" FROM `application_subjects`;--> statement-breakpoint
DROP TABLE `application_subjects`;--> statement-breakpoint
ALTER TABLE `__new_application_subjects` RENAME TO `application_subjects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `application_subject_unique` ON `application_subjects` (`form_submission_id`);--> statement-breakpoint
CREATE INDEX `application_subjects_name_idx` ON `application_subjects` (`full_name`);--> statement-breakpoint
CREATE INDEX `application_subjects_phone_idx` ON `application_subjects` (`phone`);--> statement-breakpoint
CREATE TABLE `__new_beneficiaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`email` text,
	`household_id` integer,
	`region_id` integer,
	`date_of_birth` text,
	`gender` text DEFAULT 'prefer_not_to_say' NOT NULL,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`language_id` integer,
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
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_beneficiaries`("id", "full_name", "phone", "email", "household_id", "region_id", "date_of_birth", "gender", "preferred_language", "language_id", "notes", "is_active", "created_by", "updated_by", "created_at", "updated_at", "deleted_at", "deleted_by") SELECT "id", "full_name", "phone", "email", "household_id", "region_id", "date_of_birth", "gender", "preferred_language", "language_id", "notes", "is_active", "created_by", "updated_by", "created_at", "updated_at", "deleted_at", "deleted_by" FROM `beneficiaries`;--> statement-breakpoint
DROP TABLE `beneficiaries`;--> statement-breakpoint
ALTER TABLE `__new_beneficiaries` RENAME TO `beneficiaries`;--> statement-breakpoint
CREATE INDEX `beneficiaries_household_idx` ON `beneficiaries` (`household_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_region_idx` ON `beneficiaries` (`region_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_phone_idx` ON `beneficiaries` (`phone`);--> statement-breakpoint
CREATE INDEX `beneficiaries_name_idx` ON `beneficiaries` (`full_name`);--> statement-breakpoint
-- Not rebuilt above (nullable, no default), so it is normalised directly. NULL
-- is left as NULL: "we never asked" is not the same as "they would rather not say".
UPDATE `volunteer_applications` SET `gender` = 'prefer_not_to_say' WHERE `gender` IN ('other', 'undisclosed');
