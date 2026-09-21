// Runtime secrets. Values come from process.env, which is populated from
// SSM Parameter Store / Secrets Manager by the EC2 instance role at process
// start (see docs/AWS_MIGRATION.md). Values are read once and cached.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getIngestKey(): string {
  return requireEnv("INGEST_KEY");
}

export function getAgentKey(): string {
  return requireEnv("AGENT_KEY");
}

export function getStatusKey(): string {
  return requireEnv("STATUS_KEY");
}

export function isVoiceEnabled(): boolean {
  return (process.env["VOICE_ENABLED"] ?? "false").toLowerCase() === "true";
}
