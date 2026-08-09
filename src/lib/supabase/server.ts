import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";

type CookiesToSet = Parameters<SetAllCookies>[0];

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl()!,
    supabaseAnonKey()!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: CookiesToSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — the middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
