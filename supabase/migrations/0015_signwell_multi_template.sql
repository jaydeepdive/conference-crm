-- v6.26: Multiple SignWell templates per conference.
--
-- A conference can now offer several agreement variants (e.g. "Pricing A",
-- "Pricing B", "Sponsor Package"). Each variant carries its own SignWell
-- template UUID, signer placeholder, and field-name → template-field-api_id
-- map.
--
-- Storage: a single JSONB column on `conferences` holding an array of
-- template configs. Shape:
--   [
--     {
--       "id":                  "abcd-1234-...",     -- SignWell template UUID
--       "name":                "Pricing A",         -- operator-facing label
--       "placeholder_signer":  "Client",
--       "field_map": {
--         "company_name":      "TextField_1",
--         "signer_name":       "TextField_2",
--         ...
--       }
--     },
--     ...
--   ]
--
-- The legacy single-template columns (`signwell_template_id`,
-- `signwell_field_map`, `signwell_placeholder_signer`) are left in place for
-- backwards compat, but the send route reads from `signwell_templates` first
-- and only falls back to the old columns for conferences that haven't been
-- migrated in the UI yet. On first save through the new Settings UI, the
-- legacy config is folded into the array.
--
-- We also add two columns to `companies` so we can remember which specific
-- template each company was sent — critical when there's more than one to
-- pick from.

alter table public.conferences
  add column if not exists signwell_templates jsonb not null default '[]'::jsonb;

alter table public.companies
  add column if not exists agreement_template_id text,
  add column if not exists agreement_template_name text;

-- Backfill: fold any existing single-template config into the new array so
-- previously configured conferences work out of the box.
update public.conferences
  set signwell_templates =
    jsonb_build_array(
      jsonb_build_object(
        'id',                  signwell_template_id,
        'name',                coalesce(nullif(signwell_placeholder_signer, ''), 'Default') || ' template',
        'placeholder_signer',  coalesce(signwell_placeholder_signer, 'Signer 1'),
        'field_map',           coalesce(signwell_field_map, '{}'::jsonb)
      )
    )
  where signwell_template_id is not null
    and (signwell_templates is null or signwell_templates = '[]'::jsonb);
