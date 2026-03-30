-- Sophia Commons: Enrichment updates from Firecrawl crawl (March 2026)
-- Richer descriptions, discovered contact info, and tags
-- Run in Supabase SQL Editor after seed_directory.sql

-- Add tags column if missing
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS tags text[];

-- 1. General Anthroposophical Society at the Goetheanum
UPDATE public.directory_entries SET
  description = 'International headquarters of the anthroposophical movement with 36 national societies and approximately 42,000 members worldwide. The Goetheanum serves as a School of Spiritual Science, a house for the arts, and a meeting place for the worldwide anthroposophical movement. Founded by Rudolf Steiner in 1923.',
  tags = ARRAY['headquarters', 'international', 'spiritual science', 'goetheanum', 'membership']
WHERE organization_name = 'General Anthroposophical Society at the Goetheanum';

-- 2. Goetheanum School of Spiritual Science
UPDATE public.directory_entries SET
  description = 'The School of Spiritual Science with its twelve sections is active worldwide in research, development, teaching, and practical implementation of its findings. Supported by the Anthroposophical Society, events range from lectures on special themes to large international conferences and performances by ensembles in residence.',
  tags = ARRAY['research', 'twelve sections', 'conferences', 'performing arts', 'spiritual science']
WHERE organization_name = 'Goetheanum School of Spiritual Science';

-- 3. Anthroposophical Society in America
UPDATE public.directory_entries SET
  description = 'National coordinating body for anthroposophical work in the USA with 120+ local groups and branches in 40 states. Embraces a spiritual view of the human being and the cosmos with emphasis on knowing rather than believing. Offers events, study groups, and the Being Human publication.',
  phone = '734.662.9355',
  tags = ARRAY['national society', 'study groups', 'branches', 'events', 'membership']
WHERE organization_name = 'Anthroposophical Society in America';

-- 4. Association of Waldorf Schools of North America
UPDATE public.directory_entries SET
  description = 'Membership organization representing over 160 Waldorf schools and 14 teacher training institutes across North America. With more than 100 years of Waldorf education history, AWSNA supports schools through accreditation, resources, and advocacy for developmentally appropriate education.',
  tags = ARRAY['accreditation', 'teacher training', 'school network', 'advocacy', 'resources']
WHERE organization_name = 'Association of Waldorf Schools of North America';

-- 5. Alliance for Public Waldorf Education
UPDATE public.directory_entries SET
  description = 'Community of 61 member schools and initiatives across 15 states promoting Public Waldorf education. Since 2018 supports schools through self-study and peer review processes. Public Waldorf education is ever-evolving and continuously renewed through practice, research, observation and active reflection.',
  tags = ARRAY['public schools', 'charter schools', 'peer review', 'self-study', 'public education']
WHERE organization_name = 'Alliance for Public Waldorf Education';

-- 6. Rudolf Steiner School NYC
UPDATE public.directory_entries SET
  description = 'The first Waldorf school in the Americas, founded in 1928. Offers Nursery through 12th grade education on the Upper East Side rooted in strong academics, hands-on learning, and emotional intelligence. Nurtures each child''s unique potential through an arts-integrated, developmentally rich curriculum.',
  tags = ARRAY['nursery-12', 'NYC', 'historic', 'arts-integrated', 'private school']
WHERE organization_name = 'Rudolf Steiner School NYC';

-- 7. Highland Hall Waldorf School
UPDATE public.directory_entries SET
  description = 'One of the oldest Waldorf schools on the West Coast, offering Preschool through High School in Northridge, CA. A leading private school that nurtures the whole human being through a hands-on curriculum fostering creativity and engaged learning. High school program since 1968.',
  tags = ARRAY['preschool-12', 'Los Angeles', 'private school', 'hands-on learning', 'West Coast']
WHERE organization_name = 'Highland Hall Waldorf School';

-- 8. Sacramento Waldorf School
UPDATE public.directory_entries SET
  description = 'Among the largest Waldorf schools in North America with 400+ students serving K-12 since 1959. Provides an education honoring the developmental stages of childhood, building confidence, connection, and purpose, preparing students to realize their full potential as free human beings.',
  tags = ARRAY['K-12', 'large school', 'early childhood', 'Sacramento', 'developmental education']
WHERE organization_name = 'Sacramento Waldorf School';

-- 9. Hawthorne Valley Waldorf School
UPDATE public.directory_entries SET
  description = 'Waldorf K-12 school on a 900-acre Demeter-certified biodynamic farm campus in the Hudson Valley. Part of a broader organization committed to renewing soil, society, and self, including a biodynamic farm, natural foods store, and educational programs. Unconventional by nature.',
  tags = ARRAY['K-12', 'biodynamic farm', 'Hudson Valley', 'farm school', 'holistic']
WHERE organization_name = 'Hawthorne Valley Waldorf School';

-- 10. Sunbridge Institute
UPDATE public.directory_entries SET
  description = 'North America''s oldest Waldorf teacher education institute, inspiring education since 1967. An independent, not-for-profit adult learning center offering low-residency Waldorf teacher preparation programs, foundation studies in anthroposophy, and summer workshops.',
  tags = ARRAY['teacher education', 'adult learning', 'low-residency', 'summer programs', 'foundation studies']
