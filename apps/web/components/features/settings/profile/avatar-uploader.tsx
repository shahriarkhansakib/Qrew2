"use client";

import { Camera, Crop, Image as ImageIcon, Loader2, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { useFormContext } from "react-hook-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth-client";
import { getCroppedImg } from "@/lib/crop-image";

export function AvatarUploader() {
  const { data: session } = useSession();
  const {
    setValue,
    watch,
    formState: { isSubmitting },
  } = useFormContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [avatarMsg, setAvatarMsg] = useState<{ type: "error" | "success"; text: string } | null>(
    null,
  );
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);

  const avatarFile = watch("avatarFile");
  const avatarDeleted = watch("avatarDeleted");
  const [derivedUrl, setDerivedUrl] = useState<string | null>(null);

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isProcessingCrop, setIsProcessingCrop] = useState(false);

  // 1. Close overlay if user clicks outside of the avatar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowMobileActions(false);
      }
    };

    if (showMobileActions) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showMobileActions]);

  // 2. Close overlay when form starts submitting
  useEffect(() => {
    if (isSubmitting) {
      setShowMobileActions(false);
    }
  }, [isSubmitting]);

  // Handle URL creation for previews
  useEffect(() => {
    if (avatarFile instanceof File) {
      const url = URL.createObjectURL(avatarFile);
      setDerivedUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setDerivedUrl(null);
    }
  }, [avatarFile]);

  useEffect(() => {
    if (!isViewerOpen) {
      setRawImageSrc(null);
      setZoom(1);
    }
  }, [isViewerOpen]);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleRemoveAvatar = () => {
    setValue("avatarFile", null, { shouldDirty: true });
    setValue("avatarDeleted", true, { shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsViewerOpen(false);
    setShowMobileActions(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;

    if (originalFile.size > 5 * 1024 * 1024) {
      setAvatarMsg({
        type: "error",
        text: "File exceeds 5MB limit. Please choose a smaller image.",
      });
      return;
    }

    setAvatarMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setIsViewerOpen(true);
    };
    reader.readAsDataURL(originalFile);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const confirmCrop = async () => {
    if (!rawImageSrc || !croppedAreaPixels) return;
    setIsProcessingCrop(true);
    try {
      const croppedFile = await getCroppedImg(rawImageSrc, croppedAreaPixels);
      if (croppedFile) {
        setValue("avatarFile", croppedFile, { shouldDirty: true });
        setValue("avatarDeleted", false, { shouldDirty: true });
        setIsViewerOpen(false);
        setShowMobileActions(false);
      }
    } catch (e) {
      console.error(e);
      setAvatarMsg({ type: "error", text: "Failed to crop image." });
    } finally {
      setIsProcessingCrop(false);
    }
  };

  const displayImage = derivedUrl || (!avatarDeleted ? session?.user?.image : undefined);

  return (
    <div className="flex flex-col items-center gap-4 shrink-0">
      {avatarMsg && (
        <div
          className={`p-2.5 text-xs text-center rounded-md border font-medium w-full ${
            avatarMsg.type === "success"
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-destructive/15 text-destructive border-destructive/20"
          }`}
        >
          {avatarMsg.text}
        </div>
      )}

      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <div
          ref={containerRef}
          className={`relative group size-28 rounded-full overflow-hidden ring-2 transition-all will-change-transform transform-gpu cursor-pointer ${
            avatarFile || avatarDeleted ? "ring-primary" : "ring-border/50 hover:ring-primary"
          }`}
          onClick={() => {
            // Toggle the menu on mobile, or just open file picker if no image exists
            if (!displayImage) {
              handleAvatarClick();
            } else {
              setShowMobileActions(!showMobileActions);
            }
          }}
        >
          <Avatar className="size-full pointer-events-none">
            <AvatarImage src={displayImage || undefined} alt="Avatar" className="object-cover" />
            <AvatarFallback className="bg-muted text-2xl font-medium text-foreground">
              {session?.user?.name?.charAt(0)?.toUpperCase() || (
                <User className="h-10 w-10 text-muted-foreground" />
              )}
            </AvatarFallback>
          </Avatar>

          {/* Submitting Overlay */}
          {isSubmitting && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-full">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}

          {/* Action Overlay - FIX: Uses pointer-events-none to prevent phantom clicks when hidden */}
          {!isSubmitting && (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-200 rounded-full ${
                showMobileActions
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto"
              }`}
            >
              {displayImage ? (
                <div className="flex gap-2">
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
                    >
                      <ImageIcon className="size-4 text-white" />
                    </button>
                  </DialogTrigger>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAvatarClick();
                    }}
                    className="p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
                  >
                    <Camera className="size-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveAvatar();
                    }}
                    className="p-2 bg-destructive/80 rounded-full hover:bg-destructive transition-colors"
                  >
                    <Trash2 className="size-4 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAvatarClick();
                  }}
                  className="h-full w-full flex items-center justify-center"
                >
                  <Camera className="size-8 text-white/80" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Enlarged Viewer / Cropper Modal */}
        <DialogContent className="sm:max-w-md flex flex-col items-center gap-6">
          <DialogHeader className="w-full text-center">
            <DialogTitle>{rawImageSrc ? "Adjust Avatar" : "Profile Picture"}</DialogTitle>
          </DialogHeader>

          {rawImageSrc ? (
            <div className="w-full flex flex-col gap-4">
              <div className="relative w-full h-64 sm:h-72 bg-black rounded-lg overflow-hidden ring-1 ring-border/50">
                <Cropper
                  image={rawImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>
              <div className="flex items-center gap-3 w-full px-2">
                <ImageIcon className="size-4 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <ImageIcon className="size-5 text-muted-foreground shrink-0" />
              </div>
              <div className="flex w-full gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRawImageSrc(null)}
                  disabled={isProcessingCrop}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={confirmCrop} disabled={isProcessingCrop}>
                  {isProcessingCrop ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Crop className="size-4 mr-2" />
                  )}
                  Crop & Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Avatar className="size-64 ring-4 ring-border/50 shadow-2xl">
                <AvatarImage src={displayImage || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-6xl font-medium">
                  {session?.user?.name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex w-full gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsViewerOpen(false);
                    handleAvatarClick();
                  }}
                >
                  <ImageIcon className="size-4 mr-2" /> Change
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    setIsViewerOpen(false);
                    handleRemoveAvatar();
                  }}
                >
                  <Trash2 className="size-4 mr-2" /> Remove
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleAvatarChange}
      />
      <p className="text-[11px] text-muted-foreground text-center uppercase tracking-wider">
        JPEG, PNG, WebP
        <br />
        Max 5MB
      </p>
    </div>
  );
}
