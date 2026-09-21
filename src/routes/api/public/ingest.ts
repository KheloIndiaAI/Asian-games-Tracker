import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/pg.server";
import { getIngestKey } from "@/lib/secrets.server";
import { runIngestMode } from "@/server/ingest-engine";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function handle(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "cycle";

  const secret = getIngestKey();
  const provided = request.headers.get("x-ingest-key");
  if (!secret || provided !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: JSON_HEADERS });
  }

  const params = Object.fromEntries(url.searchParams.entries());
  const result = await runIngestMode(getSql(), mode, params);
  return Response.json(result, { headers: JSON_HEADERS });
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
