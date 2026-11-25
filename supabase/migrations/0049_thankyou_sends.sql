-- 0049: Post-event thank-you emails (admin console → Thank-you emails).
-- One row per address emailed, so nobody gets theirs twice. Service-only.
create table if not exists public.thankyou_sends (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  lead_type text not null check (lead_type in ('company','investor')),
  lead_id uuid not null,
  email text not null,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  unique (conference_id, lead_type, email)
);
alter table public.thankyou_sends enable row level security;
