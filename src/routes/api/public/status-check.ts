import { createFileRoute } from "@tanstack/react-router";
import { statusKeyIsValid } from "@/lib/status-auth.server";

export const Route = createFileRoute("/api/public/status-check")({
  server: { handlers: { GET: async ({ request }) => {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!(await statusKeyIsValid(key))) return new Response("Not found", { status: 404 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } } },
});