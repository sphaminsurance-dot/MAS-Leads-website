import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";

function verifyCookie(val: string | undefined) {
  if (!val) return false;
  const secret = process.env.AUTH_COOKIE_SECRET || "";
  if (!secret) return false;

  // cookie format: "v1.<ts>.<sig>"
  const parts = val.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;

  const ts = parts[1];
  const sig = parts[2];

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`v1.${ts}`)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  // 7 day expiry
  const t = Number(ts);
  if (!Number.isFinite(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login and Next internals
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("mas_admin")?.value;
  if (!verifyCookie(cookie)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