WHERE organization_name = 'Sunbridge Institute';

-- 11. Threefold Educational Foundation
UPDATE public.directory_entries SET
  description = 'Celebrating 100 years in 2026. Located on 140 wooded acres just 30 miles from New York City, Threefold is at the heart of a community of practical work inspired by the teachings of Rudolf Steiner. Home to Waldorf schools, nature education, biodynamic farm, eurythmy training, and therapeutic programs since 1926.',
  tags = ARRAY['100 years', 'community', 'waldorf', 'biodynamic', 'eurythmy', 'therapeutic']
WHERE organization_name = 'Threefold Educational Foundation';

-- 12. Fellowship Community
UPDATE public.directory_entries SET
  description = 'Intentional community of 150 people founded in 1966, settled on 80 acres of farm and forest 30 miles north of New York City. Serves the needs of elder members through phases of aging with a human approach to care. Recognized with a Best of Senior Living Award from A Place for Mom.',
  tags = ARRAY['eldercare', 'intentional community', 'farming', 'elder care', 'award-winning']
WHERE organization_name = 'Fellowship Community';

-- 13. Camphill Association of North America
UPDATE public.directory_entries SET
  description = 'Membership organization for 15 North American Camphill communities. Coordinates volunteer and service programs offering year-long experiences in thriving intentional communities. Volunteers develop authentic relationships and learn practical and creative skills.',
  tags = ARRAY['volunteer', 'service year', 'intentional community', 'disabilities', 'network']
WHERE organization_name = 'Camphill Association of North America';

-- 14. Camphill Village USA (Copake)
UPDATE public.directory_entries SET
  description = 'A diverse, productive, and welcoming community where people of all abilities thrive together. Founded in 1961 as a luminary in the field, Camphill Village Copake offers a lifetime of integration, equity, and opportunity for people with developmental differences. Features farming, crafts, and cultural life.',
  tags = ARRAY['lifesharing', 'developmental disabilities', 'farming', 'crafts', 'equity']
WHERE organization_name = 'Camphill Village USA (Copake)';

-- 15. Demeter USA
UPDATE public.directory_entries SET
  description = 'The only certifier for Biodynamic farms and products in the United States. Biodynamic agriculture is an ecological, holistic, and regenerative approach to farming founded on deep respect for nature and recognition that everything in our world is beautifully interconnected - soil, water, plants, animals, people, and the cosmos.',
  tags = ARRAY['certification', 'biodynamic', 'regenerative', 'organic', 'farming standards']
WHERE organization_name = 'Demeter USA';

-- 16. Biodynamic Association
UPDATE public.directory_entries SET
  description = 'US-based nonprofit promoting biodynamic agriculture through education, advocacy, and community. Publishes the Biodynamics journal and hosts annual conferences. Supports biodynamic farmers, gardeners, and the growing movement for regenerative agriculture across North America.',
  tags = ARRAY['nonprofit', 'education', 'advocacy', 'journal', 'conferences', 'regenerative']
WHERE organization_name = 'Biodynamic Association';

-- 17. Hawthorne Valley Farm
UPDATE public.directory_entries SET
  description = '900-acre Demeter-certified biodynamic farm in the Hudson Valley committed to renewing soil, society, and self. Features a K-12 Waldorf school, natural foods and grocery store, CSA program, farmstead creamery, and educational programs connecting children and adults to the land.',
  tags = ARRAY['biodynamic', 'CSA', 'farm store', 'creamery', 'education', 'Hudson Valley']
WHERE organization_name = 'Hawthorne Valley Farm';

-- 18. Physicians' Association for Anthroposophic Medicine
UPDATE public.directory_entries SET
  description = 'Professional organization for MDs and DOs practicing anthroposophic medicine. Offers a spiritual-scientific approach to medicine with a philosophy, system, and framework that cultivates the will to heal. Provides a provider directory, training programs, and resources for integrative medical practice.',
  tags = ARRAY['physicians', 'integrative medicine', 'training', 'provider directory', 'spiritual science']
WHERE organization_name = 'Physicians'' Association for Anthroposophic Medicine';

-- 19. Weleda USA
UPDATE public.directory_entries SET
  description = 'World''s leading manufacturer of anthroposophic medicines and natural body care products. Known for iconic Skin Food line and plant-based formulations. Founded in 1921 by Rudolf Steiner and Ita Wegman, combining nature''s science with sustainable, ethical practices.',
  tags = ARRAY['natural cosmetics', 'medicines', 'skin care', 'sustainable', 'ethical']
WHERE organization_name = 'Weleda USA';

-- 20. Klinik Arlesheim
UPDATE public.directory_entries SET
  description = 'First anthroposophic hospital in the world, founded in 1921 by Rudolf Steiner and Ita Wegman. Acute care hospital in northwestern Switzerland offering integrative medicine combining conventional and anthroposophic approaches including pharmacy and outpatient services.',
  tags = ARRAY['hospital', 'acute care', 'integrative medicine', 'pharmacy', 'historic']
