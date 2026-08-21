import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "./src/auth/server.js";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackURL", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/health|sign-in|_next/static|_next/image|favicon.ico).*)",
  ],
};
