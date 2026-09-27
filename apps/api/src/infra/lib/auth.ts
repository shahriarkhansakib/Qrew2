import * as schema from "@starter/db";
import { db } from "@starter/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP, magicLink, organization, twoFactor } from "better-auth/plugins";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { logger } from "./logger";
import { redis } from "./redis";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is not set.");
}
if (!process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is not set.");
}
if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL is not set.");
}
if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error("GOOGLE_CLIENT_ID is not set.");
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_SECRET is not set.");
}
if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set.");
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Create a local SMTP transporter pointed at Docker Mailpit
const localTransporter = nodemailer.createTransport({
  host: "127.0.0.1",
  port: 1025,
  secure: false, // Local dev doesn't need TLS
});

// A smart wrapper that routes emails based on the environment
export async function sendSmartEmail(to: string, subject: string, html: string) {
  if (process.env.NODE_ENV === "development") {
    // DEV: Catch everything locally in Mailpit. No API limits, no real emails sent.
    await localTransporter.sendMail({
      from: "Qrew Local <dev@localhost>",
      to,
      subject,
      html,
    });
    logger.child({ module: "email" }).info({ to }, "[Mailpit] intercepted email");
  } else {
    // PROD: Send via Resend
    await resend.emails.send({
      from: "Qrew Security <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      twoFactor: schema.twoFactor,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    (process.env.NEXT_PUBLIC_APP_URL as string).replace(/['"]/g, "").replace(/\/+$/, "")
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  secondaryStorage: {
    get: async (key) => {
      const value = await redis.get(key);
      return value ?? null;
    },
    set: async (key, value, ttl) => {
      if (ttl) {
        await redis.set(key, value, "EX", ttl);
      } else {
        await redis.set(key, value);
      }
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url, token }) => {
      // Point DIRECTLY to the Next.js frontend, bypassing the intermediate API
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/['"]/g, "").replace(/\/+$/, "");
      const frontendUrl = `${appUrl}/reset-password?token=${token}`;
      await sendSmartEmail(
        user.email,
        "Reset your Qrew password",
        `<p>Click <a href="${frontendUrl}">here</a> to reset your password. This link expires in 15 minutes.</p>`,
      );
    },
  },
  rateLimit: {
    storage: "secondary-storage",
    window: 60,
    max: 100,
  },
  user: {
    additionalFields: {
      theme: {
        type: "string",
        required: false,
        defaultValue: "system",
      },
    },
  },

  plugins: [
    admin({
      defaultRole: "user",
    }),
    organization(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendSmartEmail(
          email,
          "Your Qrew Login Link",
          `<p>Click <a href="${url}">here</a> to log in to your account.</p>`,
        );
      },
      expiresIn: 60 * 15,
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        // This catches the 2FA Email request and routes it to Mailpit/Resend
        await sendSmartEmail(
          email,
          "Qrew - 2FA Security Code",
          `<div style="font-family: sans-serif; padding: 20px;">
             <h2>Security Verification</h2>
             <h1 style="letter-spacing: 5px; background: #f3f4f6; padding: 10px;">${otp}</h1>
             <p>This code expires in 5 minutes.</p>
           </div>`,
        );
      },
    }),
    twoFactor({
      issuer: "Qrew",
      providerOptions: {
        totp: {
          // Optional: customize totp settings here if needed
        },
        email: {
          sendOTP: async ({ user, otp }: { user: { email: string }; otp: string }) => {
            await sendSmartEmail(
              user.email,
              "Your 2FA Security Code",
              `<div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2>Security Verification</h2>
                <p>Your one-time passcode is:</p>
                <h1 style="letter-spacing: 5px; color: #10B981; background: #f3f4f6; padding: 10px; border-radius: 8px;">${otp}</h1>
                <p>This code expires in 5 minutes. Do not share it with anyone.</p>
               </div>`,
            );
          },
        },
      },
    }),
  ],
});

export type Auth = typeof auth;
