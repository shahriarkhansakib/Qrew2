import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth";

/**
 * Hono context variable types.
 * Declaring these here lets TypeScript know what shape
 * c.get('user') and c.get('session') will be throughout
 * the app — no casting needed in route handlers.
 */
export type AuthVariables = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
  organizationId: string;
};

/**
 * requireAuth middleware
 *
 * Verifies the session on every request it wraps.
 * Attach this to any route or router that needs authentication.
 *
 * Usage on a single route:
 *   app.get('/me', requireAuth, (c) => { ... })
 *
 * Usage on a group of routes:
 *   const protected = new Hono()
 *   protected.use(requireAuth)
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c: Context, next: Next) => {
    // Ask Better Auth to verify the session from the incoming request.
    // It checks the cookie, validates against Redis/Postgres,
    // and returns the session + user if valid.
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized", message: "Valid session required." }, 401);
    }

    // Attach user and session to context so route handlers
    // can access them via c.get('user') and c.get('session').
    c.set("user", session.user);
    c.set("session", session.session);

    // Guard against banned or suspended accounts on all protected endpoints
    const user = session.user as any;
    if (user?.status === "banned" && !c.req.path.endsWith("/stop-impersonation")) {
      return c.json(
        {
          error: "Forbidden",
          code: "ACCOUNT_BANNED",
          message: "This account has been permanently banned.",
        },
        403,
      );
    }

    if (user?.status === "suspended" && !c.req.path.endsWith("/stop-impersonation")) {
      return c.json(
        {
          error: "Forbidden",
          code: "ACCOUNT_SUSPENDED",
          message: "This account is temporarily suspended. Please contact support.",
        },
        403,
      );
    }

    await next();
  },
);

export const requireActiveAccount = createMiddleware(async (c: Context, next: Next) => {
  const user = c.get("user") as any;

  // Guard Clause 1: Ensure user exists in context (requiresAuth should have set this)
  if (!user) {
    return c.json({ error: "Unauthorized", message: "Valid session required." }, 401);
  }

  // Guard Clause 2: The Guillotine - Reject Banned/Suspended Users immediately
  // WHY? To prevent data exfiltration or state mutation from a compromised/bad-actor account
  // that still holds a technically unexpired JWT.
  if (user.status === "banned") {
    return c.json(
      {
        error: "Forbidden",
        code: "ACCOUNT_BANNED",
        message: "This account has been permanently banned.",
      },
      403,
    );
  }

  if (user.status === "suspended") {
    return c.json(
      {
        error: "Forbidden",
        code: "ACCOUNT_SUSPENDED",
        message: "This account is temporarily suspended. Please contact support.",
      },
      403,
    );
  }

  // Guard Clause 3: Intercept for Password Reset
  if (user.requiresPasswordReset === true) {
    // WHY custom codes? We return a specific 403 code so the frontend TanStack Query interceptor
    // can programmatically catch this exact failure and push the user to the /reset-password route.
    return c.json(
      {
        error: "Forbidden",
        code: "REQUIRES_PASSWORD_RESET",
        message: "Security lockout: You must reset your password to continue.",
      },
      403,
    );
  }

  await next();
});
