// Where the Supabase credentials come from.
//
// Two names are accepted for each value, unprefixed first. The reason is a sharp edge:
// Next.js inlines NEXT_PUBLIC_* into the compiled bundle at build time, so a value that
// only exists at runtime — which is exactly what Vercel's "Sensitive" environment
// variables are — is baked in as undefined and can never be recovered. The unprefixed
// names are read at runtime and have no such problem.
//
// Nothing in this app talks to Supabase from the browser: every call is a server
// component, a server action or the middleware. So the NEXT_PUBLIC_ prefix buys nothing
// here and is kept only so deployments already configured that way keep working.
//
// Neither value is a secret. The anon key is designed to sit in public clients; row-level
// security is the permission boundary. The service-role key is never read by this app.

export function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabaseAnonKey(): string | undefined {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

/** The address magic links come back to. */
export function siteUrl(): string {
  return process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
