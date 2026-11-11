-- 0041: "Declined" is sticky. The signed→registered auto-promotion (0017)
-- re-registered companies staff had marked Declined (e.g. CopAur cancelled
-- after signing): any later update of a signed row flipped it back.
-- Now the trigger never overrides Declined. Staff can still re-register by hand.
create or replace function public.auto_register_on_signed()
returns trigger
language plpgsql
as $$
begin
  if new.agreement_status = 'signed'
     and (old.agreement_status is distinct from 'signed'
          or coalesce(old.stage, '') <> 'registered')
     and coalesce(new.stage, '') not in ('registered', 'declined') then
    new.stage := 'registered';
  end if;
  return new;
end;
$$;
