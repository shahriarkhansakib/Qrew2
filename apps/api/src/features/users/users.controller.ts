import type { Context } from "hono";
import { auth, sendSmartEmail } from "../../infra/lib/auth";
import { logger } from "../../infra/lib/logger";
import { redis } from "../../infra/lib/redis";
import type { AuthVariables } from "../../infra/middleware/auth";
import { UsersService } from "./users.service";

const usersControllerLog = logger.child({ module: "users-controller" });

export const UsersController = {
  async deleteMe(c: Context<{ Variables: AuthVariables }>) {
    const user = c.get("user");
    if (!user?.id)
      return c.json({ error: "Unauthorized", message: "User context is missing or invalid." }, 401);

    try {
      const body = await c.req.json();

      // SECURITY GATE: Verify the payload via Better Auth's internal API
      if (body.password) {
        const isValid = await auth.api.verifyPassword({
          body: { password: body.password },
          headers: c.req.raw.headers,
        });
        if (!isValid) return c.json({ error: "Forbidden", message: "Invalid password" }, 403);
      } else if (body.otp) {
        const storedOtp = await redis.get(`delete_otp:${user.id}`);
        if (!storedOtp || storedOtp !== body.otp) {
          return c.json({ error: "Forbidden", message: "Invalid or expired OTP." }, 403);
        }
        await redis.del(`delete_otp:${user.id}`);
      } else {
        return c.json(
          { error: "Bad Request", message: "Missing password or OTP verification" },
          400,
        );
      }

      // Execute safe deletion
      await UsersService.softDeleteAccount(user.id);

      // Sign the user out of the current device to immediately clear their HTTP-only cookies
      await auth.api.signOut({
        headers: c.req.raw.headers,
      });

      return c.json({ success: true, message: "Account purged." }, 200);
    } catch (error: unknown) {
      usersControllerLog.error({ userId: user.id, err: error }, "Account purge failure");
      return c.json(
        { error: "Internal Server Error", message: "Failed to process deletion." },
        500,
      );
    }
  },

  async sendDeleteOtp(c: Context<{ Variables: AuthVariables }>) {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    try {
      // 1. Generate a secure 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // 2. Store in Redis with a 15-minute expiration (900 seconds)
      await redis.set(`delete_otp:${user.id}`, otp, "EX", 900);

      // 3. Dispatch the email using our smart wrapper
      await sendSmartEmail(
        user.email,
        "Qrew - Account Deletion Verification",
        `<div style="font-family: sans-serif; padding: 20px;">
           <h2 style="color: #ef4444;">Account Deletion Request</h2>
           <p>You requested to permanently delete your account. Use this code to confirm:</p>
           <h1 style="letter-spacing: 5px; background: #f3f4f6; padding: 10px;">${otp}</h1>
         </div>`,
      );

      return c.json({ success: true, message: "OTP sent successfully." }, 200);
    } catch (error) {
      usersControllerLog.error({ userId: user.id, err: error }, "sendDeleteOtp failed");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  },

  async verifyPassword(c: Context<{ Variables: AuthVariables }>) {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const password = body.password;
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // We use Better Auth's local API to securely check the hash
    const isValid = await auth.api.verifyPassword({
      body: { password },
      headers: c.req.raw.headers,
    });

    if (!isValid.status) {
      return c.json({ error: "Forbidden", message: "Invalid password" }, 403);
    }

    return c.json({ success: true }, 200);
  },
};
