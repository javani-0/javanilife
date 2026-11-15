// Small building blocks shared by the E-Learning admin screens.
import { useId, useRef, useState, type ReactNode } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 focus:border-gold focus:ring-2 focus:ring-gold/25 disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/20";
export const labelClass = "mb-1 block font-body text-[0.8rem] font-medium text-foreground";
export const hintClass = "mt-1 font-body text-[0.75rem] leading-snug text-muted-foreground";
export const errorClass = "mt-1 font-body text-[0.75rem] font-medium leading-snug text-destructive";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 font-body text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";
export const iconButton =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:pointer-events-none disabled:opacity-35";

/** Label + control + hint/error, wired with ids for screen readers. */
export const Field = ({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : "";
  const errorId = error ? `${id}-error` : "";
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-primary" aria-hidden="true"> *</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? <p id={errorId} className={errorClass}>{error}</p> : null}
      {hint ? <p id={hintId} className={hintClass}>{hint}</p> : null}
    </div>
  );
};

/** Numbered editor section card. */
export const EditorSection = ({
  id,
  step,
  title,
  description,
  children,
  aside,
}: {
  id: string;
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) => (
  <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-6">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-body text-xs font-bold text-primary">{step}</span>
        <div>
          <h2 id={`${id}-title`} className="font-display text-xl font-semibold leading-tight text-foreground">{title}</h2>
          {description && <p className="mt-0.5 font-body text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {aside}
    </header>
    {children}
  </section>
);

export const StatusPill = ({ status }: { status: "draft" | "published" }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[0.72rem] font-semibold",
      status === "published" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-muted text-muted-foreground ring-1 ring-border",
    )}
  >
    <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", status === "published" ? "bg-emerald-600" : "bg-muted-foreground/60")} />
    {status === "published" ? "Published" : "Draft"}
  </span>
);

/** 16:9 Vimeo player iframe (embed URL already built). */
export const VimeoFrame = ({ src, title }: { src: string; title: string }) => (
  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-charcoal">
    <iframe
      src={src}
      title={title}
      className="absolute inset-0 h-full w-full"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  </div>
);

const uploadToCloudinary = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) throw new Error("No URL returned");
  return data.secure_url as string;
};

/** Image picker that uploads to Cloudinary (same preset as the other admin pages). */
export const ImageUploadField = ({
  label,
  hint,
  value,
  onChange,
  square = false,
  onBusyChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  /** Crop to 1:1 before upload (instructor photo). Otherwise uploaded as-is. */
  square?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const id = useId();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file", variant: "destructive" });
      return;
    }
    const ready = square ? await openSquareCropper(file) : file;
    if (!ready) return;
    setUploading(true);
    onBusyChange?.(true);
    try {
      onChange(await uploadToCloudinary(ready));
    } catch (error) {
      console.error("E-Learning image upload failed", error);
      toast({ title: "Upload failed", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div>
      <span className={labelClass} id={`${id}-label`}>{label}</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-ivory/60",
            square ? "h-24 w-24" : "aspect-video w-full sm:w-56",
          )}
        >
          {value ? (
            <img src={value} alt={`${label} preview`} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground/70" aria-hidden="true" />
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-card/70">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={cn(secondaryButton, "px-3 py-2")} aria-describedby={`${id}-label`}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
            </button>
            {value && !uploading && (
              <button type="button" onClick={() => onChange("")} className={cn(secondaryButton, "px-3 py-2 text-muted-foreground")}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void handleFile(file);
            }}
          />
          <label htmlFor={`${id}-url`} className="sr-only">{label} URL</label>
          <input id={`${id}-url`} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Or paste an image URL" className={inputClass} />
          {hint && <p className={hintClass}>{hint}</p>}
        </div>
      </div>
    </div>
  );
};
