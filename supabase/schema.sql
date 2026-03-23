create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  type text not null,
  balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  limit_amount numeric not null default 0,
  owner_type text not null default 'self' check (owner_type in ('self', 'friend')),
  friend_name text,
  closing_day int not null,
  due_day int not null,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'card_expense')),
  account_id uuid references accounts (id) on delete set null,
  card_id uuid references credit_cards (id) on delete set null,
  amount numeric not null,
  description text,
  category text,
  date date not null,
  is_fixed boolean,
  is_installment boolean,
  installment_total int,
  installments_paid int,
  is_paid boolean,
  created_at timestamptz not null default now()
);

alter table transactions add column if not exists is_installment boolean;
alter table transactions add column if not exists installment_total int;
alter table transactions add column if not exists installments_paid int;
alter table transactions add column if not exists is_paid boolean;
alter table transactions add column if not exists is_fixed boolean;

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  from_account_id uuid references accounts (id) on delete set null,
  to_account_id uuid references accounts (id) on delete set null,
  amount numeric not null,
  date date not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists reminder_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  remind_enabled boolean not null default true,
  remind_hour int not null default 9,
  remind_minute int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  deadline date,
  created_at timestamptz not null default now()
);

create table if not exists category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  category text not null,
  amount numeric not null default 0,
  month_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, month_key, category)
);

create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  type text not null check (type in ('b3', 'crypto', 'fixed_income')),
  symbol text not null,
  name text,
  quantity numeric not null default 0,
  average_price numeric not null default 0,
  cdi_rate_pct numeric,
  cdi_multiplier_pct numeric,
  fixed_started_at timestamptz,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

create table if not exists investment_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  asset_id uuid references investments (id) on delete cascade,
  date date not null,
  price_per_share numeric not null,
  quantity numeric not null,
  total_invested numeric not null,
  mode_used text not null check (mode_used in ('quantity', 'value')),
  input_value numeric,
  created_at timestamptz not null default now()
);

alter table accounts add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table accounts add column if not exists initial_balance numeric not null default 0;
alter table accounts add column if not exists card_limit numeric;
alter table accounts add column if not exists closing_day int;
alter table accounts add column if not exists due_day int;
alter table credit_cards add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table credit_cards add column if not exists owner_type text not null default 'self';
alter table credit_cards add column if not exists friend_name text;
alter table credit_cards drop constraint if exists credit_cards_owner_type_check;
alter table credit_cards add constraint credit_cards_owner_type_check check (owner_type in ('self', 'friend'));
alter table transactions add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table transfers add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table reminder_settings add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table goals add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table category_budgets add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table investments add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table investment_purchases add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table investments add column if not exists cdi_rate_pct numeric;
alter table investments add column if not exists cdi_multiplier_pct numeric;
alter table investments add column if not exists fixed_started_at timestamptz;
alter table investments drop constraint if exists investments_type_check;
alter table investments add constraint investments_type_check check (type in ('b3', 'crypto', 'fixed_income'));

alter table accounts alter column user_id set default auth.uid();
alter table credit_cards alter column user_id set default auth.uid();
alter table transactions alter column user_id set default auth.uid();
alter table transfers alter column user_id set default auth.uid();
alter table reminder_settings alter column user_id set default auth.uid();
alter table goals alter column user_id set default auth.uid();
alter table category_budgets alter column user_id set default auth.uid();
alter table investments alter column user_id set default auth.uid();
alter table investment_purchases alter column user_id set default auth.uid();

alter table accounts enable row level security;
alter table credit_cards enable row level security;
alter table transactions enable row level security;
alter table transfers enable row level security;
alter table reminder_settings enable row level security;
alter table goals enable row level security;
alter table category_budgets enable row level security;
alter table investments enable row level security;
alter table investment_purchases enable row level security;

create policy "accounts_owner_select" on accounts for select using (auth.uid() = user_id);
create policy "accounts_owner_insert" on accounts for insert with check (auth.uid() = user_id);
create policy "accounts_owner_update" on accounts for update using (auth.uid() = user_id);
create policy "accounts_owner_delete" on accounts for delete using (auth.uid() = user_id);