WHERE organization_name = 'Klinik Arlesheim';

-- 21. Eurythmy Spring Valley
UPDATE public.directory_entries SET
  description = 'North America''s oldest four-year eurythmy training program in Chestnut Ridge, New York. Eurythmy makes visible the formative forces of music and speech through movement. Offers full-time diploma training, workshops, and performances where audiences are drawn into a world of gesture, color, and living expression.',
  tags = ARRAY['eurythmy training', 'four-year program', 'performing arts', 'movement arts', 'diploma']
WHERE organization_name = 'Eurythmy Spring Valley';

-- 22. SteinerBooks / Anthroposophic Press
UPDATE public.directory_entries SET
  description = 'Independent US nonprofit publisher of Rudolf Steiner''s works and anthroposophic literature since 1928. The largest English-language publisher of Steiner''s collected works, also publishing contemporary authors on spiritual science, education, agriculture, medicine, and the arts.',
  tags = ARRAY['publisher', 'books', 'Rudolf Steiner', 'nonprofit', 'spiritual science']
WHERE organization_name = 'SteinerBooks / Anthroposophic Press';

-- 23. Rudolf Steiner Archive
UPDATE public.directory_entries SET
  description = 'The largest digital library of the works of Rudolf Steiner in English with over 6,000 texts freely available online. Features lectures, books, and essays spanning Steiner''s complete body of work on philosophy, education, agriculture, medicine, the arts, and spiritual science.',
  tags = ARRAY['digital library', 'free access', 'lectures', 'books', 'archive']
WHERE organization_name = 'Rudolf Steiner Archive';

-- 24. Waldorf Early Childhood Association of North America
UPDATE public.directory_entries SET
  description = 'Organization fostering a new cultural impulse for work with the young child from pre-birth to age seven. Committed to nurturing childhood as a foundation for renewing human culture. Celebrating 100 years of Waldorf early childhood worldwide. Provides a directory of preschools and kindergartens.',
  email = 'conference@waldorfearlychildhood.org',
  tags = ARRAY['early childhood', 'pre-birth to seven', 'preschool', 'kindergarten', '100 years']
WHERE organization_name = 'Waldorf Early Childhood Association of North America';

-- 25. Emerson College
UPDATE public.directory_entries SET
  description = 'A centre for transformative learning, creativity, and health set within 22 acres of biodynamic gardens and woodlands in the heart of Ashdown Forest. Now part of the Ruskin Mill Land Trust, offering adult education in Waldorf teacher training, anthroposophic studies, and therapeutic programs since 1962.',
  tags = ARRAY['teacher training', 'biodynamic gardens', 'adult education', 'therapeutic', 'UK']
WHERE organization_name = 'Emerson College';

-- 26. Alanus University
UPDATE public.directory_entries SET
  description = 'State-accredited university in Alfter, Germany offering more than 20 bachelor''s and master''s programs combining art and social sciences. Unique approach integrating creativity with academic study, including eurythmy degree programs. No numerus clausus - admission based on the individual.',
  tags = ARRAY['university', 'accredited', 'art', 'social sciences', 'eurythmy', 'Germany']
WHERE organization_name = 'Alanus University';

-- 27. The Christian Community
UPDATE public.directory_entries SET
  description = 'Worldwide movement for religious renewal founded in 1922 with over 200 congregations. Offers sacramental services where belief is free from dogma, celebrates Christian festivals, and provides spiritual nourishment for children and youth. 16 congregations in North America.',
  tags = ARRAY['religious renewal', 'sacraments', 'congregations', 'festivals', 'youth']
WHERE organization_name = 'The Christian Community';

-- 28. LILIPOH Magazine
UPDATE public.directory_entries SET
  description = 'Quarterly magazine weaving stories of holistic health, wellness, anthroposophy, grief, love, and renewal. Honors life''s sacred passages and the quiet becoming in every season. Currently on issue #122 (Spring 2026). Offers collector''s packages of back issues.',
  tags = ARRAY['magazine', 'quarterly', 'holistic health', 'wellness', 'storytelling']
WHERE organization_name = 'LILIPOH Magazine';

-- 29. Rudolf Steiner House - London
UPDATE public.directory_entries SET
  description = 'Historic Grade II listed building near Regent''s Park serving as headquarters for UK anthroposophical work. Houses a library, bookshop, and event spaces. Hosts lectures, workshops, exhibitions, and cultural events promoting anthroposophical arts and sciences.',
  tags = ARRAY['headquarters', 'Grade II listed', 'library', 'bookshop', 'events', 'London']
WHERE organization_name = 'Rudolf Steiner House - London';

-- 30. Green Meadow Waldorf School
UPDATE public.directory_entries SET
  description = 'Founded in 1947 as part of the Threefold anthroposophical community in Spring Valley, NY. Offers Pre-K through 12th grade Waldorf education on a campus shared with eurythmy and teacher training programs. One of the oldest and most established Waldorf schools in North America.',
  tags = ARRAY['Pre-K-12', 'Threefold community', 'historic', 'Spring Valley', 'established 1947']
WHERE organization_name = 'Green Meadow Waldorf School';
