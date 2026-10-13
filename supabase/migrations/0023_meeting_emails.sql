-- 0023: meeting-notification switch (OFF until the organizer turns it on)
-- and a tiny service-only throttle table for public "email me" endpoints.
alter table public.conferences
  add column if not exists meeting_emails_enabled boolean not null default false;

create table if not exists public.email_throttle (
  key text primary key,
  last_sent_at timestamptz not null default now()
);
alter table public.email_throttle enable row level security;
revoke all on public.email_throttle from anon, authenticated;
