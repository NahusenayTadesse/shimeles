ALTER TABLE `application_subjects` ADD `declared_accurate_at` integer;--> statement-breakpoint
ALTER TABLE `application_subjects` ADD `acknowledged_no_guarantee_at` integer;--> statement-breakpoint
ALTER TABLE `donors` ADD `organisation_name` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `organisation_name` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `country` text;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `declared_accurate_at` integer;--> statement-breakpoint
ALTER TABLE `volunteer_applications` ADD `acknowledged_no_guarantee_at` integer;