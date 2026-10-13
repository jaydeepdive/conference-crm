-- 0022: server-only secrets (e.g. Resend API key) readable only by the
-- service role. RLS on with NO policies = anon/authenticated get nothing.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