create policy "credit_cards_owner_select" on credit_cards for select using (auth.uid() = user_id);
create policy "credit_cards_owner_insert" on credit_cards for insert with check (auth.uid() = user_id);
create policy "credit_cards_owner_update" on credit_cards for update using (auth.uid() = user_id);
create policy "credit_cards_owner_delete" on credit_cards for delete using (auth.uid() = user_id);

create policy "transactions_owner_select" on transactions for select using (auth.uid() = user_id);
create policy "transactions_owner_insert" on transactions for insert with check (auth.uid() = user_id);
create policy "transactions_owner_update" on transactions for update using (auth.uid() = user_id);
create policy "transactions_owner_delete" on transactions for delete using (auth.uid() = user_id);

create policy "transfers_owner_select" on transfers for select using (auth.uid() = user_id);
create policy "transfers_owner_insert" on transfers for insert with check (auth.uid() = user_id);
create policy "transfers_owner_update" on transfers for update using (auth.uid() = user_id);
create policy "transfers_owner_delete" on transfers for delete using (auth.uid() = user_id);

create policy "reminder_settings_owner_select" on reminder_settings for select using (auth.uid() = user_id);
create policy "reminder_settings_owner_insert" on reminder_settings for insert with check (auth.uid() = user_id);
create policy "reminder_settings_owner_update" on reminder_settings for update using (auth.uid() = user_id);
create policy "reminder_settings_owner_delete" on reminder_settings for delete using (auth.uid() = user_id);

create policy "goals_owner_select" on goals for select using (auth.uid() = user_id);
create policy "goals_owner_insert" on goals for insert with check (auth.uid() = user_id);
create policy "goals_owner_update" on goals for update using (auth.uid() = user_id);
create policy "goals_owner_delete" on goals for delete using (auth.uid() = user_id);

create policy "category_budgets_owner_select" on category_budgets for select using (auth.uid() = user_id);
create policy "category_budgets_owner_insert" on category_budgets for insert with check (auth.uid() = user_id);
create policy "category_budgets_owner_update" on category_budgets for update using (auth.uid() = user_id);
create policy "category_budgets_owner_delete" on category_budgets for delete using (auth.uid() = user_id);

create policy "investments_owner_select" on investments for select using (auth.uid() = user_id);
create policy "investments_owner_insert" on investments for insert with check (auth.uid() = user_id);
create policy "investments_owner_update" on investments for update using (auth.uid() = user_id);
create policy "investments_owner_delete" on investments for delete using (auth.uid() = user_id);

create policy "investment_purchases_owner_select" on investment_purchases for select using (auth.uid() = user_id);
create policy "investment_purchases_owner_insert" on investment_purchases for insert with check (auth.uid() = user_id);
create policy "investment_purchases_owner_update" on investment_purchases for update using (auth.uid() = user_id);
create policy "investment_purchases_owner_delete" on investment_purchases for delete using (auth.uid() = user_id);

create table if not exists gamification_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  friend_code text unique,
  avatar_url text,
  coins int not null default 0,
  serasa_negative boolean not null default false,
  bio_code text not null default 'mendigueira',
  missions_completed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gamification_friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

create table if not exists gamification_medals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  icon text not null default 'trophy',
  coin_reward int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists gamification_user_medals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  medal_id uuid not null references gamification_medals (id) on delete cascade,
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, medal_id)
);

create table if not exists gamification_weekly_missions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  mission_type text not null check (mission_type in ('manual_savings', 'add_asset', 'no_expense_day')),
  target_value numeric not null default 0,
  coin_reward int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists gamification_user_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_id uuid not null references gamification_weekly_missions (id) on delete cascade,
  week_start date not null,
  progress_value numeric not null default 0,
  completed_at timestamptz,
  reward_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mission_id, week_start)
);

