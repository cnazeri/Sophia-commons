-- English versions of events written in another language, for the home page (owner, 2026-11-09).
-- automation/translate_events.py fills these daily. lang stays NULL until an event has been checked;
-- English events get lang 'en' and no title_en.
alter table public.events
  add column if not exists lang text,
  add column if not exists title_en text,
  add column if not exists description_en text;

begin;
drop function public.get_upcoming_events(integer, integer);
create function public.get_upcoming_events(days_ahead integer default 30, limit_n integer default 20)
  returns table(id uuid, title text, description text, event_type text, start_date timestamptz, end_date timestamptz,
    is_all_day boolean, location_name text, city text, region text, country text, is_online boolean, online_url text,
    organizer_name text, ticket_url text, ticket_price numeric, is_free boolean, image_url text, status text,
    featured boolean, created_at timestamptz, category_slug text, category_name text, title_en text, description_en text)
  language sql stable
as $function$
  select e.id, e.title, e.description, e.event_type, e.start_date, e.end_date,
    e.is_all_day, e.location_name, e.city, e.region, e.country, e.is_online,
    e.online_url, e.organizer_name, e.ticket_url, e.ticket_price, e.is_free,
    e.image_url, e.status, e.featured, e.created_at,
    c.slug as category_slug, c.name as category_name, e.title_en, e.description_en
  from public.events e
  left join public.categories c on c.id = e.category_id
  where e.status in ('upcoming','ongoing') and e.start_date >= now()
    and e.start_date <= now() + (days_ahead || ' days')::interval
  order by e.featured desc, e.start_date asc limit least(limit_n, 100);
$function$;
grant execute on function public.get_upcoming_events(integer, integer) to anon, authenticated;
commit;
