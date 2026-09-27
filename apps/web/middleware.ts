import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

if (!process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not set.");
}
if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL is not set.");
}

// Global App Roles (NOT Tenant Roles)
const ROLE_HIERARCHY: Record<string, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

const getDefaultPath = (level: number) => {
  if (level >= ROLE_HIERARCHY.super_admin) return "/super-admin";
  if (level === ROLE_HIERARCHY.admin) return "/admin";
  return "/dashboard";
};

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const isAuthRoute =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  // Added /onboarding to protected routes
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/onboarding");

  if (!isAuthRoute && !isProtectedRoute) {
    return NextResponse.next();
  }

  // Robust Fetch Logic
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL as string; // backend
  const apiUrl = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL as string; // frontend
  const cookieHeader = request.headers.get("cookie") || "";

  let sessionData = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${apiUrl}/api/auth/get-session`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        origin: appUrl,
        accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      sessionData = await res.json();
    } else {
      console.error(`[Middleware] Auth Rejected: ${res.status}`);
    }
  } catch (err) {
    console.warn("[Middleware] Auth check bypassed (network error or timeout)");
  }

  const isAuthenticated = !!sessionData?.session;
  const user = sessionData?.user;
  const globalRole = user?.role || "user";
  const globalLevel = ROLE_HIERARCHY[globalRole] || 0;

  // Guard Clause 1: Hard block for Banned/Suspended users
  // Ensure we don't cause an infinite redirect loop if they are already on /blocked
  if (
    user &&
    (user.status === "banned" || user.status === "suspended") &&
    pathname !== "/blocked"
  ) {
    return NextResponse.redirect(new URL("/blocked", request.url));
  }

  // Guard Clause 2: Forced Password Reset
  // Bypass if they are already heading to the reset endpoint
  if (user && user.requiresPasswordReset === true && !pathname.startsWith("/reset-password")) {
    return NextResponse.redirect(new URL("/reset-password", request.url));
  }

  // 1. Unauthenticated users cannot see protected pages
  if (isProtectedRoute && !isAuthenticated) {
    const signInUrl = new URL("/sign-in", request.url);
    if (pathname !== "/dashboard") {
      signInUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(signInUrl);
  }

  // 2. Logged-in users shouldn't see auth pages
  if (isAuthRoute && isAuthenticated) {
    const redirectTarget = searchParams.get("redirect");
    if (redirectTarget) {
      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }
    return NextResponse.redirect(new URL(getDefaultPath(globalLevel), request.url));
  }

  // 3. Strict Global Role Isolation
  if (pathname.startsWith("/super-admin") && globalLevel < ROLE_HIERARCHY.super_admin) {
    return NextResponse.redirect(new URL(getDefaultPath(globalLevel), request.url));
  }
  if (pathname.startsWith("/admin") && globalLevel < ROLE_HIERARCHY.admin) {
    return NextResponse.redirect(new URL(getDefaultPath(globalLevel), request.url));
  }

  // 4. THE MULTI-TENANT ROUTER (For Standard Users)
  // We only run this if they are trying to access the tenant dashboard or onboarding
  if (
    globalLevel === ROLE_HIERARCHY.user &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding"))
  ) {
    const activeOrgId = sessionData?.session?.activeOrganizationId;
    const isOnboarding = pathname.startsWith("/onboarding/organization");

    if (!activeOrgId && !isOnboarding) {
      // Logged in, no org selected -> Send to org selector
      return NextResponse.redirect(new URL("/onboarding/organization", request.url));
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-middleware-cache", "no-cache");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
