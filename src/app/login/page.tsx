import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStore, usingLocalStore } from "@/lib/db";
import { Card } from "@/components/ui";
import { signInAsDev } from "./actions";
import { MagicLinkForm } from "./magic-link-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const local = usingLocalStore();
  const users = local ? await getStore().listUsers({ includeInactive: true }) : [];

  return (
    <div className="max-w-md mx-auto pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Easy Europe Weekly</h1>
      <p className="text-(--color-muted) mt-1 mb-6">
        The Monday management meeting. Team access only.
      </p>

      {local ? (
        <Card className="p-5">
          <h2 className="font-medium mb-1">Local dev sign-in</h2>
          <p className="text-[0.9rem] text-(--color-muted) mb-4">
            No Supabase configured, so pick who you are. In production this screen is a magic
            link instead.
          </p>
          <div className="grid gap-2">
            {users.map((u) => (
              <form key={u.id} action={signInAsDev}>
                <input type="hidden" name="user_id" value={u.id} />
                <button
                  type="submit"
                  className="w-full text-left px-4 py-3 rounded-xl border border-(--color-line) hover:bg-(--color-grey-bg) flex items-center justify-between"
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="text-[0.85rem] text-(--color-muted)">
                    {u.role === "facilitator" ? "Facilitator" : u.department}
                    {u.active ? "" : " · inactive"}
                  </span>
                </button>
              </form>
            ))}
          </div>
        </Card>
      ) : (
        <MagicLinkForm />
      )}
    </div>
  );
}
