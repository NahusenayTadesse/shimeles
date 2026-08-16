CREATE TABLE `about_content` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meta_description` text,
	`hero_image` text,
	`story_body` text,
	`mission_text` text,
	`vision_text` text,
	`memoriam_name` text DEFAULT 'Shimeles Abera' NOT NULL,
	`memoriam_hero_image` text,
	`memoriam_body` text,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `about_gallery_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` integer NOT NULL,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `about_gallery_sort_idx` ON `about_gallery_images` (`sort_order`);