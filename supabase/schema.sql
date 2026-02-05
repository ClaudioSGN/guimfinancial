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

create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  type text not null check (type in ('b3', 'crypto')),
  symbol text not null,
  name text,
  quantity numeric not null default 0,
  average_price numeric not null default 0,
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
alter table credit_cards add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table transactions add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table transfers add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table reminder_settings add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table investments add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table investment_purchases add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table accounts alter column user_id set default auth.uid();
alter table credit_cards alter column user_id set default auth.uid();
alter table transactions alter column user_id set default auth.uid();
alter table transfers alter column user_id set default auth.uid();
alter table reminder_settings alter column user_id set default auth.uid();
alter table investments alter column user_id set default auth.uid();
alter table investment_purchases alter column user_id set default auth.uid();

alter table accounts enable row level security;
alter table credit_cards enable row level security;
alter table transactions enable row level security;
alter table transfers enable row level security;
alter table reminder_settings enable row level security;
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

create policy "investments_owner_select" on investments for select using (auth.uid() = user_id);
create policy "investments_owner_insert" on investments for insert with check (auth.uid() = user_id);
create policy "investments_owner_update" on investments for update using (auth.uid() = user_id);
create policy "investments_owner_delete" on investments for delete using (auth.uid() = user_id);

create policy "investment_purchases_owner_select" on investment_purchases for select using (auth.uid() = user_id);
create policy "investment_purchases_owner_insert" on investment_purchases for insert with check (auth.uid() = user_id);
create policy "investment_purchases_owner_update" on investment_purchases for update using (auth.uid() = user_id);
create policy "investment_purchases_owner_delete" on investment_purchases for delete using (auth.uid() = user_id);
