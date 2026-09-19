-- Apply once through the Supabase SQL editor or your migration runner.
-- Safe to reapply; it does not change existing financial tables or balances.
begin;

create table if not exists public.dollar_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  usd_amount numeric(14, 2) not null check (usd_amount > 0 and usd_amount <= 999999999999.99),
  total_paid numeric(14, 2) not null check (total_paid > 0 and total_paid <= 999999999999.99),
  currency text not null check (currency in ('BRL', 'EUR')),
  created_at timestamptz not null default now()
);

create index if not exists dollar_purchases_user_date_idx on public.dollar_purchases(user_id, date desc);
alter table public.dollar_purchases enable row level security;
revoke all on public.dollar_purchases from anon;
grant select, insert, update, delete on public.dollar_purchases to authenticated;

drop policy if exists dollar_purchases_owner on public.dollar_purchases;
create policy dollar_purchases_owner on public.dollar_purchases
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
