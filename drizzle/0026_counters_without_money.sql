-- Withdraw the money counter from public pages.
--
-- `funds_raised` has left `METRIC` in `$lib/metrics.ts`, so no counter can name
-- it any more — but a page seeded or edited before this migration still holds
-- one, and a stored block is data the code no longer offers. The figure itself
-- is untouched: it is still computed, still cached, still on the dashboard.
--
-- Rebuilt rather than patched in place: SQLite has no "delete the array element
-- that matches", so the stats array is reassembled from the entries that are
-- not the money one. A block whose only counter was money keeps an empty list
-- rather than a null, which is the shape the renderer already expects.
UPDATE `content_blocks`
SET `content` = json_set(
	`content`,
	'$.stats',
	(
		SELECT json_group_array(json(`value`))
		FROM json_each(json_extract(`content`, '$.stats'))
		WHERE json_extract(`value`, '$.metric') <> 'funds_raised'
	)
)
WHERE `block_type` = 'stat_counter'
	AND json_valid(`content`)
	AND json_type(`content`, '$.stats') = 'array'
	AND EXISTS (
		SELECT 1
		FROM json_each(json_extract(`content`, '$.stats'))
		WHERE json_extract(`value`, '$.metric') = 'funds_raised'
	);
