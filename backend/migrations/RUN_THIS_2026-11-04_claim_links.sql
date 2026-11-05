-- Claim a listing by a private link (owner, 2026-11-04)
-- An invite email to the listing's own public email address carries /claim/<token>. Whoever opens it and
-- signs in becomes the listing's manager at once: receiving mail at that address is the proof, so no admin
-- approval is needed. Tokens are made by scripts/queue_claim_invites.py (service role) and work once.
-- The public cannot read the table; two functions give exactly what the claim page needs.

create table if not exists public.listing_claim_tokens (
  token      text primary key check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  entry_id   uuid not null references public.directory_entries (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '120 days',
  used_at    timestamptz,
  used_by    uuid
);
create index if not exists listing_claim_tokens_entry on public.listing_claim_tokens (entry_id);
alter table public.listing_claim_tokens enable row level security;
drop policy if exists claim_tokens_admin_read on public.listing_claim_tokens;
create policy claim_tokens_admin_read on public.listing_claim_tokens for select to authenticated using (public.is_admin());
revoke all on public.listing_claim_tokens from anon, authenticated;
grant select on public.listing_claim_tokens to authenticated;

-- What the claim page shows before sign-in: the listing's id and name, and whether the link still works
create or replace function public.claim_token_info(p_token text)
returns table (entry_id uuid, organization_name text, state text)
language sql stable security definer set search_path = public as $$
  select d.id, d.organization_name,
    case when t.used_at is not null then 'used'
         when t.expires_at < now() then 'expired'
         when d.claimed_by is not null then 'claimed'
         else 'ok' end
  from public.listing_claim_tokens t join public.directory_entries d on d.id = t.entry_id
  where t.token = p_token;
$$;
revoke all on function public.claim_token_info(text) from public;
grant execute on function public.claim_token_info(text) to anon, authenticated;

-- Signed in: claim the listing with the link. Returns the listing id.
create or replace function public.claim_listing_with_token(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare t public.listing_claim_tokens; d public.directory_entries;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into t from public.listing_claim_tokens where token = p_token for update;
  if not found then raise exception 'This claim link is not valid.'; end if;
  select * into d from public.directory_entries where id = t.entry_id for update;
  if d.claimed_by = auth.uid() then return d.id; end if;   -- opened twice: already theirs
  if t.used_at is not null then raise exception 'This claim link has already been used.'; end if;
  if t.expires_at < now() then raise exception 'This claim link has expired. Please use "Claim this listing" on the listing page.'; end if;
  if d.claimed_by is not null then raise exception 'This listing is already managed by someone else. Please email hello@sophiacommons.org.'; end if;
  update public.directory_entries set claimed_by = auth.uid(), updated_at = now() where id = d.id;
  update public.listing_claim_tokens set used_at = now(), used_by = auth.uid() where token = p_token;
  -- any open claim requests on this listing are closed
  update public.listing_claims set status = 'rejected', decided_at = now() where entry_id = d.id and status = 'pending';
  return d.id;
end $$;
revoke all on function public.claim_listing_with_token(text) from public, anon;
grant execute on function public.claim_listing_with_token(text) to authenticated;

-- Check: expect 1 row, then state 'none' rows = 0
select count(*) as table_exists from information_schema.tables where table_schema = 'public' and table_name = 'listing_claim_tokens';
select count(*) as should_be_0 from public.claim_token_info('not-a-real-token-xxxxxxxxxxxxxxxx');