create table if not exists gamification_wallet_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_ref date not null,
  pnl_value numeric not null default 0,
  wallet_value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_ref)
);

create table if not exists gamification_avatar_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_code text not null,
  equipped boolean not null default false,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, item_code)
);

create index if not exists gamification_friendships_user_idx on gamification_friendships (user_id);
create index if not exists gamification_friendships_friend_idx on gamification_friendships (friend_user_id);
create index if not exists gamification_user_medals_user_idx on gamification_user_medals (user_id);
create index if not exists gamification_user_missions_user_week_idx on gamification_user_missions (user_id, week_start);
create index if not exists gamification_wallet_monthly_user_month_idx on gamification_wallet_monthly (user_id, month_ref);
create index if not exists gamification_avatar_inventory_user_idx on gamification_avatar_inventory (user_id);

update gamification_profiles
set friend_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where friend_code is null;

alter table gamification_profiles alter column friend_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
alter table gamification_profiles alter column friend_code set not null;
alter table gamification_profiles add column if not exists email text;
alter table gamification_profiles add column if not exists bio_code text;
alter table gamification_profiles add column if not exists missions_completed int;

update gamification_profiles
set bio_code = 'mendigueira'
where bio_code is null or btrim(bio_code) = '';

update gamification_profiles
set missions_completed = 0
where missions_completed is null;

alter table gamification_profiles alter column bio_code set default 'mendigueira';
alter table gamification_profiles alter column bio_code set not null;
alter table gamification_profiles alter column missions_completed set default 0;
alter table gamification_profiles alter column missions_completed set not null;

insert into gamification_profiles (user_id, display_name, email)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1)),
  lower(u.email)
from auth.users u
on conflict (user_id) do update
set
  email = excluded.email,
  display_name = coalesce(gamification_profiles.display_name, excluded.display_name),
  updated_at = now();

update gamification_profiles gp
set email = lower(u.email)
from auth.users u
where gp.user_id = u.id
  and (gp.email is null or btrim(gp.email) = '');

update gamification_profiles gp
set missions_completed = progress.claimed_total
from (
  select user_id, count(*)::int as claimed_total
  from gamification_user_missions
  where reward_claimed = true
  group by user_id
) as progress
where gp.user_id = progress.user_id
  and coalesce(gp.missions_completed, 0) < progress.claimed_total;

create unique index if not exists gamification_profiles_email_unique_idx
  on gamification_profiles (lower(email))
  where email is not null;

