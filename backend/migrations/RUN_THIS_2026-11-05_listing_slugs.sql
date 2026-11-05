-- Readable listing addresses: /listing/<slug> (owner, 2026-11-05)
-- 1. A permanent slug per listing. Existing listings get theirs from RUN_THIS_2026-11-05_listing_slugs_data.sql
--    (made by scripts/listing_slugs.py, run that file right after this one).
-- 2. New listings get one on insert from the name; a short piece of the id keeps it unique. A slug never changes
--    afterwards, so links stay valid when a listing is renamed. /listing/<uuid> links keep working (301 redirect
--    in netlify/edge-functions/listing-seo.js).

alter table public.directory_entries add column if not exists slug text;
create unique index if not exists directory_entries_slug on public.directory_entries (slug) where slug is not null;
alter table public.directory_entries drop constraint if exists directory_entries_slug_format;
alter table public.directory_entries add constraint directory_entries_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create or replace function public.directory_entries_set_slug()
returns trigger language plpgsql set search_path = public as $$
declare base text;
begin
  if tg_op = 'UPDATE' then
    new.slug := coalesce(old.slug, new.slug);   -- set once, then never changed
    if new.slug is not null then return new; end if;
  end if;
  if new.slug is null then
    base := lower(coalesce(new.organization_name, ''));
    base := replace(replace(replace(replace(base, 'ß', 'ss'), 'æ', 'ae'), 'ø', 'o'), '&', ' and ');
    base := translate(base, 'áàâäãåāéèêëēíìîïóòôöõōúùûüūñçýÿčšžřěůňťďľĺ', 'aaaaaaaeeeeeiiiiooooooouuuuuncyycszreuntdll');
    base := trim(both '-' from regexp_replace(base, '[^a-z0-9]+', '-', 'g'));
    base := left(base, 60);
    base := trim(both '-' from base);
    if length(base) < 3 then base := 'listing'; end if;
    new.slug := base || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;
  return new;
end $$;
drop trigger if exists directory_entries_set_slug on public.directory_entries;
create trigger directory_entries_set_slug before insert or update on public.directory_entries
  for each row execute function public.directory_entries_set_slug();

-- Check: expect 1
select count(*) as slug_column from information_schema.columns
where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'slug';
