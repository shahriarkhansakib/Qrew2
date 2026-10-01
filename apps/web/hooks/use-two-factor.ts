import { SubmitEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

type Step = "password" | "method" | "qr" | "email";

export function useTwoFactor() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  // Modal & Flow States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState<Step>("password");
  const [isLoading, setIsLoading] = useState(false);

  // Form Data States
  const [currentPassword, setCurrentPassword] = useState("");
  const [qrCodeData, setQrCodeData] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // UI States
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    async function checkSecurityStatus() {
      const { data } = await authClient.listAccounts();
      if (data) {
        setHasPassword(data.some((account) => account.providerId === "credential"));
      } else {
        setHasPassword(false);
      }
      // Note: In a real app, you would also check if 2FA is already enabled here
      // For this starter, we rely on the session or user object which usually holds this flag.
    }
    checkSecurityStatus();
  }, []);

  const openModal = () => setIsModalOpen(true);

  const closeModal = () => {
    setIsModalOpen(false);
    // Reset state strictly after the modal exit animation completes
    setTimeout(() => {
      setStep("password");
      setOtpCode("");
      setCurrentPassword("");
    }, 300);
  };

  const handlePasswordSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Cleanly verify the password against our custom endpoint
      const res = await fetch("/api/users/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPassword }),
      });

      setIsLoading(false);

      if (!res.ok) {
        toast.error("Incorrect password. Please try again.");
        return; // HARD STOP. Do not advance to method selection.
      }

      // 2. Password is cryptographically verified. Proceed to method selection.
      setStep("method");
    } catch (_error) {
      setIsLoading(false);
      toast.error("Verification failed due to a network error.");
    }
  };

  const handleSelectMethod = async (method: "authenticator" | "email") => {
    setIsLoading(true);

    const payload =
      method === "authenticator"
        ? { password: currentPassword }
        : { password: currentPassword, provider: "email" };

    const { data, error } = await authClient.twoFactor.enable(payload);

    setIsLoading(false);

    if (error) {
      toast.error(error.message || "Failed to initiate 2FA setup. Please check your password.");
      setStep("password");
      return;
    }

    if (method === "authenticator" && data?.totpURI) {
      setQrCodeData(data?.totpURI);
      setStep("qr");
    } else if (method === "email") {
      toast.success("A verification code has been sent to your email.");
      setStep("email");
    }
  };

  const verifyAndEnable = async () => {
    setIsLoading(true);
    const { data, error } = await authClient.twoFactor.verifyTotp({ code: otpCode });
    setIsLoading(false);

    if (error) {
      toast.error("Invalid code. Please try again.");
    } else {
      setIsEnabled(true);
      // Fallback for types if backupCodes isn't strictly typed yet
      setBackupCodes((data as any)?.backupCodes || []);
      closeModal();
      toast.success("Two-Factor Authentication enabled successfully.");
    }
  };

  const extractSecretFromURI = (uri: string) => {
    try {
      const url = new URL(uri);
      return url.searchParams.get("secret") || "Secret Key Unavailable";
    } catch {
      return "Secret Key Unavailable";
    }
  };

  const copyToClipboard = (text: string, type: "codes" | "key") => {
    navigator.clipboard.writeText(text);
    if (type === "codes") {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
      toast.success("Backup codes copied to clipboard.");
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
      toast.success("Setup key copied to clipboard.");
    }
  };

  return {
    state: {
      hasPassword,
      isEnabled,
      isModalOpen,
      step,
      isLoading,
      currentPassword,
      qrCodeData,
      otpCode,
      backupCodes,
      copiedCodes,
      copiedKey,
    },
    actions: {
      openModal,
      closeModal,
      setCurrentPassword,
      setOtpCode,
      setStep,
      handlePasswordSubmit,
      handleSelectMethod,
      verifyAndEnable,
      extractSecretFromURI,
      copyToClipboard,
    },
  };
}
