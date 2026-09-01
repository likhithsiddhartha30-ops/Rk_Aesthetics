-- =============================================================
-- RK Aesthetics — Supabase schema
-- Accounts, catalogue, orders, and download entitlements.
--
-- Run this in the Supabase SQL editor (or as a migration).
-- It is safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
--
-- NOTE ON LOGIN DETAILS: passwords, sessions, OAuth identities and
-- email verification all live in Supabase's own `auth.users` table.
-- Never store passwords yourself. `public.profiles` below holds only
-- the profile data that belongs to your app.
-- =============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive email


-- =============================================================
-- 1. PROFILES — one row per signed-up user
-- =============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  email        citext,
  phone        text,
  city         text,
  state        text,
  gstin        text,
  marketing_ok boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_phone_valid check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  constraint profiles_gstin_valid check (
    gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'
  )
);

comment on table public.profiles is
  'App-level profile data. Credentials live in auth.users.';


-- Create the profile automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- =============================================================
-- 2. CATALOGUE — products, their files, and bundle contents
-- =============================================================
create table if not exists public.products (
  id          text primary key,               -- matches the ids in js/products.js
  name        text        not null,
  category    text        not null check (category in ('bundle','nutrition','training','recovery')),
  price_inr   integer     not null check (price_inr >= 0),   -- whole rupees; × 100 for Razorpay paise
  old_price_inr integer   check (old_price_inr is null or old_price_inr > price_inr),
  is_bundle   boolean     not null default false,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);


-- The actual PDFs. `storage_path` points into a PRIVATE storage
-- bucket — never a public URL.
create table if not exists public.product_files (
  id           uuid primary key default gen_random_uuid(),
  product_id   text        not null references public.products (id) on delete cascade,
  display_name text        not null,
  storage_path text        not null unique,   -- e.g. 'products/04-the-cortisol-reset.pdf'
  bytes        bigint,
  sort_order   integer     not null default 0
);

create index if not exists product_files_product_idx
  on public.product_files (product_id);


-- Which products a bundle contains. Buying the bundle grants each one.
create table if not exists public.bundle_items (
  bundle_id  text not null references public.products (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  primary key (bundle_id, product_id),
  constraint bundle_not_self check (bundle_id <> product_id)
);


-- =============================================================
-- 3. ORDERS
-- =============================================================
do $$ begin
  create type public.order_status as enum ('created','paid','failed','refunded');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text unique not null default 'RK' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8)),
  user_id         uuid references auth.users (id) on delete set null,

  -- Snapshot of the buyer at purchase time. Kept even if they later
  -- edit their profile, because an invoice must not change.
  email           citext      not null,
  full_name       text        not null,
  phone           text,
  city            text,
  state           text,
  gstin           text,
  notes           text,

  status          public.order_status not null default 'created',
  subtotal_inr    integer     not null check (subtotal_inr >= 0),
  total_inr       integer     not null check (total_inr >= 0),
  currency        text        not null default 'INR',

  -- Razorpay bookkeeping
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,

  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint orders_paid_needs_timestamp check (status <> 'paid' or paid_at is not null)
);

create index if not exists orders_user_idx    on public.orders (user_id, created_at desc);
create index if not exists orders_email_idx   on public.orders (email);
create index if not exists orders_status_idx  on public.orders (status);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();


create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid    not null references public.orders (id) on delete cascade,
  product_id    text    not null references public.products (id),
  -- Name and price are snapshotted: changing your prices must not
  -- rewrite what someone paid last year.
  product_name  text    not null,
  unit_price_inr integer not null check (unit_price_inr >= 0),

  -- One copy per product per order, enforced by the database.
  unique (order_id, product_id)
);

create index if not exists order_items_order_idx on public.order_items (order_id);


-- =============================================================
-- 4. ENTITLEMENTS — the source of truth for "can they download it"
-- =============================================================
create table if not exists public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  product_id  text        not null references public.products (id) on delete cascade,
  order_id    uuid        references public.orders (id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,                    -- set on refund; never delete the row

  unique (user_id, product_id)
);

create index if not exists entitlements_user_idx on public.entitlements (user_id);


-- Audit trail: who downloaded what, when. Useful for spotting a
-- shared account before it costs you real money.
create table if not exists public.download_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  file_id     uuid        not null references public.product_files (id) on delete cascade,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists download_events_user_idx
  on public.download_events (user_id, created_at desc);


