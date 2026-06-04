-- Bootstrap the first admin.
-- Run this AFTER you've signed in once with Google, so your auth.users row exists.
-- Replace the email with your address.

update public.profiles
   set role = 'admin'
 where email = 'jay@thedeepdive.ca';

-- Verify
select id, email, full_name, role from public.profiles;
