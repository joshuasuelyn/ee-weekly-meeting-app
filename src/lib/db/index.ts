// Picks the data adapter. Supabase whenever it is configured, the file-backed local store
// otherwise, so `npm run dev` works on a fresh clone with no accounts to provision.
//
// Server-only. Never import this from a client component.

import { localStore } from "./local";
import { supabaseStore } from "./supabase";
import { supabaseConfigured } from "../supabase/server";
import type { Store } from "./store";

export function usingLocalStore(): boolean {
  if (process.env.DATA_ADAPTER === "local") return true;
  if (process.env.DATA_ADAPTER === "supabase") return false;
  return !supabaseConfigured();
}

export function getStore(): Store {
  if (!usingLocalStore()) return supabaseStore;

  // The local store writes a JSON file next to the process. On a serverless host every
  // instance gets its own disposable filesystem, so a production deploy that fell through
  // to it would show each person a different, self-seeding database and lose the lot on
  // the next cold start. Fail loudly instead — a missing environment variable should not
  // look like a working app.
  // Not during `next build` itself: the root layout asks who is signed in, so prerendering
  // /_not-found reaches the store before any environment variable can be read.
  const building = process.env.NEXT_PHASE === "phase-production-build";

  if (process.env.NODE_ENV === "production" && !building && process.env.DATA_ADAPTER !== "local") {
    throw new Error(
      "No database configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "on this deployment. (Set DATA_ADAPTER=local to override, for a local production build only.)",
    );
  }

  return localStore;
}

export type { Store };
export * from "./store";
