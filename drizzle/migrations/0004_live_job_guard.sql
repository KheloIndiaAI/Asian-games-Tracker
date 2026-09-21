-- lovable-cron-fallback-reviewed: live sports tracking for a voice agent needs near-real-time
-- score refresh; the every-minute job now only issues an HTTP call when an India item is
-- live or about to start, so idle minutes cost nothing.

CREATE OR REPLACE FUNCTION public.setup_ingest_schedule(base_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  hdr text;
  d date;
  i int := 0;
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
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000) '
    'WHERE EXISTS (SELECT 1 FROM public.schedule_items WHERE has_india AND (is_live OR status = ''RUNNING'' '
    'OR start_time BETWEEN now() - interval ''20 minutes'' AND now() + interval ''2 minutes''));',
    base_url || '/api/public/ingest?mode=live', hdr));

  PERFORM cron.schedule('ag-medals', '*/10 * * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=medals', hdr));

  PERFORM cron.schedule('ag-entries', '0 */6 * * *', format(
    'SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
    base_url || '/api/public/ingest?mode=entries', hdr));

  FOR d IN SELECT generate_series('2026-09-19'::date, '2026-10-04'::date, '1 day')::date LOOP
    PERFORM cron.schedule(
      'ag-sweep-' || to_char(d, 'MM-DD'),
      format('%s 0,6,12,18 * * *', 30 + i),
      format('SELECT net.http_get(url := %L, headers := %s, timeout_milliseconds := 120000);',
        base_url || '/api/public/ingest?mode=day&date=' || to_char(d, 'YYYY-MM-DD'), hdr));
    i := i + 1;
  END LOOP;

  PERFORM cron.schedule('ag-fetchlog-cleanup', '15 3 * * *',
    $clean$DELETE FROM public.fetch_log WHERE started_at < now() - interval '3 days';$clean$);
END;
$$;
REVOKE ALL ON FUNCTION public.setup_ingest_schedule(text) FROM PUBLIC, anon, authenticated;