import { createFileRoute } from "@tanstack/react-router";
import { asItems, decodeFeed, FEED_BASE, FEED_HEADERS } from "@/server/feed";

const DEFAULT_DATE = "2026-09-20";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const Route = createFileRoute("/api/public/feed-test")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const date = url.searchParams.get("date") || DEFAULT_DATE;

        let httpStatus = 0;
        try {
          const res = await fetch(`${FEED_BASE}ALL/schedule/day/${date}`, {
            headers: FEED_HEADERS,
          });
          httpStatus = res.status;

          if (!res.ok) {
            const bodyPreview = (await res.text()).slice(0, 200);
            return Response.json(
              { ok: false, httpStatus, error: `Upstream returned HTTP ${res.status}`, bodyPreview },
              { headers: JSON_HEADERS },
            );
          }

          const items = asItems(await decodeFeed(res));
          const sports = [...new Set(items.map((i: any) => i?.DiscDesc).filter(Boolean))];
          const statuses = [...new Set(items.map((i: any) => i?.Status).filter(Boolean))];
          const f: any = items[0];

          return Response.json(
            {
              ok: true,
              httpStatus,
              date,
              itemCount: items.length,
              sports,
              statuses,
              first: f
                ? {
                    DiscDesc: f.DiscDesc,
                    EventDesc: f.EventDesc,
                    UnitDesc: f.UnitDesc,
                    DateTimeRaw: f.DateTimeRaw,
                    Status: f.Status,
                  }
                : null,
            },
            { headers: JSON_HEADERS },
          );
        } catch (err) {
          return Response.json(
            {
              ok: false,
              httpStatus,
              error: err instanceof Error ? err.message : String(err),
              bodyPreview: "",
            },
            { headers: JSON_HEADERS },
          );
        }
      },
    },
  },
});