create or replace function public.handle_new_user_gamification_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gamification_profiles (user_id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      split_part(new.email, '@', 1)
    ),
    lower(new.email)
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    display_name = coalesce(gamification_profiles.display_name, excluded.display_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_gamification_profile on auth.users;
create trigger on_auth_user_created_gamification_profile
after insert on auth.users
for each row execute function public.handle_new_user_gamification_profile();

create or replace function public.profile_friends_view(target_user_id uuid)
returns table (
  friend_user_id uuid,
  display_name text,
  avatar_url text,
  email text,
  is_mutual boolean
)
language sql
security definer
set search_path = public
as $$
with viewer as (
  select auth.uid() as viewer_id
),
allowed as (
  select 1
  from viewer
  where viewer_id is not null
    and (
      viewer_id = target_user_id
      or exists (
        select 1
        from gamification_friendships f
        where f.status = 'accepted'
          and (
            (f.user_id = viewer_id and f.friend_user_id = target_user_id)
            or (f.friend_user_id = viewer_id and f.user_id = target_user_id)
          )
      )
    )
),
target_friends as (
  select
    case
      when f.user_id = target_user_id then f.friend_user_id
      else f.user_id
    end as friend_id
  from gamification_friendships f
  join allowed a on true
  where f.status = 'accepted'
    and (f.user_id = target_user_id or f.friend_user_id = target_user_id)
),
viewer_friends as (
  select
    case
      when f.user_id = v.viewer_id then f.friend_user_id
      else f.user_id
    end as friend_id
  from gamification_friendships f
  join viewer v on v.viewer_id is not null
  where f.status = 'accepted'
    and (f.user_id = v.viewer_id or f.friend_user_id = v.viewer_id)
)
select
  tf.friend_id as friend_user_id,
  gp.display_name,
  gp.avatar_url,
  gp.email,
  case
    when (select viewer_id from viewer) = target_user_id then false
    else exists (select 1 from viewer_friends vf where vf.friend_id = tf.friend_id)
  end as is_mutual
from target_friends tf
left join gamification_profiles gp on gp.user_id = tf.friend_id
order by lower(coalesce(gp.display_name, gp.email, tf.friend_id::text));
$$;

revoke all on function public.profile_friends_view(uuid) from public;
grant execute on function public.profile_friends_view(uuid) to authenticated;

alter table gamification_profiles enable row level security;
alter table gamification_friendships enable row level security;
alter table gamification_medals enable row level security;
alter table gamification_user_medals enable row level security;
alter table gamification_weekly_missions enable row level security;
alter table gamification_user_missions enable row level security;
alter table gamification_wallet_monthly enable row level security;
alter table gamification_avatar_inventory enable row level security;

drop policy if exists "gamification_profiles_select" on gamification_profiles;
create policy "gamification_profiles_select" on gamification_profiles for select using (auth.uid() is not null);
drop policy if exists "gamification_profiles_insert" on gamification_profiles;
create policy "gamification_profiles_insert" on gamification_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "gamification_profiles_update" on gamification_profiles;
create policy "gamification_profiles_update" on gamification_profiles for update using (auth.uid() = user_id);
drop policy if exists "gamification_profiles_delete" on gamification_profiles;
create policy "gamification_profiles_delete" on gamification_profiles for delete using (auth.uid() = user_id);

drop policy if exists "gamification_friendships_select" on gamification_friendships;
create policy "gamification_friendships_select" on gamification_friendships for select using (
  auth.uid() = user_id or auth.uid() = friend_user_id
);
drop policy if exists "gamification_friendships_insert" on gamification_friendships;
create policy "gamification_friendships_insert" on gamification_friendships for insert with check (
  auth.uid() = user_id
);
drop policy if exists "gamification_friendships_update" on gamification_friendships;
create policy "gamification_friendships_update" on gamification_friendships for update using (
  auth.uid() = user_id
);
drop policy if exists "gamification_friendships_delete" on gamification_friendships;
create policy "gamification_friendships_delete" on gamification_friendships for delete using (
  auth.uid() = user_id
);

drop policy if exists "gamification_medals_select" on gamification_medals;
create policy "gamification_medals_select" on gamification_medals for select using (auth.uid() is not null);

drop policy if exists "gamification_user_medals_select" on gamification_user_medals;
create policy "gamification_user_medals_select" on gamification_user_medals for select using (
  auth.uid() = user_id
  or exists (
    select 1
    from gamification_friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = auth.uid() and f.friend_user_id = gamification_user_medals.user_id)
        or (f.friend_user_id = auth.uid() and f.user_id = gamification_user_medals.user_id)
      )
  )
);
drop policy if exists "gamification_user_medals_insert" on gamification_user_medals;
create policy "gamification_user_medals_insert" on gamification_user_medals for insert with check (
  auth.uid() = user_id
);
drop policy if exists "gamification_user_medals_update" on gamification_user_medals;
create policy "gamification_user_medals_update" on gamification_user_medals for update using (
  auth.uid() = user_id
);
drop policy if exists "gamification_user_medals_delete" on gamification_user_medals;
create policy "gamification_user_medals_delete" on gamification_user_medals for delete using (
  auth.uid() = user_id
);

drop policy if exists "gamification_weekly_missions_select" on gamification_weekly_missions;
create policy "gamification_weekly_missions_select" on gamification_weekly_missions for select using (auth.uid() is not null);

