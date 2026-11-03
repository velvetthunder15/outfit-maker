-- AI Outfit Maker: schema living inside a shared Supabase project.
-- Every object is prefixed om_ (bucket om-wardrobe) so nothing collides with other apps.
-- No triggers on auth.users: om_profiles rows are created lazily by the app.

create table if not exists public.om_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  gender_identity text,          -- woman / man / non-binary / prefer not to say
  style_identity text,           -- womenswear / menswear / both
  body_type text,
  height_cm int,
  skin_tone text,
  undertone text,
  budget text,                   -- low / mid / high / luxury
  style_prefs text[] not null default '{}',
  fav_colors text[] not null default '{}',
  avoid_colors text[] not null default '{}',
  modesty text,
  home_city text,
  notes text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.om_wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text,               -- storage path in bucket 'om-wardrobe': <uid>/<uuid>.webp
  thumb_path text,               -- <uid>/<uuid>_t.webp (~300px)
  name text,
  category text,                 -- top/bottom/dress/outerwear/shoes/jewellery/watch/bag/belt/eyewear/hat/scarf/other
  subcategory text,
  colors text[] not null default '{}',
  pattern text,
  fabric text,
  formality text,                -- casual / smart-casual / business / formal / festive
  seasons text[] not null default '{}',
  styles text[] not null default '{}',
  notes text,
  tag_status text not null default 'pending' check (tag_status in ('pending','done','failed','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists om_wardrobe_items_user_idx on public.om_wardrobe_items(user_id, created_at desc);

create table if not exists public.om_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  mode text not null default 'wardrobe' check (mode in ('wardrobe','general')),
  mood text,
  occasion text,
  destination jsonb,             -- {name, lat, lon, country}
  when_at timestamptz,
  time_of_day text,
  weather jsonb,
  request jsonb,
  result jsonb not null,
  item_ids uuid[] not null default '{}',
  is_saved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists om_outfits_user_idx on public.om_outfits(user_id, created_at desc);

create table if not exists public.om_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid not null references public.om_outfits(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, outfit_id)
);

create table if not exists public.om_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);

alter table public.om_profiles enable row level security;
alter table public.om_wardrobe_items enable row level security;
alter table public.om_outfits enable row level security;
alter table public.om_feedback enable row level security;
alter table public.om_ai_usage enable row level security;

-- profiles
create policy "om_profiles_select_own" on public.om_profiles for select using (auth.uid() = id);
create policy "om_profiles_insert_own" on public.om_profiles for insert with check (auth.uid() = id);
create policy "om_profiles_update_own" on public.om_profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "om_profiles_delete_own" on public.om_profiles for delete using (auth.uid() = id);
-- wardrobe
create policy "om_wardrobe_select_own" on public.om_wardrobe_items for select using (auth.uid() = user_id);
create policy "om_wardrobe_insert_own" on public.om_wardrobe_items for insert with check (auth.uid() = user_id);
create policy "om_wardrobe_update_own" on public.om_wardrobe_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "om_wardrobe_delete_own" on public.om_wardrobe_items for delete using (auth.uid() = user_id);
-- outfits
create policy "om_outfits_select_own" on public.om_outfits for select using (auth.uid() = user_id);
create policy "om_outfits_insert_own" on public.om_outfits for insert with check (auth.uid() = user_id);
create policy "om_outfits_update_own" on public.om_outfits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "om_outfits_delete_own" on public.om_outfits for delete using (auth.uid() = user_id);
-- feedback
create policy "om_feedback_select_own" on public.om_feedback for select using (auth.uid() = user_id);
create policy "om_feedback_insert_own" on public.om_feedback for insert with check (auth.uid() = user_id);
create policy "om_feedback_update_own" on public.om_feedback for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "om_feedback_delete_own" on public.om_feedback for delete using (auth.uid() = user_id);
-- ai_usage: read-only for the owner; writes only through consume_ai_quota()
create policy "om_ai_usage_select_own" on public.om_ai_usage for select using (auth.uid() = user_id);

-- Atomic per-user daily quota. Returns remaining count, or -1 when the limit is hit.
create or replace function public.om_consume_ai_quota(p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  v_limit := case p_kind when 'outfit' then 30 when 'tag' then 300 when 'tryon' then 5 else 30 end;
  insert into public.om_ai_usage(user_id, day, kind, count)
  values (v_uid, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = public.om_ai_usage.count + 1
  where public.om_ai_usage.count < v_limit
  returning count into v_count;
  if v_count is null then
    return -1;
  end if;
  return v_limit - v_count;
end;
$$;
revoke all on function public.om_consume_ai_quota(text) from public, anon;
grant execute on function public.om_consume_ai_quota(text) to authenticated;

-- Wardrobe cap: 300 items per user (keeps shared 1 GB storage safe)
create or replace function public.om_wardrobe_cap() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.om_wardrobe_items where user_id = new.user_id) >= 300 then
    raise exception 'wardrobe_full' using hint = 'Wardrobe limit is 300 items';
  end if;
  return new;
end; $$;
create trigger om_wardrobe_cap_trg before insert on public.om_wardrobe_items for each row execute function public.om_wardrobe_cap();

-- updated_at
create or replace function public.om_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger om_profiles_touch before update on public.om_profiles for each row execute function public.om_touch_updated_at();
create trigger om_wardrobe_touch before update on public.om_wardrobe_items for each row execute function public.om_touch_updated_at();

-- Storage: private bucket, each user only touches <uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('om-wardrobe', 'om-wardrobe', false, 1048576, array['image/webp','image/jpeg'])
on conflict (id) do nothing;

create policy "om_wardrobe_obj_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'om-wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "om_wardrobe_obj_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'om-wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "om_wardrobe_obj_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'om-wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "om_wardrobe_obj_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'om-wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