-- =============================================================
-- 5. HELPER FUNCTIONS
-- =============================================================

-- Does the current user own this product, directly or via a bundle?
create or replace function public.user_owns_product(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.user_id = auth.uid()
      and e.revoked_at is null
      and (
        e.product_id = p_product_id
        or exists (
          select 1 from public.bundle_items b
          where b.bundle_id = e.product_id
            and b.product_id = p_product_id
        )
      )
  );
$$;


-- Everything the signed-in user can download, bundles expanded.
create or replace function public.my_library()
returns table (
  product_id   text,
  product_name text,
  file_id      uuid,
  display_name text,
  storage_path text,
  granted_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with owned as (
    select e.product_id, e.granted_at from public.entitlements e
    where e.user_id = auth.uid() and e.revoked_at is null
    union
    select b.product_id, e.granted_at
    from public.entitlements e
    join public.bundle_items b on b.bundle_id = e.product_id
    where e.user_id = auth.uid() and e.revoked_at is null
  )
  select p.id, p.name, f.id, f.display_name, f.storage_path, o.granted_at
  from owned o
  join public.products p       on p.id = o.product_id
  join public.product_files f  on f.product_id = p.id
  order by p.sort_order, f.sort_order;
$$;


-- Called by your webhook (service_role) once Razorpay confirms payment.
-- Marks the order paid and grants every purchased product in one go.
create or replace function public.grant_order_entitlements(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.orders where id = p_order_id;
  if v_user_id is null then
    raise exception 'Order % has no user attached', p_order_id;
  end if;

  update public.orders
     set status = 'paid', paid_at = coalesce(paid_at, now())
   where id = p_order_id;

  insert into public.entitlements (user_id, product_id, order_id)
  select v_user_id, oi.product_id, p_order_id
  from public.order_items oi
  where oi.order_id = p_order_id
  on conflict (user_id, product_id) do update
    set revoked_at = null;      -- re-buying after a refund restores access
end;
$$;


-- =============================================================
-- 6. ROW LEVEL SECURITY
-- Everything is denied by default; each policy opens one door.
-- The service_role key used by your payment webhook bypasses RLS,
-- which is exactly why orders and entitlements have no client-side
-- INSERT policy — a browser must never be able to grant itself a PDF.
-- =============================================================
alter table public.profiles        enable row level security;
alter table public.products        enable row level security;
alter table public.product_files   enable row level security;
alter table public.bundle_items    enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.entitlements    enable row level security;
alter table public.download_events enable row level security;

-- ---- profiles: you may read and edit only your own ----
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---- catalogue: readable by anyone, including logged-out visitors ----
drop policy if exists "catalogue is public" on public.products;
create policy "catalogue is public" on public.products
  for select using (is_active);

drop policy if exists "bundle contents are public" on public.bundle_items;
create policy "bundle contents are public" on public.bundle_items
  for select using (true);

-- ---- product_files: ONLY visible for products you are entitled to ----
drop policy if exists "read files you own" on public.product_files;
create policy "read files you own" on public.product_files
  for select using (public.user_owns_product(product_id));

-- ---- orders and their items: your own history ----
drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- ---- entitlements: read-only to the owner ----
drop policy if exists "read own entitlements" on public.entitlements;
create policy "read own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);

-- ---- download events: you may see your own history ----
drop policy if exists "read own downloads" on public.download_events;
create policy "read own downloads" on public.download_events
  for select using (auth.uid() = user_id);


-- =============================================================
-- 7. SEED — your current catalogue
-- =============================================================
insert into public.products (id, name, category, price_inr, old_price_inr, is_bundle, sort_order) values
  ('executive-body-system',       'The Executive Body System',    'bundle',    3000, 3591, true,  0),
  ('corporate-diet-plan',         'The Corporate Diet Plan',      'nutrition',  399, null, false, 1),
  ('corporate-workout-plan',      'The Corporate Workout Plan',   'training',   399, null, false, 2),
  ('fixing-your-sleep-schedule',  'Fixing Your Sleep Schedule',   'recovery',   399, null, false, 3),
  ('cortisol-reset',              'The Cortisol Reset',           'recovery',   399, null, false, 4),
  ('office-lunch-guide',          'The Office Lunch Guide',       'nutrition',  399, null, false, 5),
  ('business-travel-nutrition',   'Business Travel Nutrition Plan','nutrition', 399, null, false, 6),
  ('weekend-eating-control',      'Weekend Eating Control Plan',  'nutrition',  399, null, false, 7),
  ('desk-job-mobility',           'The Desk-Job Mobility Plan',   'recovery',   399, null, false, 8),
  ('three-day-executive-workout', 'The 3-Day Executive Workout',  'training',   399, null, false, 9)
on conflict (id) do update
  set name = excluded.name,
      category = excluded.category,
      price_inr = excluded.price_inr,
      old_price_inr = excluded.old_price_inr,
      sort_order = excluded.sort_order;


-- The bundle contains all nine singles.
insert into public.bundle_items (bundle_id, product_id)
select 'executive-body-system', id
from public.products
where is_bundle = false
on conflict do nothing;


-- One PDF per single product. Paths are inside the private bucket.
insert into public.product_files (product_id, display_name, storage_path, sort_order) values
  ('corporate-diet-plan',         'The Corporate Diet Plan',       'products/01-the-corporate-diet-plan.pdf',      0),
  ('corporate-workout-plan',      'The Corporate Workout Plan',    'products/02-the-corporate-workout-plan.pdf',   0),
  ('fixing-your-sleep-schedule',  'Fixing Your Sleep Schedule',    'products/03-fixing-your-sleep-schedule.pdf',   0),
  ('cortisol-reset',              'The Cortisol Reset',            'products/04-the-cortisol-reset.pdf',           0),
  ('office-lunch-guide',          'The Office Lunch Guide',        'products/05-the-office-lunch-guide.pdf',       0),
  ('business-travel-nutrition',   'Business Travel Nutrition Plan','products/06-business-travel-nutrition-plan.pdf',0),
  ('weekend-eating-control',      'Weekend Eating Control Plan',   'products/07-weekend-eating-control-plan.pdf',  0),
  ('desk-job-mobility',           'The Desk-Job Mobility Plan',    'products/08-the-desk-job-mobility-plan.pdf',   0),
  ('three-day-executive-workout', 'The 3-Day Executive Workout',   'products/09-the-3-day-executive-workout.pdf',  0),
  -- the catalogue PDF ships with the bundle
  ('executive-body-system',       'Product Catalogue & Pricing',   'products/00-product-catalog-and-pricing.pdf',  0)
on conflict (storage_path) do nothing;


-- =============================================================
-- 8. PRIVATE STORAGE BUCKET
-- Files go here, NOT in your public repo. Downloads are served as
-- short-lived signed URLs created server-side after checking
-- user_owns_product().
-- =============================================================
insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false)
on conflict (id) do nothing;

-- No storage policies for regular users on purpose: nobody reads this
-- bucket directly. Your server creates signed URLs with the service_role
-- key, which is the only thing that should ever touch these objects.


-- =============================================================
-- 9. GUEST CHECKOUT
-- There is no login on the site: an order is identified by its own
-- uuid, which the buyer receives after paying and which is useless
-- until the order is marked paid. Everything below relaxes the
-- account-shaped assumptions above so a guest order works.
-- =============================================================

-- orders.user_id is already nullable; entitlements are only written
-- for signed-in buyers, so guests simply have none.

-- Downloads are logged against the order when there is no user.
alter table public.download_events alter column user_id drop not null;
alter table public.download_events
  add column if not exists order_id uuid references public.orders (id) on delete set null;

create index if not exists download_events_order_idx
  on public.download_events (order_id, created_at desc);

-- Granting entitlements only makes sense for a signed-in buyer.
create or replace function public.grant_order_entitlements(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.orders where id = p_order_id;

  update public.orders
     set status = 'paid', paid_at = coalesce(paid_at, now())
   where id = p_order_id;

  -- Guest order: paid is all there is to record.
  if v_user_id is null then
    return;
  end if;

  insert into public.entitlements (user_id, product_id, order_id)
  select v_user_id, oi.product_id, p_order_id
  from public.order_items oi
  where oi.order_id = p_order_id
  on conflict (user_id, product_id) do update
    set revoked_at = null;      -- re-buying after a refund restores access
end;
$$;

-- No client ever reads orders directly in the guest flow: the Edge
-- Functions do it with the service role. The RLS policies above stay
-- as they are, which means an anonymous browser can read nothing.
