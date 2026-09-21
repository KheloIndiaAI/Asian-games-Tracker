# Data migration: Supabase → RDS

One-time runbook for moving live data from Lovable Cloud/Supabase into the
new RDS instance, after the schema exists but before the AWS stack goes
live. Run this from the EC2 instance (SSM Session Manager) — it's the only
thing with network access to the new RDS, and `psql`/`pg_dump` need to be
installed there first (`sudo dnf install -y postgresql16`).

Do **not** restore into RDS before the baseline migration has run — the
`0000_baseline_schema.sql` migration issues `CREATE TABLE`, which fails if
the tables already exist from a data-only restore.

## Steps

1. **Schema first.** `terraform apply` + the first CI deploy already ran
   `drizzle-kit migrate` against the empty RDS database (see
   `infra/README.md`). Confirm the tables exist and are empty:
   ```sh
   psql "$DATABASE_URL" -c "\dt"
   psql "$DATABASE_URL" -c "SELECT count(*) FROM schedule_items;"
   ```

2. **Stop the worker** so nothing writes to RDS while you're loading data:
   ```sh
   sudo systemctl stop cheer4bharat-worker
   ```

3. **Dump data only from Supabase.** Get the session-pooler connection
   string from the Lovable Cloud / Supabase dashboard (Settings → Database).
   `app_secrets` no longer exists on the new stack (see
   `docs/AWS_MIGRATION.md` — secrets moved to SSM), so exclude it:
   ```sh
   pg_dump "$SUPABASE_URL" \
     --data-only --no-owner --no-privileges \
     --schema=public --exclude-table=app_secrets \
     -f /tmp/data.sql
   ```

4. **Load it into RDS:**
   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/data.sql
   ```

5. **Reset the sequences.** The dump carries explicit `short_id`/`id`
   values but not the sequence positions behind them — without this, the
   next insert reuses an existing `short_id` and collides:
   ```sql
   SELECT setval(pg_get_serial_sequence('schedule_items', 'short_id'),
                 (SELECT max(short_id) FROM schedule_items));
   SELECT setval(pg_get_serial_sequence('fetch_log', 'id'),
                 (SELECT coalesce(max(id), 1) FROM fetch_log));
   ```

6. **Verify row counts match**, table by table, between Supabase and RDS:
   ```sh
   for t in sports events countries schedule_items india_results india_medals \
            medal_standings india_entries fetch_log; do
     echo -n "$t: "
     psql "$DATABASE_URL" -tAc "SELECT count(*) FROM $t"
   done
   ```
   Compare each against the same query run against `$SUPABASE_URL`.

7. **Spot-check an existing match URL** — `/match/<slug>-<short_id>` for a
   `short_id` you know existed on the old stack — resolves on the new one.

8. **Restart the worker:**
   ```sh
   sudo systemctl start cheer4bharat-worker
   journalctl -u cheer4bharat-worker -f   # confirm it picks up cleanly
   ```

## Done when

Row counts match table-for-table, an existing match URL resolves, and the
worker is running without `short_id`/`id` conflict errors in its log.
