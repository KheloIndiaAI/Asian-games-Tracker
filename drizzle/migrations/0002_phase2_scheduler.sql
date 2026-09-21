-- lovable-cron-fallback-reviewed: live sports tracking for a voice agent needs near-real-time score refresh; the feed offers no webhooks, and the user was told the run counts and cost trade-off.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Keeps schedule_items.india_entered in sync with india_entries
CREATE OR REPLACE FUNCTION public.refresh_india_entered()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.schedule_items s
  SET india_entered = EXISTS (
    SELECT 1 FROM public.india_entries e
    WHERE e.sport_code = s.sport_code AND e.event_code = s.event_code
  )
  WHERE s.india_entered IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.india_entries e
    WHERE e.sport_code = s.sport_code AND e.event_code = s.event_code
  );
$$;
REVOKE ALL ON FUNCTION public.refresh_india_entered() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_india_entered() TO service_role;

CREATE OR REPLACE FUNCTION public.clear_ingest_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname LIKE 'ag-%' LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_ingest_schedule() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.setup_ingest_schedule(base_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  hdr text;
BEGIN
  PERFORM public.clear_ingest_schedule();

  hdr := 'jsonb_build_object(''x-ingest-key'', (SELECT value FROM public.app_secrets WHERE key = ''ingest_key''))';

  PERFORM cron.schedule('ag-cycle-today', '*/5 * * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=cycle', hdr));

  PERFORM cron.schedule('ag-cycle-tomorrow', '1-56/5 * * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=cycle&offset=1', hdr));

  PERFORM cron.schedule('ag-results', '2-57/5 * * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=results&limit=25', hdr));

  PERFORM cron.schedule('ag-live', '* * * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=live', hdr));

  PERFORM cron.schedule('ag-medals', '*/10 * * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=medals', hdr));

  PERFORM cron.schedule('ag-entries', '0 */6 * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=entries', hdr));

  -- 6-hourly full sweep of every competition day, one async request per date
  PERFORM cron.schedule('ag-sweep', '30 */6 * * *', format($sweep$
    DO $inner$
    DECLARE d date;
    BEGIN
      FOR d IN SELECT generate_series('2026-09-19'::date, '2026-10-04'::date, '1 day')::date LOOP
        PERFORM net.http_get(
          url := %L || to_char(d, 'YYYY-MM-DD'),
          headers := jsonb_build_object('x-ingest-key', (SELECT value FROM public.app_secrets WHERE key = 'ingest_key')),
          timeout_milliseconds := 120000);
        PERFORM pg_sleep(2);
      END LOOP;
    END
    $inner$;
  $sweep$, base_url || '/api/public/ingest?mode=day&date='));

  PERFORM cron.schedule('ag-fetchlog-cleanup', '15 3 * * *',
    $clean$DELETE FROM public.fetch_log WHERE started_at < now() - interval '3 days';$clean$);
END;
$$;
REVOKE ALL ON FUNCTION public.setup_ingest_schedule(text) FROM PUBLIC, anon, authenticated;
