-- v4: invoices, email templates, sent emails, gmail token storage.
-- Run AFTER 0004. All sends are user-initiated (button click); tokens stored to enable that, not for background use.

-- ============== GMAIL TOKENS (per user) ==============
create table public.gmail_tokens (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.gmail_tokens enable row level security;

-- A user can only read or modify their own row
create policy "gmail_tokens_own" on public.gmail_tokens
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============== EMAIL TEMPLATES (per conference) ==============
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  name text not null,
  kind text not null default 'general'
    check (kind in ('invoice','reminder','welcome','marketing','registration','general','other')),
  subject text not null,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index et_conf_idx on public.email_templates (conference_id);
create trigger touch_email_templates before update on public.email_templates
  for each row execute function public.touch_updated_at();

alter table public.email_templates enable row level security;
create policy "et_read_conf_member" on public.email_templates for select to authenticated
  using (public.has_conference_access(conference_id));
create policy "et_write_team" on public.email_templates for all to authenticated
  using (public.has_conference_role(conference_id, array['conference_admin','finance','recruiter']))
  with check (public.has_conference_role(conference_id, array['conference_admin','finance','recruiter']));

-- ============== INVOICES ==============
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  lead_type text not null check (lead_type in ('company','investor')),
  lead_id uuid not null,
  invoice_number int not null,
  line_items jsonb not null default '[]'::jsonb, -- [{description, quantity, unit_price}]
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'draft' check (status in ('draft','sent','viewed','paid','overdue','void')),
  due_date date,
  issued_date date,
  recipient_email text,
  recipient_name text,
  notes text,
  payment_terms text,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conference_id, invoice_number)
);
create index inv_conf_idx on public.invoices (conference_id);
create index inv_lead_idx on public.invoices (lead_type, lead_id);
create index inv_status_idx on public.invoices (status);
create trigger touch_invoices before update on public.invoices
  for each row execute function public.touch_updated_at();

alter table public.invoices enable row level security;
create policy "inv_read_team" on public.invoices for select to authenticated
  using (public.has_conference_access(conference_id));
create policy "inv_write_finance" on public.invoices for all to authenticated
  using (public.has_conference_role(conference_id, array['conference_admin','finance']))
  with check (public.has_conference_role(conference_id, array['conference_admin','finance']));

-- Auto-increment invoice_number per conference
create or replace function public.set_invoice_number()
returns trigger language plpgsql as $$
declare next_num int;
begin
  if new.invoice_number is null or new.invoice_number = 0 then
    select coalesce(max(invoice_number), 0) + 1 into next_num
      from public.invoices where conference_id = new.conference_id;
    new.invoice_number := next_num;
  end if;
  return new;
end $$;
create trigger set_invoice_number_trigger before insert on public.invoices
  for each row execute function public.set_invoice_number();

-- ============== SENT EMAILS (audit log) ==============
create table public.sent_emails (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  sender_user_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'general'
    check (kind in ('invoice','reminder','welcome','marketing','registration','general','other')),
  recipients jsonb not null default '[]'::jsonb, -- [{email, name?, lead_type?, lead_id?}]
  cc jsonb default '[]'::jsonb,
  bcc jsonb default '[]'::jsonb,
  subject text not null,
  body_snapshot text not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  has_pdf_attachment boolean not null default false,
  gmail_message_id text,
  sent_at timestamptz not null default now()
);
create index se_conf_idx on public.sent_emails (conference_id, sent_at desc);
create index se_invoice_idx on public.sent_emails (invoice_id);

alter table public.sent_emails enable row level security;
create policy "se_read_conf" on public.sent_emails for select to authenticated
  using (public.has_conference_access(conference_id));
create policy "se_write_conf" on public.sent_emails for insert to authenticated
  with check (public.has_conference_access(conference_id));

-- Optional: link sent emails to the lead they touched (so we can show "emails sent" on lead detail)
create table public.sent_email_recipients (
  id uuid primary key default gen_random_uuid(),
  sent_email_id uuid not null references public.sent_emails(id) on delete cascade,
  lead_type text check (lead_type in ('company','investor')),
  lead_id uuid,
  email text not null,
  name text
);
create index ser_lead_idx on public.sent_email_recipients (lead_type, lead_id);
create index ser_se_idx on public.sent_email_recipients (sent_email_id);

alter table public.sent_email_recipients enable row level security;
create policy "ser_read_via_se" on public.sent_email_recipients for select to authenticated
  using (exists (
    select 1 from public.sent_emails se
    where se.id = sent_email_recipients.sent_email_id and public.has_conference_access(se.conference_id)
  ));
create policy "ser_write_via_se" on public.sent_email_recipients for insert to authenticated
  with check (exists (
    select 1 from public.sent_emails se
    where se.id = sent_email_id and public.has_conference_access(se.conference_id)
  ));

-- ============== SEED A FEW DEFAULT EMAIL TEMPLATES ==============
do $$
declare conf_id uuid;
begin
  select id into conf_id from public.conferences where slug = 'mining-summit-2026' limit 1;
  if conf_id is not null then
    insert into public.email_templates (conference_id, kind, name, subject, body) values
      (conf_id, 'invoice', 'Invoice — initial', 'Invoice #{{invoice_number}} for Mining Summit 2026',
       E'Hi {{recipient_name}},\n\nPlease find attached invoice #{{invoice_number}} for your participation in Mining Summit 2026, due {{due_date}}.\n\nAmount: {{total}}\n\nKindly reply once payment is scheduled or if you have questions.\n\nThank you,\n{{sender_name}}'),
      (conf_id, 'reminder', 'Payment reminder', 'Friendly reminder: Invoice #{{invoice_number}}',
       E'Hi {{recipient_name}},\n\nA quick reminder that invoice #{{invoice_number}} ({{total}}) was due {{due_date}}. If payment is already on its way, please disregard.\n\nLet me know if you need a fresh copy of the invoice.\n\nBest,\n{{sender_name}}'),
      (conf_id, 'welcome', 'Welcome to Mining Summit', 'Welcome to Mining Summit 2026',
       E'Hi {{recipient_name}},\n\nWelcome aboard — we''re excited to have {{lead_name}} joining us for Mining Summit 2026.\n\nA full agenda, venue details, and your registration confirmation are below. Reach out anytime.\n\nBest,\n{{sender_name}}'),
      (conf_id, 'registration', 'Registration confirmation', 'You''re registered: Mining Summit 2026',
       E'Hi {{recipient_name}},\n\nConfirming registration for {{lead_name}} at Mining Summit 2026 ({{conference_dates}}).\n\nLogistics info to follow shortly.\n\n{{sender_name}}'),
      (conf_id, 'marketing', 'Event teaser', 'Mining Summit 2026 — the agenda is taking shape',
       E'Hi {{recipient_name}},\n\nWe''re finalizing the lineup for Mining Summit 2026 and wanted to share what''s coming together.\n\n[Insert highlights here]\n\nLet me know if you''d like to chat about getting involved.\n\n{{sender_name}}')
    on conflict do nothing;
  end if;
end $$;

-- Realtime
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.sent_emails;
alter publication supabase_realtime add table public.email_templates;
