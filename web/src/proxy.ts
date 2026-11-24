import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getLoginDestination, getLoginPath } from "@/lib/auth-redirects";

const AUTH_PAGES = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  // Mock demo: no real login; allow every page (the client-side auth guard also allows through).
  if (process.env.NEXT_PUBLIC_MOCK === "1") return NextResponse.next();

  const { pathname, search, hash } = request.nextUrl;
  const token = request.cookies.get("superartex_token")?.value;
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Not logged in → redirect to the login page
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL(getLoginPath(pathname + search + hash), request.url));
  }

  // Logged in while visiting the login/setup pages → redirect to the main UI
  if (token && isAuthPage) {
    const onLoginPage = pathname === "/login" || pathname === "/login/";
    const destination = onLoginPage ? getLoginDestination(search) : "/function/tasks";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next.js internal routes, API routes, favicon, and static files under public/ (images, fonts, etc.)
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf)$).*)"],
};
