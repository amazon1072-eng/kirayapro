import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Next.js 16: "middleware" was renamed to "proxy".
// Only checks cookie presence; every protected page/API verifies the
// session against the database (lib/auth.ts getCurrentUser).
const PROTECTED = [
  "/dashboard",
  "/properties",
  "/tenants",
  "/billing",
  "/payments",
  "/receipts",
  "/reports",
  "/maintenance",
  "/settings",
  "/union",
  "/notifications",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/properties/:path*",
    "/tenants/:path*",
    "/billing/:path*",
    "/payments/:path*",
    "/receipts/:path*",
    "/reports/:path*",
    "/maintenance/:path*",
    "/settings/:path*",
    "/union/:path*",
    "/notifications/:path*",
  ],
};
