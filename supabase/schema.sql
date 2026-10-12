-- Lost & Found — Supabase schema
-- Run in Supabase SQL editor.

create extension if not exists "uuid-ossp";

create table schools (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plan text not null default 'free',
  retention_days int not null default 30,
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  school_id uuid references schools(id),
  display_name text,
  role text not null default 'member' check (role in ('member','staff','admin')),
  created_at timestamptz default now()
);

create type item_status as enum ('found','claimed','donated');

create table items (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id),
  photo_url text,
  category text not null,
  color text,
  description text,
  is_valuable boolean not null default false, -- hide details publicly
  location_found text,
  date_found date not null default current_date,
  status item_status not null default 'found',
  logged_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table reports (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id),
  user_id uuid not null references profiles(id),
  category text not null,
  color text,
  description text,
  date_lost date,
  location_guess text,
  status text not null default 'open' check (status in ('open','matched','closed')),
  created_at timestamptz default now()
);

create table claims (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  user_id uuid not null references profiles(id),
  verification_answer text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid references profiles(id),
  picked_up_at timestamptz,
  created_at timestamptz default now()
);

create table qr_tags (
  code text primary key,
  owner_user_id uuid references profiles(id),
  item_label text,
  created_at timestamptz default now()
);

create index on items (school_id, status, category);
create index on reports (school_id, status, category);

-- Helper functions
create or replace function my_school() returns uuid
language sql stable security definer as $$
  select school_id from profiles where id = auth.uid()
$$;

create or replace function is_staff() returns boolean
language sql stable security definer as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('staff','admin'))
$$;

-- Public view hides details of valuables
create or replace view items_public as
select id, school_id, category, color, location_found, date_found, status,
       case when is_valuable then null else photo_url end as photo_url,
       case when is_valuable then 'Valuable item — describe it to claim' else description end as description
from items
where school_id = my_school();  -- view runs as owner, so scope it to the viewer's school
grant select on items_public to authenticated;

-- Row Level Security
alter table schools  enable row level security;
alter table profiles enable row level security;
alter table items    enable row level security;
alter table reports  enable row level security;
alter table claims   enable row level security;
alter table qr_tags  enable row level security;

create policy "read own school" on schools for select using (id = my_school());

create policy "read own profile" on profiles for select using (id = auth.uid() or (is_staff() and school_id = my_school()));
create policy "update own profile" on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

create policy "staff read items" on items for select using (school_id = my_school() and is_staff());
create policy "staff write items" on items for all using (school_id = my_school() and is_staff())
  with check (school_id = my_school() and is_staff());

create policy "own reports" on reports for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and school_id = my_school());
create policy "staff read reports" on reports for select using (school_id = my_school() and is_staff());

create policy "create own claim" on claims for insert with check (user_id = auth.uid());
create policy "read own claims" on claims for select using (user_id = auth.uid());
create policy "staff manage claims" on claims for all using (
  is_staff() and exists(select 1 from items i where i.id = item_id and i.school_id = my_school()));

create policy "own tags" on qr_tags for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Simple matching: open reports vs found items (same category, color, within 14 days)
create or replace function match_report(report uuid)
returns setof items_public language sql stable security definer as $$
  select p.* from items_public p
  join reports r on r.id = report
  where r.user_id = auth.uid()
    and p.school_id = r.school_id
    and p.status = 'found'
    and p.category = r.category
    and (r.color is null or p.color is null or lower(p.color) = lower(r.color))
    and (r.date_lost is null or p.date_found between r.date_lost and r.date_lost + 14)
  order by p.date_found desc
$$;

-- Storage bucket for photos
insert into storage.buckets (id, name, public) values ('item-photos','item-photos', true)
on conflict do nothing;
create policy "staff upload photos" on storage.objects for insert
  with check (bucket_id = 'item-photos' and is_staff());
