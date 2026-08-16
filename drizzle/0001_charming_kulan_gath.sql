DROP INDEX `impact_metrics_unique`;--> statement-breakpoint
CREATE INDEX `impact_metrics_key_idx` ON `impact_metrics_cache` (`key`,`pillar_id`,`region_id`);