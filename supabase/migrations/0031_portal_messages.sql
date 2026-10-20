-- 0031: Direct messages between registered companies and investors.
-- One thread per (company, investor) pair. Everyone attending for that
-- company/investor shares the thread. Service-only tables (RLS on, no
-- policies) — all access goes through server routes that check the
-- signed-in attendee.
create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete cascade,
  sender_side text not null check (sender_side in ('company','investor')),
  sender_attendee_id uuid references public.attendee_profiles(id) on delete set null,
  sender_name text,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists portal_messages_thread_idx on public.portal_messages (company_id, investor_id, created_at);
create index if not exists portal_messages_conf_idx on public.portal_messages (conference_id, created_at desc);
alter table public.portal_messages enable row level security;
revoke all on public.portal_messages from anon, authenticated;

-- Per-person "read up to" marker for unread badges.
create table if not exists public.portal_thread_reads (
  attendee_id uuid not null references public.attendee_profiles(id) on delete cascade,
  company_id uuid not null,
  investor_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (attendee_id, company_id, investor_id)
);
alter table public.portal_thread_reads enable row level security;
revoke all on public.portal_thread_reads from anon, authenticated;
