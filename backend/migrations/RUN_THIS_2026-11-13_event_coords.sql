-- Events near me (owner, 2026-11-13): upcoming events carry a map point, the event's own pin or else
-- the pin of the listing it belongs to, so the calendar can sort by distance from the visitor.
-- The return type changes, so the function is dropped and made again (same body plus lat, lng).

drop function if exists public.get_upcoming_events(integer, integer);

create function public.get_upcoming_events(days_ahead integer default 30, limit_n integer default 20)
returns table(id uuid, title text, description text, event_type text, start_date timestamptz, end_date timestamptz,
  is_all_day boolean, location_name text, city text, region text, country text, is_online boolean, online_url text,
  organizer_name text, ticket_url text, ticket_price numeric, is_free boolean, image_url text, status text,
  featured boolean, created_at timestamptz, category_slug text, category_name text, title_en text, description_en text,
  lat double precision, lng double precision)
language sql stable
as $function$
  select e.id, e.title, e.description, e.event_type, e.start_date, e.end_date,
    e.is_all_day, e.location_name, e.city, e.region, e.country, e.is_online,
    e.online_url, e.organizer_name, e.ticket_url, e.ticket_price, e.is_free,
    e.image_url, e.status, e.featured, e.created_at,
    c.slug as category_slug, c.name as category_name, e.title_en, e.description_en,
    case when e.is_online then null else coalesce(e.latitude, d.latitude)::double precision end as lat,
    case when e.is_online then null else coalesce(e.longitude, d.longitude)::double precision end as lng
  from public.events e
  left join public.categories c on c.id = e.category_id
  left join public.directory_entries d on d.id = e.directory_entry_id and d.status = 'approved'
  where e.status in ('upcoming','ongoing') and e.start_date >= now()
    and e.start_date <= now() + (days_ahead || ' days')::interval
  order by e.featured desc, e.start_date asc limit least(limit_n, 100);
$function$;

grant execute on function public.get_upcoming_events(integer, integer) to anon, authenticated;

-- Check: expect a number of events with a point
select count(*) filter (where lat is not null) as with_point, count(*) as total from public.get_upcoming_events(365, 100);
