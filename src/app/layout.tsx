import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { usingLocalStore } from "@/lib/db";
import { SignOutButton } from "@/components/sign-out";

export const metadata: Metadata = {
  title: "Easy Europe — Weekly Meeting",
  description: "Level 10 weekly management meeting for Easy Europe",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/prep", label: "My prep" },
  { href: "/meeting", label: "Meeting" },
  { href: "/history", label: "History" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const local = usingLocalStore();

  return (
    <html lang="en">
      <body className="min-h-screen">
        {local ? (
          <div className="bg-(--color-amber-bg) text-(--color-amber) text-center text-[0.85rem] py-1.5 font-medium">
            Local dev database — data lives in .data/db.json, not Supabase
          </div>
        ) : null}

        <header className="border-b border-(--color-line) bg-(--color-panel)">
          <div className="mx-auto max-w-6xl px-5 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight shrink-0">
              Easy Europe <span className="text-(--color-muted) font-normal">Weekly</span>
            </Link>

            {user ? (
              <>
                <nav className="flex items-center gap-1 text-[0.95rem]">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="px-2.5 py-1.5 rounded-lg hover:bg-(--color-grey-bg)"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {user.role === "facilitator" ? (
                    <Link href="/admin" className="px-2.5 py-1.5 rounded-lg hover:bg-(--color-grey-bg)">
                      Admin
                    </Link>
                  ) : null}
                </nav>

                <div className="ml-auto flex items-center gap-3 text-[0.9rem]">
                  <span className="text-(--color-muted)">
                    {user.name} · {user.role === "facilitator" ? "Facilitator" : user.department}
                  </span>
                  <SignOutButton />
                </div>
              </>
            ) : null}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
