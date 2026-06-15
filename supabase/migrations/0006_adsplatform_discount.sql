-- v5: TDD AdsPlatform integration + per-conference client discount.
-- Run AFTER 0005.

-- ============== CONFERENCES: default client discount ==============
alter table public.conferences add column client_discount_type text not null default 'percent'
  check (client_discount_type in ('percent','fixed'));
alter table public.conferences add column client_discount_value numeric(10,2) not null default 0;
alter table public.conferences add column client_discount_label text not null default 'Client discount';

-- ============== COMPANIES + INVESTORS: TDD lookup fields ==============
alter table public.companies add column ticker text;
alter table public.companies add column website text;
alter table public.companies add column is_tdd_client boolean not null default false;
alter table public.companies add column tdd_match_type text;
alter table public.companies add column tdd_company_data jsonb;
alter table public.companies add column tdd_last_checked_at timestamptz;

alter table public.investors add column ticker text;
alter table public.investors add column website text;
alter table public.investors add column is_tdd_client boolean not null default false;
alter table public.investors add column tdd_match_type text;
alter table public.investors add column tdd_company_data jsonb;
alter table public.investors add column tdd_last_checked_at timestamptz;

-- ============== INVOICES: discount fields ==============
alter table public.invoices add column discount_label text;
alter table public.invoices add column discount_amount numeric(10,2) not null default 0;
-- Note: invoices.total should be recomputed at insert time as subtotal - discount_amount + tax_amount
-- by the application layer. The migration leaves existing rows alone.
