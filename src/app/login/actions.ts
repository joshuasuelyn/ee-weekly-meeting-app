"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_USER_COOKIE } from "@/lib/auth";
import { getStore, usingLocalStore } from "@/lib/db";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

/** Local dev only: "sign in as" without any account to provision. */
export async function signInAsDev(formData: FormData) {
  if (!usingLocalStore()) throw new Error("Dev sign-in is disabled when Supabase is configured.");

  const userId = String(formData.get("user_id") ?? "");
  const user = await getStore().getUserById(userId);
  if (!user) throw new Error("Unknown user");

  (await cookies()).set(DEV_USER_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function sendMagicLink(
  _prev: { error?: string; sent?: boolean },
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  if (!supabaseConfigured()) return { error: "Supabase is not configured on this deployment." };

  // Only people already on the team can sign in — no public access (§2).
  const known = await getStore().getUserByEmail(email);
  if (!known || !known.active) {
    return { error: "That address isn't on the team list. Ask Joshua to add you in Admin." };
  }

  const sb = await createClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  return { sent: true };
}

export async function signOut() {
  if (usingLocalStore()) {
    (await cookies()).delete(DEV_USER_COOKIE);
  } else {
    const sb = await createClient();
    await sb.auth.signOut();
  }
  redirect("/login");
}
