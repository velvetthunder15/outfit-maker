-- 0002: white-background cutouts (Outfit Maker only; om_ tables in the shared project)
-- image_path / thumb_path now hold the cutout (white 4:5 product shot) when image_kind = 'cutout'.
-- source_path keeps the original photo (one file can be shared by several pieces cut from the same photo).
alter table public.om_wardrobe_items
  add column if not exists source_path text,
  add column if not exists image_kind text not null default 'photo';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'om_wardrobe_items_image_kind_chk') then
    alter table public.om_wardrobe_items
      add constraint om_wardrobe_items_image_kind_chk check (image_kind in ('photo', 'cutout'));
  end if;
end $$;

create index if not exists om_wardrobe_items_source_idx on public.om_wardrobe_items(user_id, source_path) where source_path is not null;
