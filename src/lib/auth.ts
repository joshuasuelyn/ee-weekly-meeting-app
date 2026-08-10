// Who is signed in.
//
// With Supabase configured this is magic-link auth: the JWT carries an email, and the
// application user is whichever public.users row has that email. Without Supabase (local
// dev) it is a cookie holding a user id, so the whole app can be driven without accounts.

import { cache } from "react";
import { cookies } from "next/headers";
import { DEV_USER_COOKIE } from "./constants";
import { getStore, usingLocalStore } from "./db";
import { createClient, supabaseConfigured } from "./supabase/server";
import type { User } from "./types";

export { DEV_USER_COOKIE };

/**
 * Who is signed in, resolved once per request.
 *
 * Two costs used to be paid on every single render. The layout and the page each asked
 * independently, so each interaction did the work twice; React's cache() collapses that to
 * one. And the question itself was answered by calling Supabase Auth over the network —
 * getClaims verifies the token's signature locally against the project's public keys
 * instead, which is the same guarantee without the round trip.
 *
 * getClaims falls back to the network automatically on a project still using the legacy
 * shared-secret JWT, so this is never worse, only sometimes much better.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const store = getStore();

  if (usingLocalStore()) {
    const id = (await cookies()).get(DEV_USER_COOKIE)?.value;
    return id ? store.getUserById(id) : null;
  }

  if (!supabaseConfigured()) return null;

  const sb = await createClient();
  const { data, error } = await sb.auth.getClaims();
  const email = data?.claims?.email;
  if (error || typeof email !== "string" || !email) return null;

  return store.getUserByEmail(email);
});

/** Throws rather than rendering a half-authenticated page. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function requireFacilitator(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "facilitator") {
    throw new Error("Only the facilitator can do that.");
  }
  return user;
}

export function canOwnMetrics(user: User): boolean {
  return user.role !== "contributor";
}
