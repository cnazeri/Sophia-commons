-- =============================================================================
-- Sophia Commons :: YouTube channels, weekly video feed, channel suggestions
-- Run once in Supabase Dashboard -> SQL Editor (idempotent; safe to re-run).
--
-- Tables
--   youtube_channels          curated channel list (seeded from automation/youtube_channels.json
--                             every week by .github/workflows/weekly.yml)
--   youtube_videos            latest videos per channel (from YouTube RSS, no API key needed)
--   youtube_channels_pending  suggestions from visitors / auto-discovery, approved by admin
--
-- Access
--   anon / public: read active channels + videos; insert a suggestion
--   admin (app_metadata.role = 'admin'): full write
--   service role (GitHub Action secret): bypasses RLS for the weekly upsert
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.youtube_channels (
  slug             text        PRIMARY KEY,
  channel_id       text        UNIQUE,
  name             text        NOT NULL,
  url              text        NOT NULL,
  language         text,
  category         text        NOT NULL DEFAULT 'other',
  description      text,
  verified         boolean     NOT NULL DEFAULT false,
  active           boolean     NOT NULL DEFAULT true,
  thumbnail_url    text,
  last_video_at    timestamptz,
  video_count      integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_videos (
  video_id         text        PRIMARY KEY,
  channel_slug     text        NOT NULL REFERENCES public.youtube_channels (slug) ON DELETE CASCADE,
  title            text        NOT NULL,
  url              text        NOT NULL,
  thumbnail_url    text,
  published_at     timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_channels_pending (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text,
  url              text        NOT NULL,
  channel_id       text,
  language         text,
  category         text,
  note             text,
  source           text        NOT NULL DEFAULT 'visitor',   -- visitor | discovery
  status           text        NOT NULL DEFAULT 'pending'    -- pending | approved | rejected
                               CHECK (status IN ('pending','approved','rejected')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_youtube_videos_channel_pub ON public.youtube_videos (channel_slug, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_published   ON public.youtube_videos (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_category  ON public.youtube_channels (category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_youtube_pending_url ON public.youtube_channels_pending (lower(url));

-- updated_at trigger (set_updated_at() already exists in this project's schema.sql)
DROP TRIGGER IF EXISTS trg_youtube_channels_updated_at ON public.youtube_channels;
CREATE TRIGGER trg_youtube_channels_updated_at
  BEFORE UPDATE ON public.youtube_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.youtube_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_videos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_channels_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yt channels: public read active" ON public.youtube_channels;
CREATE POLICY "yt channels: public read active" ON public.youtube_channels
  FOR SELECT USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "yt channels: admin write" ON public.youtube_channels;
CREATE POLICY "yt channels: admin write" ON public.youtube_channels
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "yt videos: public read" ON public.youtube_videos;
CREATE POLICY "yt videos: public read" ON public.youtube_videos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "yt videos: admin write" ON public.youtube_videos;
CREATE POLICY "yt videos: admin write" ON public.youtube_videos
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Anyone may suggest a channel (only youtube.com URLs); only admins can see / moderate.
DROP POLICY IF EXISTS "yt pending: anyone suggest" ON public.youtube_channels_pending;
CREATE POLICY "yt pending: anyone suggest" ON public.youtube_channels_pending
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND url ~* '^https://(www\.|m\.)?youtube\.com/');

DROP POLICY IF EXISTS "yt pending: admin all" ON public.youtube_channels_pending;
CREATE POLICY "yt pending: admin all" ON public.youtube_channels_pending
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Convenience view: one row per channel with its newest video ────────────
CREATE OR REPLACE VIEW public.youtube_channel_latest AS
SELECT c.slug, c.name, c.url AS channel_url, c.language, c.category, c.description,
       c.verified, c.thumbnail_url AS channel_thumbnail,
       v.video_id, v.title AS video_title, v.url AS video_url,
       v.thumbnail_url AS video_thumbnail, v.published_at
FROM public.youtube_channels c
LEFT JOIN LATERAL (
  SELECT * FROM public.youtube_videos v
  WHERE v.channel_slug = c.slug
  ORDER BY v.published_at DESC NULLS LAST
  LIMIT 1
) v ON true
WHERE c.active = true;

GRANT SELECT ON public.youtube_channel_latest TO anon, authenticated;

-- ── Seed: the curated list (the weekly job keeps this in sync with the JSON) ──
INSERT INTO public.youtube_channels (slug, channel_id, name, url, language, category, description, verified) VALUES
  ('goetheanum','UCHd8RnL9WYIqCwH_SkPo8DQ','Goetheanum','https://www.youtube.com/channel/UCHd8RnL9WYIqCwH_SkPo8DQ','DE/EN','goetheanum','Official channel of the Goetheanum in Dornach: lectures, conference recordings, Goetheanum TV excerpts.',true),
  ('goetheanum-deutsch',NULL,'Goetheanum (deutsch)','https://www.youtube.com/c/goetheanumdeutsch','DE','goetheanum','German-language Goetheanum channel with talks and event documentation.',true),
  ('goetheanum-studium','UC6fRCIOT7f3UrtQrnwtiPJg','Goetheanum Studium','https://www.youtube.com/channel/UC6fRCIOT7f3UrtQrnwtiPJg','DE/EN','goetheanum','The Goetheanum study programme: introductory courses and student projects.',true),
  ('sektion-landwirtschaft','UCD4ZhiUedj331Z8pAsjfFsw','Section for Agriculture at the Goetheanum','https://www.youtube.com/@sektionfurlandwirtschaft7242','DE/EN','biodynamic','Agriculture conference lectures and biodynamic research talks from the Goetheanum.',true),
  ('medical-section-goetheanum',NULL,'Medical Section at the Goetheanum','https://www.youtube.com/@medicalsectiongoetheanum','EN/DE','medicine','Anthroposophic medicine lectures and conference recordings from the School of Spiritual Science.',true),
  ('anthroposophy-usa',NULL,'Anthroposophical Society in America','https://www.youtube.com/@AnthroposophyUSA','EN','society','Video lectures, conferences and community events from the ASA.',true),
  ('asa-faust-branch',NULL,'ASA Faust Branch, Sacramento','https://www.youtube.com/@asafaustbranchsacramento','EN','society','Recorded branch lectures and study evenings from Sacramento.',true),
  ('ag-stuttgart',NULL,'Anthroposophische Gesellschaft Stuttgart','https://www.youtube.com/c/AnthroposophischeGesellschaftStuttgart','DE','society','Lectures from the Rudolf Steiner Haus Stuttgart.',true),
  ('center-for-anthroposophy','UC3OoQXqjUVLOfvqP9blyKBA','Center for Anthroposophy','https://www.youtube.com/channel/UC3OoQXqjUVLOfvqP9blyKBA','EN','study-group','Wilton, NH: Waldorf teacher education and anthroposophy foundation courses.',true),
  ('anthroworld',NULL,'AnthroWorld','https://www.youtube.com/@anthroworld_anthroposophie','DE','other','Anthroposophy made accessible: interviews and explainer videos.',true),
  ('rsp-audio','UCTuPXQlrmPfDB7YLJWywnAg','Rudolf Steiner Press Audio','https://www.youtube.com/@RudolfSteinerPressAudio','EN','steiner-lectures','Full audiobook readings of Steiner''s lectures and books in English.',true),
  ('rudolf-steiner-press','UC9vJp_fc4eEpQCo7g70MYxA','Rudolf Steiner Press','https://www.youtube.com/channel/UC9vJp_fc4eEpQCo7g70MYxA','EN','publisher','Book presentations and author talks from the UK publisher.',true),
  ('steinerbooks',NULL,'SteinerBooks / Anthroposophic Press','https://www.youtube.com/c/SteinerBooksAnthroposophicPress','EN','publisher','Book launches, author interviews and lecture recordings.',true),
  ('word-of-rudolf-steiner','UCOwvwoBewlGL69WmM2LxUFQ','Word of Rudolf Steiner','https://www.youtube.com/channel/UCOwvwoBewlGL69WmM2LxUFQ','EN','steiner-lectures','English readings of Rudolf Steiner lectures and texts.',true),
  ('rudolf-steiner-official','UCPDQYbBPPjtib-Nmz-WcitA','Rudolf Steiner Official','https://www.youtube.com/@RudolfSteinerOfficial','EN','steiner-lectures','Narrated presentations of Steiner''s lectures and ideas.',false),
  ('rudolf-joseph-lorenz-steiner',NULL,'Rudolf Steiner ~ Anthroposophy','https://www.youtube.com/@RudolfJosephLorenzSteiner','EN','steiner-lectures','Lecture readings and anthroposophical topics in English.',true),
  ('rs-anthroposophy-waldorf',NULL,'Rudolf Steiner Anthroposophy Waldorf','https://www.youtube.com/c/RudolfSteinerAnthroposophyWaldorf','EN','steiner-lectures','Steiner, anthroposophy and Waldorf education through readings and talks.',true),
  ('rs-anthroposophie-de',NULL,'Rudolf Steiner und die Anthroposophie','https://www.youtube.com/@Rudolf-Steiner-Anthroposophie','DE','steiner-lectures','German readings of Steiner lectures and explanatory videos.',true),
  ('rs-audiobuecher','UCjeAmyLK5V2w3xUV8GCnULg','Rudolf Steiner Audiobücher','https://www.youtube.com/channel/UCjeAmyLK5V2w3xUV8GCnULg','DE','steiner-lectures','German audiobook readings of the Gesamtausgabe.',true),
  ('angelina-liest',NULL,'Angelina liest Rudolf Steiner','https://www.youtube.com/@AngelinaliestRudolfSteiner','DE','steiner-lectures','German readings of Steiner lectures by a single narrator.',true),
  ('anthro-meditation','UCv8u5DA8SknblsW3j6Cg_7w','Anthroposophische Meditation','https://www.youtube.com/channel/UCv8u5DA8SknblsW3j6Cg_7w','DE','study-group','Anthroposophical meditation practice based on Steiner''s exercises.',true),
  ('soi-esprit','UCv-8cGJpbPdU1W8gYAaCk_A','Soi-esprit Info (Rudolf Steiner, Anthroposophie)','https://www.youtube.com/channel/UCv-8cGJpbPdU1W8gYAaCk_A','FR','steiner-lectures','French readings and presentations of Steiner''s anthroposophy.',true),
  ('editorial-antroposofica','UC7a70Iv91LnmvhhD7fdDmpQ','Editorial Antroposófica','https://www.youtube.com/@editorialantroposofica','ES','publisher','Spanish-language publisher (Argentina): book presentations and lectures.',true),
  ('editora-antroposofica-br',NULL,'Editora e Livraria Antroposófica','https://www.youtube.com/editoraelivrariaantroposofica','PT','publisher','Brazilian publisher and bookshop: talks and book launches.',true),
  ('escola-waldorf-rs',NULL,'Escola Waldorf Rudolf Steiner (São Paulo)','https://www.youtube.com/c/EscolaWaldorfRudolfSteiner','PT','waldorf','Pedagogy talks and school life from Brazil''s oldest Waldorf school.',true),
  ('waldorftv-ru','UClnXhHfpuHyN032RRihX4RQ','WaldorfTV (ВальдорфТВ)','https://www.youtube.com/channel/UClnXhHfpuHyN032RRihX4RQ','RU','waldorf','Russian talks on Waldorf pedagogy and anthroposophy.',true),
  ('gaad',NULL,'GAÄD: Anthroposophic Physicians in Germany','https://www.youtube.com/@gaad-gesellschaftanthropos4600','DE','medicine','Medical lectures and patient information from the German physicians'' association.',true),
  ('eurythmy4you',NULL,'eurythmy4you','https://www.youtube.com/@eurythmy','EN','eurythmy','Guided online eurythmy exercises.',true),
  ('cynthia-hoven','UCA9ix0QIxW3_ZB5s6FyXkPg','Cynthia Hoven Eurythmy','https://www.youtube.com/channel/UCA9ix0QIxW3_ZB5s6FyXkPg','EN','eurythmy','Eurythmy demonstrations and teaching videos.',true),
  ('eurythmy-in-progress','UCSvBO4LhxDfzrfGdxuK-IiA','Eurythmy in Progress','https://www.youtube.com/channel/UCSvBO4LhxDfzrfGdxuK-IiA','EN','eurythmy','Contemporary eurythmy performance and training.',true),
  ('sound-circle-eurythmy',NULL,'Sound Circle Eurythmy','https://www.youtube.com/@soundcircleeurythmy2735','EN','eurythmy','Seattle-area eurythmy training: performances and courses.',true),
  ('eurythmeum-ch','UCQJCFt8f3yUEF1xQiIDoprg','Eurythmeum CH','https://www.youtube.com/channel/UCQJCFt8f3yUEF1xQiIDoprg','DE','eurythmy','Swiss eurythmy training school: performances and training insights.',true),
  ('logos-eurythmie',NULL,'Logos Eurythmie','https://www.youtube.com/logoseurythmie','DE','eurythmy','German eurythmy ensemble stage performances.',true),
  ('septim-eurythmy','UCaWcyj14f2Pp39d8sb5eNsA','SEPTIM Eurythmy','https://www.youtube.com/channel/UCaWcyj14f2Pp39d8sb5eNsA','EN','eurythmy','Eurythmy ensemble performance pieces.',true),
  ('creative-eurythmy','UCSs73zfN03jqsKpiNK80j4Q','Creative Eurythmy','https://www.youtube.com/channel/UCSs73zfN03jqsKpiNK80j4Q','EN','eurythmy','Eurythmy exercises and creative movement.',true),
  ('dedae','UCYm5lwQl959gUVLcCblpkRw','DeDae: Dutch Eurythmy Dance Ensemble','https://www.youtube.com/channel/UCYm5lwQl959gUVLcCblpkRw','NL','eurythmy','Dutch eurythmy ensemble stage performances.',true),
  ('demeter-international','UCX0s2VZR8Ksc8eDsIh8nlaw','Biodynamic Federation Demeter International','https://www.youtube.com/channel/UCX0s2VZR8Ksc8eDsIh8nlaw','EN','biodynamic','Films on biodynamic farms, standards and Demeter worldwide.',true),
  ('demeter-france','UCogeXJIOkO0R-40T8u7S5Xg','Demeter France','https://www.youtube.com/channel/UCogeXJIOkO0R-40T8u7S5Xg','FR','biodynamic','Biodynamic farming and certification in French.',true),
  ('bda-uk','UCCt0Mvn8JyNcvZRHJvJDMOw','Biodynamic Association UK','https://www.youtube.com/channel/UCCt0Mvn8JyNcvZRHJvJDMOw','EN','biodynamic','Introductory biodynamic gardening videos and farm case studies.',true),
  ('bda-usa','UCGtcLHBlDbqwxLc1DSJZoaw','Biodynamic Demeter Alliance (USA)','https://www.youtube.com/channel/UCGtcLHBlDbqwxLc1DSJZoaw','EN','biodynamic','North American conference talks and webinars.',true),
  ('dennis-klocek','UCORbXs0BkyvGF2K38n6ouzQ','Soil, Soul and Spirit with Dennis Klocek','https://www.youtube.com/channel/UCORbXs0BkyvGF2K38n6ouzQ','EN','lecturer','Goethean science, alchemy, biodynamics and meditation.',true),
  ('ecswe','UCnBqS6GTl2n9tM3OLrB2Yrw','European Council for Steiner Waldorf Education','https://www.youtube.com/channel/UCnBqS6GTl2n9tM3OLrB2Yrw','EN','waldorf','Policy and pedagogy videos from the European umbrella body.',true),
  ('waldorf-training-lectures','UCfUJilIaWlOXWidrnBuKtgA','Waldorf Training Lectures','https://www.youtube.com/channel/UCfUJilIaWlOXWidrnBuKtgA','EN','waldorf','Recorded Waldorf teacher-training lectures.',true),
  ('waldorfish','UCo3XaQeuf276rtXMOJKgViQ','Waldorfish','https://www.youtube.com/channel/UCo3XaQeuf276rtXMOJKgViQ','EN','waldorf','Online courses for Waldorf teachers and homeschoolers, especially the arts.',true),
  ('simply-waldorf','UCxh8dy78xEX78ek7q8feQVg','Simply Waldorf','https://www.youtube.com/channel/UCxh8dy78xEX78ek7q8feQVg','EN','waldorf','Waldorf homeschooling and family rhythm.',true),
  ('waldorf-essentials','UC4uSpWWVigJIFd6cfwJkUSA','Waldorf Essentials with Melisa Nielsen','https://www.youtube.com/channel/UC4uSpWWVigJIFd6cfwJkUSA','EN','waldorf','Waldorf homeschool curriculum and parenting.',true),
  ('acorn-hill','UC6O4ve2M4T1DOspqvMR3ELA','Acorn Hill Waldorf Kindergarten and Nursery','https://www.youtube.com/channel/UC6O4ve2M4T1DOspqvMR3ELA','EN','waldorf','Circle songs, stories and puppet plays for early childhood.',true),
  ('green-meadow','UCUVnXW0y7nHXxphldjsML9A','Green Meadow Waldorf School','https://www.youtube.com/channel/UCUVnXW0y7nHXxphldjsML9A','EN','waldorf','School events, talks and student performances (Chestnut Ridge, NY).',true),
  ('washington-waldorf','UCFZftRlR8uxQq8JDW8awxhA','Washington Waldorf School','https://www.youtube.com/channel/UCFZftRlR8uxQq8JDW8awxhA','EN','waldorf','School life and education talks (Bethesda, MD).',true),
  ('pedagogie-steiner-waldorf','UC0L1GmfLpYkikBzDxE0U8Lw','Pédagogie Steiner Waldorf','https://www.youtube.com/channel/UC0L1GmfLpYkikBzDxE0U8Lw','FR','waldorf','French federation of Steiner-Waldorf schools.',true),
  ('camphill-scotland','UCaeV5f5hQgcvm8AwGXUbORw','Camphill Scotland','https://www.youtube.com/channel/UCaeV5f5hQgcvm8AwGXUbORw','EN','camphill','Films about community life and social therapy in Scotland.',true),
  ('camphill-village-trust','UCSiZ3lBj8xuv65Ca2v1NJlQ','Camphill Village Trust','https://www.youtube.com/channel/UCSiZ3lBj8xuv65Ca2v1NJlQ','EN','camphill','UK Camphill communities: resident stories and news.',true),
  ('camphill-school-aberdeen','UCl3oUdWPwayC2lvQ_4gt5EA','Camphill School Aberdeen','https://www.youtube.com/channel/UCl3oUdWPwayC2lvQ_4gt5EA','EN','camphill','The original Camphill school: curative education and school life.',true),
  ('triform-camphill','UCG3s8p8XAfu171NxbR_yZvQ','Triform Camphill Community','https://www.youtube.com/channel/UCG3s8p8XAfu171NxbR_yZvQ','EN','camphill','Camphill community in Hudson, NY.',true),
  ('camphill-soltane','UCSxGY984_jzbwMERL3I9RPg','Camphill Soltane','https://www.youtube.com/channel/UCSxGY984_jzbwMERL3I9RPg','EN','camphill','Community life, craft and farm videos (Pennsylvania).',true),
  ('camphill-west-coast','UC-n63icUnjCVb5bW9rDZTcQ','Camphill Village West Coast','https://www.youtube.com/channel/UC-n63icUnjCVb5bW9rDZTcQ','EN','camphill','Camphill community and biodynamic farm near Cape Town.',true),
  ('camphill-mourne-grange','UCn5xn_O7rDyLDGVvsCd6OWw','Camphill Community Mourne Grange','https://www.youtube.com/channel/UCn5xn_O7rDyLDGVvsCd6OWw','EN','camphill','Community and craft workshop films (Northern Ireland).',true),
  ('camphill-devon','UCU9gNp82rBurbcpy81PgPaA','Camphill Devon','https://www.youtube.com/channel/UCU9gNp82rBurbcpy81PgPaA','EN','camphill','Camphill Devon community news and resident stories.',true),
  ('camphill-school-beaver-run','UCNDKV2ZtrA9XwhANrVJR84Q','The Camphill School (Beaver Run)','https://www.youtube.com/channel/UCNDKV2ZtrA9XwhANrVJR84Q','EN','camphill','Camphill school for children in Pennsylvania.',true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, language = EXCLUDED.language,
  category = EXCLUDED.category, description = EXCLUDED.description, verified = EXCLUDED.verified,
  channel_id = COALESCE(public.youtube_channels.channel_id, EXCLUDED.channel_id);

-- Done. Verify:  SELECT count(*) FROM public.youtube_channels;   -- expect 59
