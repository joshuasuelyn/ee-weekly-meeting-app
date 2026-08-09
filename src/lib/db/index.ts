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
  return usingLocalStore() ? localStore : supabaseStore;
}

export type { Store };
export * from "./store";
