-- v6.8: Per-conference invoice issuer + wire instructions.
--
-- Adds three columns to conferences so each one can specify:
--   1. The legal name of the corporation issuing the invoice (e.g. "Bri-Sim Capital Inc.")
--   2. The mailing address (multi-line, freeform)
--   3. Payment instructions — wire details, ACH, check mail-to, etc. (multi-line, freeform)
--
-- These get rendered in the invoice PDF header + a "Payment instructions" block
-- before the notes footer. They're also shown in the HTML email version of the invoice.

alter table public.conferences
  add column if not exists invoice_issuer_name text,
  add column if not exists invoice_issuer_address text,
  add column if not exists invoice_payment_instructions text;
