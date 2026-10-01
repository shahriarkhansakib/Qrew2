"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import imageCompression from "browser-image-compression";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { AvatarUploader } from "./avatar-uploader";
import { ProfileDetailsForm } from "./profile-details-form";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  avatarFile: z.any().optional().nullable(),
  avatarDeleted: z.boolean().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileView() {
  const { data: session } = useSession();
  const [globalMsg, setGlobalMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const methods = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema as any),
    defaultValues: { name: "", avatarFile: null, avatarDeleted: false },
  });

  const {
    formState: { isDirty, isSubmitting },
    reset,
    handleSubmit,
  } = methods;

  const [isShaking, setIsShaking] = useState(false);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  useEffect(() => {
    if (session?.user && !isDirty) {
      reset({ name: session.user.name || "", avatarFile: null, avatarDeleted: false });
    }
  }, [session, reset, isDirty]);

  // Navigation Guard (Browser + Next.js Router)
  useEffect(() => {
    if (!isDirty) return;

    // 1. Intercept Browser Close/Reload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsaved changes";
    };

    // 2. Intercept Client-Side Next.js <Link> clicks
    const handleLinkClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      // If clicking a link that navigates away from the current page
      if (target?.href && !target.href.includes(window.location.pathname)) {
        e.preventDefault();
        e.stopPropagation();
        triggerShake();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    // Use capture phase to intercept the click before Next.js router handles it
    document.addEventListener("click", handleLinkClick, { capture: true });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, { capture: true });
    };
  }, [isDirty, triggerShake]);

  const onSubmit = async (data: ProfileValues) => {
    setGlobalMsg(null);
    let finalImageUrl = session?.user?.image;

    try {
      // 1. Handle Avatar Deletion
      if (data.avatarDeleted) {
        finalImageUrl = "";
      }
      // 2. Handle New Avatar Upload
      else if (data.avatarFile) {
        const file = await imageCompression(data.avatarFile, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
          fileType: "image/webp",
        });

        const urlResponse = await fetch(`/api/uploads/presigned-avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ contentType: file.type }),
        });

        if (!urlResponse.ok) throw new Error("Failed to get secure upload link.");
        const { url, publicUrl } = await urlResponse.json();

        const uploadResponse = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResponse.ok) throw new Error("Failed to upload image to storage.");
        finalImageUrl = `${publicUrl}?v=${Date.now()}`;
      }

      // 3. Update Better Auth Profile
      const { error } = await authClient.updateUser({
        name: data.name,
        ...(finalImageUrl !== session?.user?.image ? { image: finalImageUrl } : {}),
      });

      if (error) throw new Error(error.message || "Failed to update profile.");

      // Preload Avatar to prevent flashing
      if (data.avatarFile && finalImageUrl) {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve; // Continue even if load fails
          img.src = finalImageUrl as string;
        });
      }

      // Success
      setGlobalMsg({ type: "success", text: "Profile updated successfully." });
      reset({ name: data.name, avatarFile: null, avatarDeleted: false }); // Clears isDirty
      setTimeout(() => setGlobalMsg(null), 3000);
    } catch (err: any) {
      console.error("[ProfileUpdate]", err);
      setGlobalMsg({ type: "error", text: err.message || "An error occurred." });
    }
  };

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-8 text-foreground pb-24 w-full min-w-0 px-4 md:px-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Public Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your identity and how you appear to other users.
          </p>
        </div>

        <Card className="bg-card/40 backdrop-blur-sm border-border/50 shadow-sm scroll-mt-8 overflow-hidden min-w-0">
          <CardContent className="flex flex-col md:flex-row gap-8 pt-6">
            <AvatarUploader />
            <Separator orientation="vertical" className="hidden md:block h-auto" />
            <ProfileDetailsForm />
          </CardContent>
        </Card>

        {/* FLOATING TOAST NOTIFICATION - No Layout Shift */}
        {globalMsg && (
          <div className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-50 px-4 py-3 rounded-lg shadow-lg border border-border/50 bg-background/95 backdrop-blur-md font-medium text-sm flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in-0 duration-300">
            {globalMsg.type === "success" ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <AlertTriangle className="size-4 text-destructive" />
            )}
            <span className="text-foreground">{globalMsg.text}</span>
          </div>
        )}

        {/* DUMMY CONTENT TO TEST SCROLLING */}
        <div className="mt-8 space-y-8">
          <Card className="bg-card/40 backdrop-blur-sm border-border/50 shadow-sm opacity-50 min-w-0">
            <CardHeader>
              <CardTitle className="font-medium text-lg">Notification Preferences</CardTitle>
              <CardDescription>Manage how you receive alerts.</CardDescription>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center border-t border-dashed border-border/50">
              <span className="text-muted-foreground">Dummy Content</span>
            </CardContent>
          </Card>

          <Card className="bg-card/40 backdrop-blur-sm border-border/50 shadow-sm opacity-50 min-w-0">
            <CardHeader>
              <CardTitle className="font-medium text-lg">API Access Keys</CardTitle>
              <CardDescription>Manage developer tokens.</CardDescription>
            </CardHeader>
            <CardContent className="h-96 flex items-center justify-center border-t border-dashed border-border/50">
              <span className="text-muted-foreground">Dummy Content</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {isDirty && (
        <div className="fixed bottom-20 md:bottom-8 left-0 right-0 z-50 px-4 sm:px-6 pointer-events-none flex justify-center animate-in slide-in-from-bottom-4 duration-300">
          <Card
            className={cn(
              "pointer-events-auto w-full sm:w-auto max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 p-3 sm:px-5 sm:py-3 bg-background/95 backdrop-blur-xl rounded-2xl transition-all duration-200 min-w-0",
              isShaking
                ? "animate-shake ring-2 ring-destructive border-destructive shadow-2xl shadow-destructive/20"
                : "ring-1 ring-primary/20 border-primary/30 shadow-2xl",
            )}
          >
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <AlertTriangle
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isShaking ? "text-destructive" : "text-primary",
                )}
              />
              <div className="flex-1">
                <p
                  className={cn(
                    "text-sm font-medium transition-colors",
                    isShaking ? "text-destructive" : "text-foreground",
                  )}
                >
                  Unsaved changes
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Please save or discard them before leaving.
                </p>
              </div>
            </div>
            <div className="flex flex-row items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none h-8 text-xs px-4"
                onClick={() => reset()}
                disabled={isSubmitting}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-none h-8 text-xs px-4"
                onClick={handleSubmit(onSubmit)}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Save
              </Button>
            </div>
          </Card>
        </div>
      )}
    </FormProvider>
  );
}
