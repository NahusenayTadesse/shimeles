CREATE TABLE `media_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`file_id` integer,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `media_owner_idx` ON `media_items` (`owner_type`,`owner_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `media_file_idx` ON `media_items` (`file_id`);--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_am` text,
	`role` text,
	`role_am` text,
	`quote` text NOT NULL,
	`quote_am` text,
	`body` text,
	`body_am` text,
	`photo` text,
	`pillar_id` integer,
	`show_on_site` integer DEFAULT true NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `testimonials_slug_unique` ON `testimonials` (`slug`);--> statement-breakpoint
CREATE INDEX `testimonials_site_idx` ON `testimonials` (`show_on_site`,`sort_order`);--> statement-breakpoint
CREATE INDEX `testimonials_featured_idx` ON `testimonials` (`is_featured`,`sort_order`);--> statement-breakpoint
CREATE INDEX `testimonials_pillar_idx` ON `testimonials` (`pillar_id`);--> statement-breakpoint
-- Move the four gallery tables and the blog's videos into `media_items`.
--
-- Written by hand: drizzle-kit emits the DDL but knows nothing about where the
-- rows should end up, and dropping the old tables in the next migration
-- without this would silently discard every photo already on the site.
--
-- Three of the four galleries key their image by `files.id`, so the path is
-- joined out of `files` and both are carried across. The blog's gallery stored
-- the path directly and has no file id to bring.
INSERT INTO `media_items` (`owner_type`, `owner_id`, `kind`, `url`, `file_id`, `caption`, `sort_order`, `created_at`)
SELECT 'about', 1, 'image', `f`.`storage_path`, `g`.`file_id`, `g`.`caption`, `g`.`sort_order`, `g`.`created_at`
FROM `about_gallery_images` `g` JOIN `files` `f` ON `f`.`id` = `g`.`file_id`;--> statement-breakpoint

INSERT INTO `media_items` (`owner_type`, `owner_id`, `kind`, `url`, `file_id`, `caption`, `sort_order`, `created_at`)
SELECT 'hero', 0, 'image', `f`.`storage_path`, `g`.`file_id`, `g`.`caption`, `g`.`sort_order`, `g`.`created_at`
FROM `hero_gallery_images` `g` JOIN `files` `f` ON `f`.`id` = `g`.`file_id`;--> statement-breakpoint

INSERT INTO `media_items` (`owner_type`, `owner_id`, `kind`, `url`, `file_id`, `caption`, `sort_order`, `created_at`)
SELECT 'homepage', 0, 'image', `f`.`storage_path`, `g`.`file_id`, `g`.`caption`, `g`.`sort_order`, `g`.`created_at`
FROM `homepage_gallery_images` `g` JOIN `files` `f` ON `f`.`id` = `g`.`file_id`;--> statement-breakpoint

INSERT INTO `media_items` (`owner_type`, `owner_id`, `kind`, `url`, `file_id`, `caption`, `sort_order`, `created_at`)
SELECT 'blog_post', `g`.`blog_id`, 'image', `g`.`image_url`, `f`.`id`, `g`.`caption`, `g`.`sort_order`, `g`.`created_at`
FROM `blog_gallery_images` `g` LEFT JOIN `files` `f` ON `f`.`storage_path` = `g`.`image_url`;--> statement-breakpoint

INSERT INTO `media_items` (`owner_type`, `owner_id`, `kind`, `url`, `file_id`, `caption`, `sort_order`, `created_at`)
SELECT 'blog_post', `v`.`blog_id`, 'video', `v`.`youtube_url`, NULL, `v`.`caption`, `v`.`sort_order`, `v`.`created_at`
FROM `blog_videos` `v`;
