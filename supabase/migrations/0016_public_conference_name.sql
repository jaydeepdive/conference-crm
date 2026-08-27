-- v6.31: Public-facing conference name.
--
-- `conferences.name` is the internal label operators see across the CRM
-- (e.g. "Mining Summit 2026"). `conferences.public_name` is what recipients
-- see in outgoing communications — SignWell participation-agreement emails
-- today, and in the future any customer-facing surface the CRM sends.
--
-- Nullable. When null, downstream code falls back to `name`, so this is a
-- pure add-on with no behavioural change until an operator sets a value.
--
-- Idempotent.

alter table public.conferences
  add column if not exists public_name text;
