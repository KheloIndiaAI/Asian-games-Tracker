-- India results: opponent country + spoken name
ALTER TABLE public.india_results
  ADD COLUMN IF NOT EXISTS opponent_country_code text,
  ADD COLUMN IF NOT EXISTS opponent_country_name text,
  ADD COLUMN IF NOT EXISTS spoken_name text;

-- India medals: official medals feed fields
ALTER TABLE public.india_medals
  ADD COLUMN IF NOT EXISTS reg text,
  ADD COLUMN IF NOT EXISTS spoken_name text,
  ADD COLUMN IF NOT EXISTS members jsonb,
  ADD COLUMN IF NOT EXISTS members_spoken text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS spoken_summary_en text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Event-level "India has entries" flag
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS india_entered boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_schedule_items_india_entered ON public.schedule_items (india_entered);
CREATE INDEX IF NOT EXISTS idx_schedule_items_event ON public.schedule_items (sport_code, event_code);
CREATE INDEX IF NOT EXISTS idx_schedule_items_start_time ON public.schedule_items (start_time);
CREATE INDEX IF NOT EXISTS idx_india_results_updated ON public.india_results (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_india_results_start ON public.india_results (start_time DESC);

-- Medal standings (all countries)
CREATE TABLE IF NOT EXISTS public.medal_standings (
  org_code text PRIMARY KEY,
  org_name text,
  rank text,
  gold int NOT NULL DEFAULT 0,
  silver int NOT NULL DEFAULT 0,
  bronze int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medal_standings TO anon, authenticated;
GRANT ALL ON public.medal_standings TO service_role;
ALTER TABLE public.medal_standings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read medal_standings" ON public.medal_standings;
CREATE POLICY "public read medal_standings" ON public.medal_standings FOR SELECT USING (true);

-- Countries
CREATE TABLE IF NOT EXISTS public.countries (
  code text PRIMARY KEY,
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read countries" ON public.countries;
CREATE POLICY "public read countries" ON public.countries FOR SELECT USING (true);

-- India entries
CREATE TABLE IF NOT EXISTS public.india_entries (
  sport_code text NOT NULL,
  reg text NOT NULL,
  event_code text NOT NULL,
  name text,
  spoken_name text,
  gender text,
  type text,
  event_name text,
  is_member boolean NOT NULL DEFAULT false,
  sport_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sport_code, reg, event_code)
);
CREATE INDEX IF NOT EXISTS idx_india_entries_event ON public.india_entries (sport_code, event_code);
CREATE INDEX IF NOT EXISTS idx_india_entries_name ON public.india_entries (lower(name));
CREATE INDEX IF NOT EXISTS idx_india_entries_spoken ON public.india_entries (lower(spoken_name));
GRANT SELECT ON public.india_entries TO anon, authenticated;
GRANT ALL ON public.india_entries TO service_role;
ALTER TABLE public.india_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read india_entries" ON public.india_entries;
CREATE POLICY "public read india_entries" ON public.india_entries FOR SELECT USING (true);

-- Agent API key
INSERT INTO public.app_secrets (key, value)
VALUES ('agent_key', gen_random_uuid()::text || gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;
