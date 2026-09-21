import { timingSafeEqual } from "node:crypto";

export async function statusKeyIsValid(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_secrets").select("value").eq("key", "status_key").maybeSingle();
  const expected = String(data?.value ?? "");
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}