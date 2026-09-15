-- ---------------------------------------------------------------------
-- Super Makarios — Supabase schema
--
-- Run this once in your Supabase project's SQL Editor (Dashboard ->
-- SQL Editor -> New query -> paste this whole file -> Run).
-- Safe to re-run: every statement is idempotent.
-- ---------------------------------------------------------------------

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ------------------------------- Tables -------------------------------

create table if not exists public.shelves (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  description text,
  shelf_id uuid references public.shelves(id) on delete set null,
  epub_path text not null,
  cover_path text,
  created_at timestamptz not null default now()
);

create index if not exists books_shelf_id_idx on public.books(shelf_id);

-- --------------------------- Row Level Security ---------------------------
-- Anyone (including anonymous visitors) can READ books and shelves — the
-- library is public. Only signed-in users can add/edit/delete — and since
-- this app has no public sign-up, "signed in" means an admin account you
-- created yourself in Authentication -> Users.

alter table public.shelves enable row level security;
alter table public.books enable row level security;

drop policy if exists "Public can read shelves" on public.shelves;
create policy "Public can read shelves" on public.shelves
  for select using (true);

drop policy if exists "Signed-in users manage shelves" on public.shelves;
create policy "Signed-in users manage shelves" on public.shelves
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Public can read books" on public.books;
create policy "Public can read books" on public.books
  for select using (true);

drop policy if exists "Signed-in users manage books" on public.books;
create policy "Signed-in users manage books" on public.books
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ------------------------------- Storage -------------------------------
-- Two public buckets: one for EPUB files, one for cover images. Public
-- so the app can serve them without signing every request; anyone with
-- the exact file URL can fetch it, which is fine for church reading
-- material. Uploads/deletes still require an authenticated admin.

insert into storage.buckets (id, name, public, file_size_limit)
values ('epubs', 'epubs', true, 209715200) -- 200MB per file
on conflict (id) do update set public = true, file_size_limit = 209715200;

insert into storage.buckets (id, name, public, file_size_limit)
values ('covers', 'covers', true, 10485760) -- 10MB per file
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists "Public can read epub files" on storage.objects;
create policy "Public can read epub files" on storage.objects
  for select using (bucket_id = 'epubs');

drop policy if exists "Signed-in users upload epub files" on storage.objects;
create policy "Signed-in users upload epub files" on storage.objects
  for insert with check (bucket_id = 'epubs' and auth.role() = 'authenticated');

drop policy if exists "Signed-in users update epub files" on storage.objects;
create policy "Signed-in users update epub files" on storage.objects
  for update using (bucket_id = 'epubs' and auth.role() = 'authenticated');

drop policy if exists "Signed-in users delete epub files" on storage.objects;
create policy "Signed-in users delete epub files" on storage.objects
  for delete using (bucket_id = 'epubs' and auth.role() = 'authenticated');

drop policy if exists "Public can read covers" on storage.objects;
create policy "Public can read covers" on storage.objects
  for select using (bucket_id = 'covers');

drop policy if exists "Signed-in users upload covers" on storage.objects;
create policy "Signed-in users upload covers" on storage.objects
  for insert with check (bucket_id = 'covers' and auth.role() = 'authenticated');

drop policy if exists "Signed-in users update covers" on storage.objects;
create policy "Signed-in users update covers" on storage.objects
  for update using (bucket_id = 'covers' and auth.role() = 'authenticated');

drop policy if exists "Signed-in users delete covers" on storage.objects;
create policy "Signed-in users delete covers" on storage.objects
  for delete using (bucket_id = 'covers' and auth.role() = 'authenticated');

-- ------------------------------- Seed data (optional) -------------------------------
-- Uncomment to start with a couple of example shelves.
-- insert into public.shelves (name, sort_order) values
--   ('Devotionals', 0),
--   ('Bible Studies', 1),
--   ('Sermons & Teaching', 2)
-- on conflict (name) do nothing;
