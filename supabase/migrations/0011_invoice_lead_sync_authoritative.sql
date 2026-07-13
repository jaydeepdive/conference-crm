-- v6.12: Make the invoice-driven lead sync AUTHORITATIVE.
--
-- The 0010 version used `greatest(...)` which meant that once an invoice
-- bumped a lead's amount_due, deleting or voiding the invoice would leave
-- the lead permanently stuck at the old amount. That caused the budget
-- page to show a phantom "outstanding" balance while receivables read $0.
--
-- New rule: as soon as ANY invoice exists for a lead (draft included, void
-- excluded), the invoice ledger is the source of truth for that lead's
-- amount_due, amount_paid, and payment_status. If every invoice for that
-- lead is deleted or voided, we reset the lead back to a clean
-- "not_invoiced / $0" baseline so the budget and receivables agree.
--
-- Rules recap:
--   * "active"  invoice = status in ('sent','viewed','partial','overdue','paid')
--   * "counted" invoice = any status <> 'void'   (includes draft)
--   * amount_due  = sum of counted invoice totals (0 if none)
--   * amount_paid = sum of paid invoice totals   (0 if none)
--   * payment_status:
--       'waived'       — sticky, never overwritten
--       'paid'         — paid_total > 0 and >= amount_due
--       'partial'      — paid_total > 0
--       'invoiced'     — at least one active (sent+) invoice
--       'not_invoiced' — otherwise (drafts only, or no invoices at all)
--
-- Trigger fires after every invoice INSERT/UPDATE/DELETE. A one-time
-- backfill re-runs the sync for every lead currently associated with an
-- invoice AND resets any lead that was left stuck by the previous rule.

create or replace function public.sync_lead_from_invoices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead_type text;
  target_lead_id uuid;
  active_total numeric := 0;
  paid_total numeric := 0;
  counted_total numeric := 0;
  active_count int := 0;
  counted_count int := 0;
begin
  target_lead_type := coalesce(new.lead_type, old.lead_type);
  target_lead_id := coalesce(new.lead_id, old.lead_id);

  select
    coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then total else 0 end), 0),
    coalesce(sum(case when status = 'paid' then total else 0 end), 0),
    coalesce(sum(case when status <> 'void' then total else 0 end), 0),
    coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then 1 else 0 end), 0),
    coalesce(sum(case when status <> 'void' then 1 else 0 end), 0)
  into active_total, paid_total, counted_total, active_count, counted_count
  from public.invoices
  where lead_type = target_lead_type and lead_id = target_lead_id;

  if target_lead_type = 'company' then
    update public.companies set
      amount_due = counted_total,
      amount_paid = paid_total,
      payment_status = case
        when payment_status = 'waived' then 'waived'
        when paid_total > 0 and paid_total >= active_total and active_total > 0 then 'paid'
        when paid_total > 0 then 'partial'
        when active_count > 0 then 'invoiced'
        else 'not_invoiced'
      end,
      updated_at = now()
    where id = target_lead_id;
  elsif target_lead_type = 'investor' then
    update public.investors set
      amount_due = counted_total,
      amount_paid = paid_total,
      payment_status = case
        when payment_status = 'waived' then 'waived'
        when paid_total > 0 and paid_total >= active_total and active_total > 0 then 'paid'
        when paid_total > 0 then 'partial'
        when active_count > 0 then 'invoiced'
        else 'not_invoiced'
      end,
      updated_at = now()
    where id = target_lead_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- Trigger already exists from 0010; CREATE OR REPLACE FUNCTION replaces the
-- body in place, so we don't need to drop/recreate the trigger.

-- Backfill: recompute for every lead that has ever been touched by an
-- invoice, AND clean up leads that 0010 left in an inconsistent state
-- (payment_status = 'invoiced' with no active invoices, amounts stuck > 0
-- while receivables are 0, etc.).
do $$
declare
  co_ids uuid[];
  inv_ids uuid[];
