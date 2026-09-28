import { SubmitEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";

type DeleteStep = "warning" | "password-verify" | "otp-verify";
type AuthType = "credential" | "oauth" | null;

export function useDeleteAccount() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<DeleteStep>("warning");
  const [authType, setAuthType] = useState<AuthType>(null);

  // Processing States
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form States
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  useEffect(() => {
    async function determineAuthType() {
      const { data } = await authClient.listAccounts();
      if (data) {
        const hasPassword = data.some((account) => account.providerId === "credential");
        setAuthType(hasPassword ? "credential" : "oauth");
      }
    }

    if (isOpen && !authType) {
      determineAuthType();
    }
  }, [isOpen, authType]);

  const openModal = () => setIsOpen(true);

  const closeModal = () => {
    setIsOpen(false);
    setTimeout(() => {
      setStep("warning");
      setPassword("");
      setOtp("");
    }, 300); // Reset after exit animation
  };

  const handleInitiateDeletion = async () => {
    if (authType === "credential") {
      setStep("password-verify");
    } else if (authType === "oauth") {
      setIsLoading(true);

      try {
        // Execute the real API call
        const res = await fetch("/api/users/me/otp", { method: "POST" });
        if (!res.ok) throw new Error("Failed to send OTP");

        toast.success("A 6-digit confirmation code has been sent to your email.");
        setStep("otp-verify");
      } catch (_error) {
        toast.error("Could not send verification email. Try again.");
      } finally {
        setIsLoading(false);
      }
    } else {
      toast.error("Failed to determine account security type. Try again later.");
    }
  };

  const executeDeletion = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsDeleting(true);

    try {
      // We pass the verification material to your backend
      const payload = authType === "credential" ? { password } : { otp };

      const response = await fetch(`/api/users/me`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Verification failed. Account not deleted.");
      }

      // Hard redirect purges the Next.js router cache entirely
      window.location.href = "/sign-up";
    } catch (error: any) {
      console.error("[Account Deletion Error]:", error);
      toast.error(error.message);
      setIsDeleting(false);
    }
  };

  return {
    state: {
      isOpen,
      step,
      authType,
      isLoading,
      isDeleting,
      password,
      otp,
      userEmail: session?.user?.email || "",
    },
    actions: {
      setIsOpen: openModal,
      closeModal,
      setPassword,
      setOtp,
      handleInitiateDeletion,
      executeDeletion,
    },
  };
}
