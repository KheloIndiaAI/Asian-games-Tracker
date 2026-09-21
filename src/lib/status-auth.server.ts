import { timingSafeCompare, tryGetStatusKey } from "@/lib/secrets.server";

export async function statusKeyIsValid(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  return timingSafeCompare(candidate, tryGetStatusKey());
}
