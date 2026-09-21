import { timingSafeEqual } from "node:crypto";
import { getStatusKey } from "@/lib/secrets.server";

export async function statusKeyIsValid(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const expected = getStatusKey();
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
