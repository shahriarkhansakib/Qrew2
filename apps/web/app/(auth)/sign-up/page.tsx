"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Separator } from "@/components/ui/separator";
import { signIn, signUp } from "@/lib/auth-client";

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const _router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loadingType, setLoadingType] = useState<"credentials" | "google" | null>(null);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema as any),
    defaultValues: { name: "", email: "", password: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (data: SignUpValues) => {
    setLoadingType("credentials");
    setGlobalError(null);

    const { data: sessionData, error } = await signUp.email({
      name: data.name,
      email: data.email,
      password: data.password,
    });

    if (error) {
      setGlobalError(error.message || "Failed to create account. Please try again.");
      setLoadingType(null);
      return;
    }

    const role = sessionData?.user?.role || "user";

    if (role === "super_admin") window.location.href = "/super-admin";
    else if (role === "admin") window.location.href = "/admin";
    else window.location.href = "/dashboard";
  };

  const handleGoogleSignUp = async () => {
    setLoadingType("google");
    setGlobalError(null);

    // Explicitly construct the absolute URL to force the backend to redirect to port 5002
    await signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/sign-in`,
    });
  };

  const isFormDisabled = loadingType !== null;

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
        <Link href="/sign-in">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-4 bg-background/80 backdrop-blur-md"
          >
            Sign In <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </header>

      <div className="flex-1 grid place-items-center px-4 py-12 z-10">
        <Card className="card-animate w-full max-w-sm border-border/50 bg-background/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
            <CardDescription>Enter your details to get started</CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5">
            {globalError && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/20 font-medium">
                {globalError}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full h-10 bg-background/50"
              onClick={handleGoogleSignUp}
              disabled={isFormDisabled}
            >
              {loadingType === "google" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Sign up with Google
            </Button>

            <div className="relative">
              <Separator className="bg-border" />
              <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-[11px] uppercase tracking-widest text-muted-foreground rounded-full">
                or
              </span>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Full Name</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="text"
                      placeholder="John Doe"
                      autoComplete="name"
                      aria-invalid={fieldState.invalid}
                      disabled={isFormDisabled}
                      className="bg-background/60"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="email"
                      placeholder="admin@operations-os.com"
                      autoComplete="email"
                      aria-invalid={fieldState.invalid}
                      disabled={isFormDisabled}
                      className="bg-background/60"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <div className="relative">
                      <Input
                        {...field}
                        id={field.name}
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        aria-invalid={fieldState.invalid}
                        disabled={isFormDisabled}
                        className="pr-10 bg-background/60"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground border-0 focus-visible:ring-0"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isFormDisabled}
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
                disabled={isFormDisabled}
              >
                {loadingType === "credentials" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border/50 pt-6 text-sm text-muted-foreground">
            Already have an account?
            <Link href="/sign-in" className="ml-1 text-foreground font-medium hover:underline">
              Sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
