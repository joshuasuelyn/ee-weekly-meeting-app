"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui";
import { sendMagicLink } from "./actions";

export function MagicLinkForm() {
  const [state, action, pending] = useActionState(sendMagicLink, {});

  if (state.sent) {
    return (
      <Card className="p-5">
        <h2 className="font-medium mb-1">Check your email</h2>
        <p className="text-[0.9rem] text-(--color-muted)">
          A sign-in link is on its way. It expires in an hour.
        </p>
      </Card>
    );
  }

  return (
    <Card as="section" className="p-5">
      <form action={action} className="grid gap-3">
        <label className="text-[0.9rem] font-medium" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@easyeurope.com.my"
          className="px-3 py-2.5 rounded-xl border border-(--color-line) w-full"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-50"
        >
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
        {state.error ? (
          <p className="text-[0.9rem] text-(--color-off)">{state.error}</p>
        ) : (
          <p className="text-[0.85rem] text-(--color-muted)">No password to remember.</p>
        )}
      </form>
    </Card>
  );
}
