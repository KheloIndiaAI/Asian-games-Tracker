// Runtime secrets. Values come from process.env, which is populated from
// SSM Parameter Store / Secrets Manager by the EC2 instance role at process
// start (see docs/AWS_MIGRATION.md). Values are read once and cached.

import { timingSafeEqual } from "node:crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function tryEnv(name: string): string | null {
  try {
    return requireEnv(name);
  } catch {
    return null;
  }
}

export function getIngestKey(): string {
  return requireEnv("INGEST_KEY");
}

/** Like getIngestKey(), but returns null instead of throwing when unset — for auth checks that should 401, not 500. */
export function tryGetIngestKey(): string | null {
  return tryEnv("INGEST_KEY");
}

export function getAgentKey(): string {
  return requireEnv("AGENT_KEY");
}

/** Like getAgentKey(), but returns null instead of throwing when unset — for auth checks that should 401, not 500. */
export function tryGetAgentKey(): string | null {
  return tryEnv("AGENT_KEY");
}

export function getStatusKey(): string {
  return requireEnv("STATUS_KEY");
}

/** Like getStatusKey(), but returns null instead of throwing when unset — for auth checks that should 401/404, not 500. */
export function tryGetStatusKey(): string | null {
  return tryEnv("STATUS_KEY");
}

export function isVoiceEnabled(): boolean {
  return (process.env["VOICE_ENABLED"] ?? "false").toLowerCase() === "true";
}

/** Constant-time string comparison for API keys, so a wrong guess can't be timed. */
export function timingSafeCompare(candidate: string, expected: string | null): boolean {
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
