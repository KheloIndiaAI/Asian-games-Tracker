import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { pageHead } from "@/lib/seo";
import { requireStatusKey } from "@/lib/status.functions";

export const Route = createFileRoute("/status")({
  head: () => { const head = pageHead({ title: "Data status — Cheer4Bharat", description: "Live ingestion status and India's schedule for today and tomorrow at the Asian Games 2026.", path: "/status" }); return { ...head, meta: [...head.meta, { name: "robots", content: "noindex, nofollow" }] }; },
  validateSearch: (search: Record<string, unknown>) => ({ key: typeof search["key"] === "string" ? search["key"] : "" }),
  loaderDeps: ({ search }) => ({ key: search.key }),
  loader: async ({ deps }) => { if (!deps.key || !(await requireStatusKey({ data: { key: deps.key } }))) throw notFound(); return true; },
  notFoundComponent: NotFound,
  component: Index,
});

function useStatus(key: string) {
  return useQuery({
    queryKey: ["status", key],
    enabled: Boolean(key),
    queryFn: async () => {
      const response = await fetch(`/api/public/status-data?key=${encodeURIComponent(key)}`);
      if (!response.ok) throw new Error("Not found");
      const payload = await response.json();
      if (!payload?.ok) throw new Error("Not found");
      return payload.data;
    },
    refetchInterval: 60000,
  });
}


function sportNameOf(data: any, code: string) {
  return data.live.find((l: any) => l.sport_code === code)?.sport ?? code;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Index() {
  const { key } = Route.useSearch();
  const { data, isLoading, error } = useStatus(key);

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Asian Games India Tracker
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Ingestion status</p>

      {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {error && <p className="mt-6 text-destructive">{String(error)}</p>}

      {data && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Schedule items" value={data.counts.items} />
            <Stat label="India items" value={data.counts.india} />
            <Stat label="India results" value={data.counts.results} />
            <Stat label="Medals" value={data.counts.medals} />
          </section>

          <section
            className={`mt-6 rounded-lg border p-4 ${
              data.watch.some((w: any) => w.age > 3)
                ? "border-destructive bg-destructive/10"
                : "border-emerald-600 bg-emerald-600/10"
            }`}
          >
            <h2 className="text-lg font-semibold text-foreground">
              India live watchdog —{" "}
              {data.watch.some((w: any) => w.age > 3) ? "STALE" : "All fresh"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Last india_now:{" "}
              {data.lastRun.india_now
                ? `${new Date(data.lastRun.india_now).toISOString().slice(11, 19)}Z`
                : "never"}{" "}
              · last india_today:{" "}
              {data.lastRun.india_today
                ? `${new Date(data.lastRun.india_today).toISOString().slice(11, 19)}Z`
                : "never"}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {data.watch.map((w: any, i: number) => (
                <li key={i} className="border-t border-border pt-2">
                  <span className="font-medium text-foreground">
                    {sportNameOf(data, w.sport_code)} — {w.event_name} {w.phase_name ?? ""}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {w.status_desc || w.status} · {w.age} min since fetch
                  </span>
                </li>
              ))}
              {!data.watch.length && (
                <li className="text-muted-foreground">No India item inside the live window.</li>
              )}
            </ul>
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <h2 className="text-lg font-semibold text-foreground">India medal tally</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.standing
                  ? `${data.standing.gold} gold · ${data.standing.silver} silver · ${data.standing.bronze} bronze · ${data.standing.total} total · rank ${data.standing.rank ?? "—"}`
                  : "No medals yet."}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.medalRows.map((m: any) => (
                  <li key={`${m.sport_code}|${m.event_code}|${m.reg}`} className="border-t border-border pt-2">
                    <span className="font-medium capitalize text-foreground">{m.medal}</span>{" "}
                    <span className="text-muted-foreground">
                      — {m.sport}, {m.event_name}
                      {m.members_spoken ? `: ${m.members_spoken}` : m.spoken_name ? `: ${m.spoken_name}` : ""}
                    </span>
                  </li>
                ))}
                {!data.medalRows.length && (
                  <li className="text-muted-foreground">No medals recorded yet.</li>
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-border p-4">
              <h2 className="text-lg font-semibold text-foreground">Live now</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.live.map((r: any) => (
                  <li key={`${r.sport_code}|${r.res_code}`} className="border-t border-border pt-2">
                    <div className="font-medium text-foreground">
                      {r.sport} — {r.event_name}
                    </div>
                    <div className="text-muted-foreground">{r.summary || r.status_desc || r.status}</div>
                  </li>
                ))}
                {!data.live.length && (
                  <li className="text-muted-foreground">No India event is live right now.</li>
                )}
              </ul>
              <h3 className="mt-6 text-sm font-semibold text-foreground">
                India entered (draw pending)
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.today}: {data.enteredCounts[data.today] ?? 0} sessions ·{" "}
                {data.tomorrow}: {data.enteredCounts[data.tomorrow] ?? 0} sessions
              </p>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">Recent fetches</h2>

            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Mode</th>
                    <th className="p-2">Started</th>
                    <th className="p-2">Calls</th>
                    <th className="p-2">Items</th>
                    <th className="p-2">Changed</th>
                    <th className="p-2">India</th>
                    <th className="p-2">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((l: any) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="p-2">{l.mode}</td>
                      <td className="p-2">{new Date(l.started_at).toISOString().slice(0, 19)}Z</td>
                      <td className="p-2">{l.feed_calls}</td>
                      <td className="p-2">{l.items_seen}</td>
                      <td className="p-2">{l.rows_changed}</td>
                      <td className="p-2">{l.india_items}</td>
                      <td className="p-2">{l.ok ? "yes" : "no"}</td>
                    </tr>
                  ))}
                  {!data.logs.length && (
                    <tr>
                      <td className="p-3 text-muted-foreground" colSpan={7}>
                        No fetches yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">
              India — today &amp; tomorrow ({data.today} / {data.tomorrow}, India time)
            </h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">India time</th>
                    <th className="p-2">Sport</th>
                    <th className="p-2">Event</th>
                    <th className="p-2">Phase</th>
                    <th className="p-2">Opponent</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={`${r.sport_code}|${r.res_code}`} className="border-t border-border align-top">
                      <td className="p-2 whitespace-nowrap">{r.start_ist}</td>
                      <td className="p-2">{r.sport}</td>
                      <td className="p-2">{r.event_name}</td>
                      <td className="p-2">{r.phase_name}</td>
                      <td className="p-2">{r.opponent}</td>
                      <td className="p-2">{r.status_desc || r.status}</td>
                      <td className="p-2 text-muted-foreground">{r.summary}</td>
                    </tr>
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td className="p-3 text-muted-foreground" colSpan={7}>
                        No India items for today or tomorrow yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function NotFound() { return <main className="grid min-h-dvh place-items-center bg-background px-4"><div className="text-center"><h1 className="text-7xl font-bold text-foreground">404</h1><h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2><p className="mt-2 text-sm text-muted-foreground">The page you’re looking for doesn’t exist or has been moved.</p></div></main>; }
