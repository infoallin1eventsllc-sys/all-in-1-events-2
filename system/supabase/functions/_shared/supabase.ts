// Service-role Supabase client for edge functions.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by the
// Supabase Edge runtime — no need to set them manually.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Fetch a settings row's JSON value by key, with a fallback.
export async function getSetting<T = Record<string, unknown>>(
  sb: SupabaseClient,
  key: string,
  fallback: T,
): Promise<T> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
