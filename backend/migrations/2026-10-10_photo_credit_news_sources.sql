-- Credit line for listing photos that require attribution (Wikimedia Commons), and a guard so the
-- news roundup never stores the same article twice.
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS photo_credit text;
CREATE UNIQUE INDEX IF NOT EXISTS news_source_url_unique ON public.news (source_url) WHERE source_url IS NOT NULL;
