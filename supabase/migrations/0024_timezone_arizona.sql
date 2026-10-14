-- 0024: The summit is in Scottsdale, Arizona (no DST). Meeting slots were
-- being computed in Toronto time (8:00 Toronto = 6:00 AM Arizona).
update public.conferences set timezone = 'America/Phoenix'
where slug = 'mining-summit-2026';
