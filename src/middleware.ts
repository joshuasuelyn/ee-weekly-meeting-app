import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_USER_COOKIE } from "@/lib/constants";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

type CookiesToSet = Parameters<SetAllCookies>[0];

const PUBLIC_PATHS = ["/login", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Keeps the Supabase session cookie fresh and bounces anonymous visitors to /login.
 * Runs on the edge, so it checks cookies only — the data adapters are server-side.
 */
export async function middleware(request: NextRequest) {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  const localMode = process.env.DATA_ADAPTER === "local" || !url || !key;

  if (localMode) {
    const signedIn = Boolean(request.cookies.get(DEV_USER_COOKIE)?.value);
    if (!signedIn && !isPublic(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url!, key!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: CookiesToSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