drop policy if exists "gamification_user_missions_select" on gamification_user_missions;
create policy "gamification_user_missions_select" on gamification_user_missions for select using (
  auth.uid() = user_id
);
drop policy if exists "gamification_user_missions_insert" on gamification_user_missions;
create policy "gamification_user_missions_insert" on gamification_user_missions for insert with check (
  auth.uid() = user_id
);
drop policy if exists "gamification_user_missions_update" on gamification_user_missions;
create policy "gamification_user_missions_update" on gamification_user_missions for update using (
  auth.uid() = user_id
);
drop policy if exists "gamification_user_missions_delete" on gamification_user_missions;
create policy "gamification_user_missions_delete" on gamification_user_missions for delete using (
  auth.uid() = user_id
);

drop policy if exists "gamification_wallet_monthly_select" on gamification_wallet_monthly;
create policy "gamification_wallet_monthly_select" on gamification_wallet_monthly for select using (
  auth.uid() = user_id
  or exists (
    select 1
    from gamification_friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = auth.uid() and f.friend_user_id = gamification_wallet_monthly.user_id)
        or (f.friend_user_id = auth.uid() and f.user_id = gamification_wallet_monthly.user_id)
      )
  )
);
drop policy if exists "gamification_wallet_monthly_insert" on gamification_wallet_monthly;
create policy "gamification_wallet_monthly_insert" on gamification_wallet_monthly for insert with check (
  auth.uid() = user_id
);
drop policy if exists "gamification_wallet_monthly_update" on gamification_wallet_monthly;
create policy "gamification_wallet_monthly_update" on gamification_wallet_monthly for update using (
  auth.uid() = user_id
);
drop policy if exists "gamification_wallet_monthly_delete" on gamification_wallet_monthly;
create policy "gamification_wallet_monthly_delete" on gamification_wallet_monthly for delete using (
  auth.uid() = user_id
);

drop policy if exists "gamification_avatar_inventory_select" on gamification_avatar_inventory;
create policy "gamification_avatar_inventory_select" on gamification_avatar_inventory for select using (
  auth.uid() = user_id
);
drop policy if exists "gamification_avatar_inventory_insert" on gamification_avatar_inventory;
create policy "gamification_avatar_inventory_insert" on gamification_avatar_inventory for insert with check (
  auth.uid() = user_id
);
drop policy if exists "gamification_avatar_inventory_update" on gamification_avatar_inventory;
create policy "gamification_avatar_inventory_update" on gamification_avatar_inventory for update using (
  auth.uid() = user_id
);
drop policy if exists "gamification_avatar_inventory_delete" on gamification_avatar_inventory;
create policy "gamification_avatar_inventory_delete" on gamification_avatar_inventory for delete using (
  auth.uid() = user_id
);

drop policy if exists "investments_friends_select" on investments;
create policy "investments_friends_select" on investments for select using (
  exists (
    select 1
    from gamification_friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = auth.uid() and f.friend_user_id = investments.user_id)
        or (f.friend_user_id = auth.uid() and f.user_id = investments.user_id)
      )
  )
);

insert into gamification_medals (code, title, description, icon, coin_reward)
values
  ('mission_rookie', 'Mission Rookie', 'Complete your first weekly mission.', 'trophy', 10),
  ('profit_guard', 'Profit Guard', 'Finish the month with positive wallet P/L.', 'trophy', 20),
  ('network_builder', 'Network Builder', 'Add at least 3 friends.', 'trophy', 15),
  ('coin_collector', 'Coin Collector', 'Accumulate 200 coins.', 'trophy', 25)
on conflict (code) do nothing;

insert into gamification_weekly_missions (code, title, description, mission_type, target_value, coin_reward, is_active)
values
  ('save_50_brl', 'Economize R$50', 'Junte pelo menos R$50 nesta semana.', 'manual_savings', 50, 25, true),
  ('add_asset_weekly', 'Novo ativo', 'Cadastre 1 novo ativo nesta semana.', 'add_asset', 1, 15, true),
  ('no_expense_days_3', 'Dias sem despesa', 'Fique 3 dias sem despesas nesta semana.', 'no_expense_day', 3, 20, true)
on conflict (code) do nothing;
