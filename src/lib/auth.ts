// Who is signed in.
//
// With Supabase configured this is magic-link auth: the JWT carries an email, and the
// application user is whichever public.users row has that email. Without Supabase (local
// dev) it is a cookie holding a user id, so the whole app can be driven without accounts.

import { cookies } from "next/headers";
import { DEV_USER_COOKIE } from "./constants";
import { getStore, usingLocalStore } from "./db";
import { createClient, supabaseConfigured } from "./supabase/server";
import type { User } from "./types";

export { DEV_USER_COOKIE };

export async function getCurrentUser(): Promise<User | null> {
  const store = getStore();

  if (usingLocalStore()) {
    const id = (await cookies()).get(DEV_USER_COOKIE)?.value;
    return id ? store.getUserById(id) : null;
  }

  if (!supabaseConfigured()) return null;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return null;

  return store.getUserByEmail(user.email);
}

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
