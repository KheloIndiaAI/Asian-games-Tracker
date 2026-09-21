CREATE TABLE public.sports (
  code text PRIMARY KEY,
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sports TO anon, authenticated;
GRANT ALL ON public.sports TO service_role;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sports" ON public.sports FOR SELECT USING (true);

CREATE TABLE public.events (
  sport_code text NOT NULL,
  event_code text NOT NULL,
  name text,
  gender text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sport_code, event_code)
);
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read events" ON public.events FOR SELECT USING (true);

CREATE TABLE public.schedule_items (
  sport_code text NOT NULL,
  res_code text NOT NULL,
  event_code text,
  event_name text,
  phase_code text,
  phase_name text,
  unit_name text,
  unit_name_short text,
  unit_num text,
  start_time timestamptz,
  start_jst text,
  start_ist text,
  date_jst date,
  date_ist date,
  venue_code text,
  venue_name text,
  location_name text,
  status text,
  status_desc text,
  is_live boolean NOT NULL DEFAULT false,
  is_h2h boolean NOT NULL DEFAULT false,
  medal_flag text,
  orgs text[] NOT NULL DEFAULT '{}',
  has_india boolean NOT NULL DEFAULT false,
  home jsonb,
  away jsonb,
  raw jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  india_result_fetched_at timestamptz,
  PRIMARY KEY (sport_code, res_code)
);
GRANT SELECT ON public.schedule_items TO anon, authenticated;
GRANT ALL ON public.schedule_items TO service_role;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read schedule_items" ON public.schedule_items FOR SELECT USING (true);
CREATE INDEX idx_schedule_items_date_jst ON public.schedule_items (date_jst);
CREATE INDEX idx_schedule_items_date_ist ON public.schedule_items (date_ist);
CREATE INDEX idx_schedule_items_has_india ON public.schedule_items (has_india);
CREATE INDEX idx_schedule_items_status ON public.schedule_items (status);
CREATE INDEX idx_schedule_items_sport_code ON public.schedule_items (sport_code);

CREATE TABLE public.india_results (
  sport_code text NOT NULL,
  res_code text NOT NULL,
  competitor_key text NOT NULL,
  athlete_or_team text,
  is_team boolean NOT NULL DEFAULT false,
  opponent_code text,
  opponent_name text,
  india_score text,
  opponent_score text,
  outcome text,
  rank text,
  result_mark text,
  qualified text,
  irm text,
  medal text,
  medal_raw text,
  periods jsonb,
  spoken_summary_en text,
  status text,
  start_time timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sport_code, res_code, competitor_key)
);
GRANT SELECT ON public.india_results TO anon, authenticated;
GRANT ALL ON public.india_results TO service_role;
ALTER TABLE public.india_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read india_results" ON public.india_results FOR SELECT USING (true);

CREATE TABLE public.india_medals (
  sport_code text NOT NULL,
  event_code text NOT NULL,
  competitor_key text NOT NULL,
  medal text,
  athlete_or_team text,
  event_name text,
  sport_name text,
  date_ist date,
  res_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sport_code, event_code, competitor_key)
);
GRANT SELECT ON public.india_medals TO anon, authenticated;
GRANT ALL ON public.india_medals TO service_role;
ALTER TABLE public.india_medals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read india_medals" ON public.india_medals FOR SELECT USING (true);

CREATE TABLE public.fetch_log (
  id bigserial PRIMARY KEY,
  mode text,
  params jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  feed_calls int NOT NULL DEFAULT 0,
  items_seen int NOT NULL DEFAULT 0,
  rows_changed int NOT NULL DEFAULT 0,
  india_items int NOT NULL DEFAULT 0,
  errors jsonb,
  ok boolean
);
GRANT SELECT ON public.fetch_log TO anon, authenticated;
GRANT ALL ON public.fetch_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fetch_log_id_seq TO service_role;
ALTER TABLE public.fetch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read fetch_log" ON public.fetch_log FOR SELECT USING (true);

CREATE TABLE public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL
);
GRANT ALL ON public.app_secrets TO service_role;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_secrets (key, value)
VALUES ('ingest_key', gen_random_uuid()::text || gen_random_uuid()::text);