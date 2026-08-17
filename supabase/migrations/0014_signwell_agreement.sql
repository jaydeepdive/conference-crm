-- v6.18: SignWell "Company Participation Agreement" integration.
--
-- Per-conference config:
--   * signwell_template_id             — the SignWell template UUID that this
--                                        conference's participation agreement is
--                                        built from.
--   * signwell_field_map               — JSONB mapping semantic field names →
--                                        template field api_ids. Populated via
--                                        Settings → SignWell after the operator
--                                        picks a template. Expected keys:
--                                          { "company_name": "abcd-1234", ... }
--                                        (More can be added over time.)
--   * signwell_placeholder_signer      — which template placeholder name to fill
--                                        with the company's contact person.
--                                        Defaults to "Signer 1" (SignWell's
--                                        typical default).
--
-- Per-company tracking:
--   * agreement_status                 — enum text
--                                        (not_sent | sent | viewed | signed |
--                                         declined | voided | expired).
--   * agreement_document_id            — SignWell document id, once sent.
--   * agreement_sent_at, viewed_at,
--     completed_at, declined_at        — event timestamps.
--   * agreement_signer_name / email    — who we sent it to (audit only).
--   * agreement_pdf_url                — cached URL of the completed PDF, if
--                                        SignWell handed us one.
--
-- Idempotent (`if not exists`).

alter table public.conferences
  add column if not exists signwell_template_id text,
  add column if not exists signwell_field_map jsonb not null default '{}'::jsonb,
  add column if not exists signwell_placeholder_signer text not null default 'Signer 1';

alter table public.companies
  add column if not exists agreement_status text not null default 'not_sent'
    check (agreement_status in ('not_sent','sent','viewed','signed','declined','voided','expired')),
  add column if not exists agreement_document_id text,
  add column if not exists agreement_sent_at timestamptz,
  add column if not exists agreement_viewed_at timestamptz,
  add column if not exists agreement_completed_at timestamptz,
  add column if not exists agreement_declined_at timestamptz,
  add column if not exists agreement_signer_name text,
  add column if not exists agreement_signer_email text,
  add column if not exists agreement_pdf_url text;

create index if not exists idx_companies_agreement_document
  on public.companies (agreement_document_id);
