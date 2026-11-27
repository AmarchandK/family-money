-- Family Money — database schema for Supabase
-- Run once in the Supabase SQL editor (or via migration).

create extension if not exists pgcrypto;

-- Who is allowed to use the app (only logins listed here can see any data)
create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create or replace function public.is_member() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid());
$$;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text default '#7c8cff',
  created_at timestamptz default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'expense' check (kind in ('expense','income')),
  grp text not null default 'need' check (grp in ('need','want')),
  icon text default '📦',
  color text default '#7c8cff',
  budget numeric(14,2),
  created_at timestamptz default now()
);

create table if not exists public.methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'upi' check (kind in ('cash','upi','wallet','card','bank')),
  opening_due numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'mf' check (kind in ('stock','mf','fd','gold','ppf','nps','savings','other')),
  person_id uuid references public.people(id) on delete set null,
  opening_invested numeric(14,2) default 0,
  current_value numeric(14,2),
  monthly_sip numeric(14,2),
  note text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.chitties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  foreman text,
  person_id uuid references public.people(id) on delete set null,
  total_value numeric(14,2) not null default 0,
  installment numeric(14,2) not null default 0,
  months int not null default 0,
  start_date date,
  opening_paid numeric(14,2) default 0,
  opening_months int default 0,
  auctioned boolean default false,
  closed boolean default false,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lender text,
  person_id uuid references public.people(id) on delete set null,
  principal numeric(14,2) not null default 0,
  rate numeric(6,3) not null default 0,
  emi numeric(14,2) not null default 0,
  tenure_months int,
  start_date date,
  opening_principal_paid numeric(14,2) default 0,
  closed boolean default false,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  type text not null check (type in ('expense','income','investment','chitty','emi','cc_bill','chitty_payout','withdrawal')),
  amount numeric(14,2) not null check (amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  method_id uuid references public.methods(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  ref_id uuid,
  principal_part numeric(14,2),
  note text,
  created_at timestamptz default now()
);
create index if not exists transactions_date_idx on public.transactions(date desc);
create index if not exists transactions_ref_idx on public.transactions(ref_id);
create index if not exists transactions_category_idx on public.transactions(category_id);
create index if not exists transactions_method_idx on public.transactions(method_id);
create index if not exists transactions_person_idx on public.transactions(person_id);
create index if not exists investments_person_idx on public.investments(person_id);
create index if not exists chitties_person_idx on public.chitties(person_id);
create index if not exists loans_person_idx on public.loans(person_id);

-- Row Level Security: only members can read/write
alter table public.app_users enable row level security;
drop policy if exists "self read" on public.app_users;
create policy "self read" on public.app_users for select to authenticated using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['people','categories','methods','investments','chitties','loans','transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members all" on public.%I', t);
    execute format('create policy "members all" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
  end loop;
end $$;

-- Default data
insert into public.people (name, color)
select * from (values ('Husband','#5b8cff'),('Wife','#ff6fae')) v(name,color)
where not exists (select 1 from public.people);

insert into public.categories (name, kind, grp, icon, color)
select * from (values
  ('Groceries','expense','need','🛒','#2ee59d'),
  ('Rent / Housing','expense','need','🏠','#5b8cff'),
  ('Food & Dining','expense','want','🍽️','#ff8f5a'),
  ('Fuel','expense','need','⛽','#ffb547'),
  ('Transport','expense','need','🚕','#ffd56b'),
  ('Electricity & Bills','expense','need','💡','#5ac8fa'),
  ('Mobile & Internet','expense','need','📱','#7c8cff'),
  ('Shopping','expense','want','🛍️','#ff6fae'),
  ('Health & Medical','expense','need','💊','#ff6b81'),
  ('Education','expense','need','📚','#a78bfa'),
  ('Entertainment','expense','want','🎬','#f472b6'),
  ('Travel','expense','want','✈️','#22d3ee'),
  ('Family & Gifts','expense','want','🎁','#fb7185'),
  ('Insurance','expense','need','🛡️','#34d399'),
  ('Household','expense','need','🧹','#94a3b8'),
  ('Personal Care','expense','want','💇','#e879f9'),
  ('Other','expense','want','📦','#64748b'),
  ('Salary','income','need','💼','#2ee59d'),
  ('Bonus','income','need','🎉','#ffd56b'),
  ('Interest','income','need','🏦','#5ac8fa'),
  ('Dividend','income','need','📈','#7c8cff'),
  ('Other Income','income','need','💰','#a3e635')
) v(name,kind,grp,icon,color)
where not exists (select 1 from public.categories);

insert into public.methods (name, kind)
select * from (values ('Cash','cash'),('UPI','upi'),('Wallet','wallet'),('Bank Transfer','bank'),('Credit Card','card')) v(name,kind)
where not exists (select 1 from public.methods);
