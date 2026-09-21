import { createFileRoute } from "@tanstack/react-router";
import { isVoiceEnabled } from "@/lib/secrets.server";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const ORG_ID = "019f7ba5-3fb5-7484-921a-ef90644d4fa5";
const WORKSPACE_ID = "019f7ba5-3fc8-7b6c-8e7e-19701a0eb38d";
const APP_ID = "Asian-Games-d8783667-5e02";

export const Route = createFileRoute("/api/public/voice-config")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async () => {
        const apiKey = process.env["SARVAM_EMBED_KEY"];
        const enabled = isVoiceEnabled() && !!apiKey;

        if (!enabled) {
          return Response.json(
            { configured: false, voice_enabled: false },
            { headers: JSON_HEADERS },
          );
        }
        return Response.json(
          {
            configured: true,
            voice_enabled: true,
            orgId: ORG_ID,
            workspaceId: WORKSPACE_ID,
            appId: APP_ID,
            apiKey,
          },
          { headers: JSON_HEADERS },
        );
      },
    },
  },
});
