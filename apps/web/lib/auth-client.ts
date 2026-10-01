import {
  adminClient,
  inferAdditionalFields,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "../../api/src/infra/lib/auth";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL as string,
  plugins: [
    adminClient(),
    magicLinkClient(),
    twoFactorClient(),
    organizationClient(),
    inferAdditionalFields<Auth>(),
  ],
});

export const { useSession, signIn, signUp, signOut, requestPasswordReset, resetPassword } =
  authClient;