begin
  -- Companies referenced by any invoice (past or present)
  select array_agg(distinct lead_id) into co_ids from public.invoices where lead_type = 'company';
  -- Investors referenced by any invoice
  select array_agg(distinct lead_id) into inv_ids from public.invoices where lead_type = 'investor';

  -- Add any lead currently in a stale "invoiced" state so we sweep them too.
  select array_cat(coalesce(co_ids,'{}'::uuid[]), array_agg(id))
    into co_ids
    from public.companies
    where payment_status in ('invoiced','partial','paid')
      and id not in (select unnest(coalesce(co_ids,'{}'::uuid[])));

  select array_cat(coalesce(inv_ids,'{}'::uuid[]), array_agg(id))
    into inv_ids
    from public.investors
    where payment_status in ('invoiced','partial','paid')
      and id not in (select unnest(coalesce(inv_ids,'{}'::uuid[])));

  -- Now recompute each affected lead by nudging one of its invoices (or,
  -- if none exist, by resetting directly).
  update public.companies c set
    amount_due = coalesce(sub.counted_total, 0),
    amount_paid = coalesce(sub.paid_total, 0),
    payment_status = case
      when c.payment_status = 'waived' then 'waived'
      when coalesce(sub.paid_total,0) > 0 and coalesce(sub.paid_total,0) >= coalesce(sub.active_total,0) and coalesce(sub.active_total,0) > 0 then 'paid'
      when coalesce(sub.paid_total,0) > 0 then 'partial'
      when coalesce(sub.active_count,0) > 0 then 'invoiced'
      else 'not_invoiced'
    end,
    updated_at = now()
  from (
    select lead_id,
      sum(case when status in ('sent','viewed','partial','overdue','paid') then total else 0 end) active_total,
      sum(case when status = 'paid' then total else 0 end) paid_total,
      sum(case when status <> 'void' then total else 0 end) counted_total,
      sum(case when status in ('sent','viewed','partial','overdue','paid') then 1 else 0 end) active_count
    from public.invoices where lead_type = 'company' group by lead_id
  ) sub
  where c.id = sub.lead_id
    and c.id = any(coalesce(co_ids,'{}'::uuid[]));

  -- Leads with no invoices at all: force reset
  update public.companies c set
    amount_due = 0, amount_paid = 0,
    payment_status = case when payment_status = 'waived' then 'waived' else 'not_invoiced' end,
    updated_at = now()
  where c.id = any(coalesce(co_ids,'{}'::uuid[]))
    and c.id not in (select lead_id from public.invoices where lead_type = 'company');

  update public.investors i set
    amount_due = coalesce(sub.counted_total, 0),
    amount_paid = coalesce(sub.paid_total, 0),
    payment_status = case
      when i.payment_status = 'waived' then 'waived'
      when coalesce(sub.paid_total,0) > 0 and coalesce(sub.paid_total,0) >= coalesce(sub.active_total,0) and coalesce(sub.active_total,0) > 0 then 'paid'
      when coalesce(sub.paid_total,0) > 0 then 'partial'
      when coalesce(sub.active_count,0) > 0 then 'invoiced'
      else 'not_invoiced'
    end,
    updated_at = now()
  from (
    select lead_id,
      sum(case when status in ('sent','viewed','partial','overdue','paid') then total else 0 end) active_total,
      sum(case when status = 'paid' then total else 0 end) paid_total,
      sum(case when status <> 'void' then total else 0 end) counted_total,
      sum(case when status in ('sent','viewed','partial','overdue','paid') then 1 else 0 end) active_count
    from public.invoices where lead_type = 'investor' group by lead_id
  ) sub
  where i.id = sub.lead_id
    and i.id = any(coalesce(inv_ids,'{}'::uuid[]));

  update public.investors i set
    amount_due = 0, amount_paid = 0,
    payment_status = case when payment_status = 'waived' then 'waived' else 'not_invoiced' end,
    updated_at = now()
  where i.id = any(coalesce(inv_ids,'{}'::uuid[]))
    and i.id not in (select lead_id from public.invoices where lead_type = 'investor');
end $$;
