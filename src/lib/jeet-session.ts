/**
 * Browser-only helper around the Sarvam conversational AI SDK.
 * The SDK is imported dynamically so SSR never touches it.
 */

export type JeetState = "idle" | "connecting" | "listening" | "speaking" | "error";

export type JeetMessage = { role: "user" | "jeet"; text: string; at: number };

export type VoiceConfig = {
  configured: boolean;
  orgId?: string;
  workspaceId?: string;
  appId?: string;
  apiKey?: string;
};

export function getAnonUserId(): string {
  const key = "jeet_user_id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const raw =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(16).slice(2) + Date.now().toString(16);
    const id = `web-${raw.replace(/-/g, "").slice(0, 8)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return `web-${Math.random().toString(16).slice(2, 10)}`;
  }
}

export async function fetchVoiceConfig(): Promise<VoiceConfig> {
  const res = await fetch("/api/public/voice-config");
  if (!res.ok) return { configured: false };
  return (await res.json()) as VoiceConfig;
}

type Handlers = {
  onState: (state: JeetState) => void;
  onMessage: (msg: JeetMessage) => void;
  onError: (message: string) => void;
  onEnd: () => void;
};

export type JeetSession = { stop: () => Promise<void> };

export type JeetVariables = Record<string, string>;

export async function startJeetSession(
  config: VoiceConfig,
  handlers: Handlers,
  variables?: JeetVariables,
): Promise<JeetSession> {
  const sdk = await import("sarvam-conv-ai-sdk/browser");
  const { createConversation, BrowserAudioInterface } = sdk;

  const audioInterface = new BrowserAudioInterface(16000);

  const baseConfig = {
    user_identifier_type: "custom",
    user_identifier: getAnonUserId(),
    org_id: config.orgId!,
    workspace_id: config.workspaceId!,
    app_id: config.appId!,
    interaction_type: "call" as never,
    input_sample_rate: 16000 as never,
    output_sample_rate: 22050 as never,
  };

  const withVars =
    variables && Object.keys(variables).length
      ? { ...baseConfig, variables: variables as never }
      : baseConfig;

  const callbacks = {
    platform: "browser" as const,
    audioInterface,
    stateCallback: (next: string) => {
      if (next === "listening" || next === "connected") handlers.onState("listening");
      else if (next === "speaking") handlers.onState("speaking");
      else if (next === "connecting") handlers.onState("connecting");
      else if (next === "error") handlers.onState("error");
    },
    transcriptCallback: async (msg: any) => {
      const text: string | undefined = msg?.content ?? msg?.text ?? msg?.transcript;
      if (text && !text.startsWith("redirect::")) {
        const role = String(msg?.role ?? "").toLowerCase();
        handlers.onMessage({
          role: role.includes("user") ? "user" : "jeet",
          text,
          at: Date.now(),
        });
      }
    },
    endCallback: async () => handlers.onEnd(),
  };

  let agent: any;
  try {
    agent = await createConversation(withVars as never, config.apiKey!, callbacks as never);
  } catch (err) {
    if (withVars === baseConfig) throw err;
    // the SDK may reject unknown variables — retry without them
    agent = await createConversation(baseConfig as never, config.apiKey!, callbacks as never);
  }


  const connected = await agent.waitForConnect(10);
  if (!connected) {
    try {
      await agent.stop();
    } catch {
      /* ignore */
    }
    throw new Error("Could not connect to Jeet. Please try again.");
  }

  handlers.onState("listening");
  agent.waitForDisconnect().then(
    () => handlers.onEnd(),
    () => handlers.onEnd(),
  );

  return {
    stop: async () => {
      try {
        await agent.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
