-- The "email people on every status change" switch.
--
-- Data, not schema, for the same reason as `0018_seo_settings.sql`: a policy
-- the Foundation owns is a `site_settings` row, and an installed site is
-- upgraded with `db:migrate` rather than re-seeded, so the key would otherwise
-- exist only on a fresh install.
--
-- Seeded `false`. Turning this on means every status change emails the person
-- the record is about, including the internal steps, and that is a decision for
-- the Foundation to make deliberately from the settings screen — never one a
-- deploy makes on its behalf.
--
-- `INSERT OR IGNORE`, so re-running is harmless and a value staff have already
-- chosen is never overwritten.
INSERT OR IGNORE INTO `site_settings`
	(`key`, `value`, `value_type`, `label`, `hint`, `group`, `sort_order`, `is_active`)
VALUES
	(
		'workflow.notify_on_status_change',
		'false',
		'boolean',
		'Email people on every status change',
		'When Yes, moving an application or a volunteer to any status emails them, not only the statuses ticked under Configuration → Statuses. A status with nothing written in its public description still sends nothing unless the caseworker adds a note. Off by default.',
		'workflow',
		1,
		1
	);
