"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BackgroundEffects } from "@/components/layout/background-effects";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, signIn, signOut, signUp, useSession } from "@/lib/auth-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

// Schemas for embedded forms
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

interface InviteData {
  email: string;
  orgName: string;
  userExists: boolean;
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteId = searchParams.get("id");
  const { data: session, isPending: isLoadingSession } = useSession();

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!inviteId) {
      setError("No invitation ID provided in the URL.");
      setIsLoadingInvite(false);
      return;
    }

    const fetchInvite = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/workspaces/staff/invites/${inviteId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load invitation.");
        setInviteData(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoadingInvite(false);
      }
    };

    fetchInvite();
  }, [inviteId]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema as any),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema as any),
    defaultValues: { name: "", email: "", password: "" },
  });

  // Keep the form email synced with the loaded invite email
  useEffect(() => {
    if (inviteData?.email) {
      loginForm.setValue("email", inviteData.email);
      signupForm.setValue("email", inviteData.email);
    }
  }, [inviteData, loginForm, signupForm]);

  const handleDirectAccept = async () => {
    if (!inviteId) return;
    setIsAccepting(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/invites/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: inviteId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept invitation");

      toast.success("Invitation accepted successfully!");

      // Auto-switch to the newly joined organization!
      if (data.organizationId) {
        await authClient.organization.setActive({ organizationId: data.organizationId });
      }

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message);
      setIsAccepting(false);
    }
  };

  const onLoginSubmit = async (data: LoginValues) => {
    setIsAccepting(true);
    setError(null);

    // 1. Sign In
    const { error: signInError } = await signIn.email({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      setError(signInError.message || "Invalid credentials.");
      setIsAccepting(false);
      return;
    }

    // 2. Accept Invite
    await handleDirectAccept();
  };

  const onSignupSubmit = async (data: SignupValues) => {
    setIsAccepting(true);
    setError(null);

    // 1. Sign Up
    const { error: signUpError } = await signUp.email({
      name: data.name,
      email: data.email,
      password: data.password,
    });

    if (signUpError) {
      setError(signUpError.message || "Failed to create account.");
      setIsAccepting(false);
      return;
    }

    // 2. Accept Invite
    await handleDirectAccept();
  };

  const handleLogout = async () => {
    await signOut();
    window.location.reload();
  };

  if (isLoadingInvite || isLoadingSession) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div className="flex-1 grid place-items-center px-4 py-12 z-10">
        <Card className="w-full max-w-md border-border/50 bg-background/80 backdrop-blur-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-destructive">
              Invalid Invitation
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href="/">
              <Button variant="outline">Return Home</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Determine which scenario we are in
  const isCorrectUserLoggedIn = session?.user?.email === inviteData?.email;
  const isWrongUserLoggedIn = session?.user && !isCorrectUserLoggedIn;

  return (
    <div className="flex-1 grid place-items-center px-4 py-12 z-10">
      <Card className="card-animate w-full max-w-md border-border/50 bg-background/80 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-1 text-center pb-6">
          <CardTitle className="text-2xl font-bold tracking-tight">Workspace Invitation</CardTitle>
          <CardDescription>
            You've been invited to join <strong>{inviteData?.orgName}</strong>.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/20 font-medium text-center">
              {error}
            </div>
          )}

          {isCorrectUserLoggedIn && (
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Logged in as</p>
                <p className="font-semibold">{session?.user?.email}</p>
              </div>
              <Button
                onClick={handleDirectAccept}
                disabled={isAccepting}
                className="w-full h-10 shadow-md shadow-primary/20"
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accepting...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Accept Invitation
                  </>
                )}
              </Button>
            </div>
          )}

          {isWrongUserLoggedIn && (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <p className="text-sm font-medium text-destructive mb-2">
                  You are already logged into this account.
                </p>
                <p className="text-xs text-muted-foreground">
                  Currently logged in as <strong>{session.user.email}</strong>. If this invitation
                  was meant for a different address, please log out.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleLogout}
                  className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </Button>
                <Link href="/dashboard" className="w-full">
                  <Button variant="outline" className="w-full">
                    Return to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {!session?.user && inviteData?.userExists && (
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Email</FieldLabel>
                <Input
                  value={inviteData.email}
                  disabled
                  className="bg-muted text-muted-foreground opacity-70"
                />
              </div>
              <Controller
                name="password"
                control={loginForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-password">Password to accept</FieldLabel>
                    <div className="relative">
                      <Input
                        {...field}
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        disabled={isAccepting}
                        className="pr-10 bg-background/60"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground border-0 focus-visible:ring-0"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isAccepting}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Button
                type="submit"
                className="w-full h-10 shadow-md shadow-primary/20"
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accepting...
                  </>
                ) : (
                  "Sign In & Accept"
                )}
              </Button>
            </form>
          )}

          {!session?.user && !inviteData?.userExists && (
            <form onSubmit={signupForm.handleSubmit(onSignupSubmit)} className="space-y-4">
              <Controller
                name="name"
                control={signupForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="signup-name">Full Name</FieldLabel>
                    <Input
                      {...field}
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      placeholder="John Doe"
                      disabled={isAccepting}
                      className="bg-background/60"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <div className="space-y-2">
                <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                <Input
                  id="signup-email"
                  value={inviteData?.email}
                  autoComplete="username"
                  disabled
                  className="bg-muted text-muted-foreground opacity-70"
                />
              </div>
              <Controller
                name="password"
                control={signupForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="signup-password">Create Password</FieldLabel>
                    <div className="relative">
                      <Input
                        {...field}
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        disabled={isAccepting}
                        className="pr-10 bg-background/60"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground border-0 focus-visible:ring-0"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isAccepting}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Button
                type="submit"
                className="w-full h-10 shadow-md shadow-primary/20"
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                  </>
                ) : (
                  "Create Account & Accept"
                )}
              </Button>
            </form>
          )}
        </CardContent>

        {!session?.user && (
          <CardFooter className="flex justify-center border-t border-border/50 pt-6 text-xs text-muted-foreground text-center">
            By accepting, you agree to join this workspace.
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <section className="relative min-h-screen w-full bg-background text-foreground overflow-hidden flex flex-col">
      <BackgroundEffects />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/50 backdrop-blur-md">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="h-4 w-4" />
          <div className="h-4 w-4 rounded bg-primary ml-2" />
          Qrew
        </Link>
      </header>

      <Suspense
        fallback={
          <div className="flex-1 grid place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <AcceptInviteContent />
      </Suspense>
    </section>
  );
}
