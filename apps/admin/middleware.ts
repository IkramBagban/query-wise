import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAdminAllowlist } from "@/lib/admin-auth";

/**
 * SPEC-08 §3.2: Clerk auth + fail-closed gate on every route.
 * Unconfigured allowlist → rewrite to /not-configured (no nav, no content).
 * Signed-in but not allowlisted → rewrite to /forbidden.
 * There is no public product page; /sign-in exists only so operators can auth.
 */

const isSignIn = createRouteMatcher(["/sign-in(.*)"]);
const isAccessTerminal = createRouteMatcher([
  "/not-configured",
  "/forbidden",
]);

export default clerkMiddleware(
  async (auth, request) => {
    const allowlist = getAdminAllowlist();
    const { pathname } = request.nextUrl;

    // Fail closed: unconfigured admin admits nobody, including in development.
    if (allowlist.length === 0) {
      if (pathname !== "/not-configured") {
        const url = request.nextUrl.clone();
        url.pathname = "/not-configured";
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }

    // Configured: the not-configured terminal is unused.
    if (pathname === "/not-configured") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Allow sign-in without a session so operators can authenticate.
    if (isSignIn(request)) {
      return NextResponse.next();
    }

    const session = await auth();
    const userId = session.userId;

    if (!userId) {
      // Clerk protect redirects unauthenticated users to sign-in.
      await auth.protect();
      return NextResponse.next();
    }

    if (!allowlist.includes(userId)) {
      if (pathname !== "/forbidden") {
        const url = request.nextUrl.clone();
        url.pathname = "/forbidden";
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }

    // Allowlisted admin should not land on the 403 terminal.
    if (isAccessTerminal(request) && pathname === "/forbidden") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  },
  {
    signInUrl: "/sign-in",
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
