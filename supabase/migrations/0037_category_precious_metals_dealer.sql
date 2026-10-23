-- 0037: Add "Precious Metals Dealer" company category.
alter table public.companies drop constraint if exists companies_category_check;
alter table public.companies add constraint companies_category_check
  check (category is null or category in ('Explorer','Developer','Producer','Industrials','Royalty','Precious Metals Dealer'));
