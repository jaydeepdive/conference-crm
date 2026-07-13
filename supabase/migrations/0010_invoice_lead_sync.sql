-- v6.10: Keep company/investor amount_due, amount_paid, and payment_status
-- in sync with their invoices.
--
-- Rules:
--   * "Active" invoice = status in ('sent','viewed','partial','overdue','paid').
--     Drafts and voids don't count.
--   * lead.amount_due  = max(existing amount_due, sum(active invoice totals))
--     (never shrinks a manually-typed amount)
--   * lead.amount_paid = max(existing amount_paid, sum(paid invoice totals))
--   * payment_status is bumped to:
--       'paid'      if paid invoice total >= due total (and due > 0)
--       'partial'   if any partial payment recorded
--       'invoiced'  if at least one active invoice exists but none paid
--     Once "paid" or "waived" it stays put.
--
-- Trigger fires after every insert/update/delete on invoices, and re-computes
-- the lead's rollup. We also backfill once at migration time.

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
  active_count int := 0;
begin
  target_lead_type := coalesce(new.lead_type, old.lead_type);
  target_lead_id := coalesce(new.lead_id, old.lead_id);

  select
    coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then total else 0 end), 0),
    coalesce(sum(case when status = 'paid' then total else 0 end), 0),
    coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then 1 else 0 end), 0)
  into active_total, paid_total, active_count
  from public.invoices
  where lead_type = target_lead_type and lead_id = target_lead_id;

  if target_lead_type = 'company' then
    update public.companies set
      amount_due = greatest(coalesce(amount_due, 0), active_total),
      amount_paid = greatest(coalesce(amount_paid, 0), paid_total),
      payment_status = case
        when payment_status = 'waived' then 'waived'
        when paid_total > 0 and paid_total >= active_total then 'paid'
        when paid_total > 0 then 'partial'
        when active_count > 0 then 'invoiced'
        else payment_status
      end,
      updated_at = now()
    where id = target_lead_id;
  elsif target_lead_type = 'investor' then
    update public.investors set
      amount_due = greatest(coalesce(amount_due, 0), active_total),
      amount_paid = greatest(coalesce(amount_paid, 0), paid_total),
      payment_status = case
        when payment_status = 'waived' then 'waived'
        when paid_total > 0 and paid_total >= active_total then 'paid'
        when paid_total > 0 then 'partial'
        when active_count > 0 then 'invoiced'
        else payment_status
      end,
      updated_at = now()
    where id = target_lead_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invoice_lead_sync on public.invoices;
create trigger trg_invoice_lead_sync
  after insert or update or delete on public.invoices
  for each row execute function public.sync_lead_from_invoices();

-- One-time backfill for existing invoices (in case any were created before
-- the trigger existed).
do $$
declare r record;
begin
  for r in
    select distinct lead_type, lead_id from public.invoices
    where status in ('sent','viewed','partial','overdue','paid')
  loop
    if r.lead_type = 'company' then
      update public.companies c set
        amount_due = greatest(coalesce(c.amount_due, 0), sub.active_total),
        amount_paid = greatest(coalesce(c.amount_paid, 0), sub.paid_total),
        payment_status = case
          when c.payment_status = 'waived' then 'waived'
          when sub.paid_total > 0 and sub.paid_total >= sub.active_total then 'paid'
          when sub.paid_total > 0 then 'partial'
          when sub.active_count > 0 then 'invoiced'
          else c.payment_status
        end,
        updated_at = now()
      from (
        select
          coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then total else 0 end), 0) active_total,
          coalesce(sum(case when status = 'paid' then total else 0 end), 0) paid_total,
          coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then 1 else 0 end), 0) active_count
        from public.invoices where lead_type = r.lead_type and lead_id = r.lead_id
      ) sub
      where c.id = r.lead_id;
    elsif r.lead_type = 'investor' then
      update public.investors i set
        amount_due = greatest(coalesce(i.amount_due, 0), sub.active_total),
        amount_paid = greatest(coalesce(i.amount_paid, 0), sub.paid_total),
        payment_status = case
          when i.payment_status = 'waived' then 'waived'
          when sub.paid_total > 0 and sub.paid_total >= sub.active_total then 'paid'
          when sub.paid_total > 0 then 'partial'
          when sub.active_count > 0 then 'invoiced'
          else i.payment_status
        end,
        updated_at = now()
      from (
        select
          coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then total else 0 end), 0) active_total,
          coalesce(sum(case when status = 'paid' then total else 0 end), 0) paid_total,
          coalesce(sum(case when status in ('sent','viewed','partial','overdue','paid') then 1 else 0 end), 0) active_count
        from public.invoices where lead_type = r.lead_type and lead_id = r.lead_id
      ) sub
      where i.id = r.lead_id;
    end if;
  end loop;
end $$;
