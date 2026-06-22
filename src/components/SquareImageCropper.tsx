import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Move, X, ZoomIn } from "lucide-react";

// ---------------------------------------------------------------------------
// Square (1:1) image cropper — dependency-free, canvas based.
// ---------------------------------------------------------------------------
// The platform stores only square images. Instead of rejecting a parent's or
// admin's non-square photo, we open a small pan/zoom crop tool and return a
// guaranteed 1:1 File. Call `openSquareCropper(file)` from any upload handler:
//
//   const square = await openSquareCropper(file);
//   if (!square) return;          // user cancelled
//   // ...upload `square` exactly as before
//
// The helper mounts the modal on demand (its own React root) and resolves with
// the cropped File, or null if cancelled / the image could not be read.
// ---------------------------------------------------------------------------

const VIEWPORT = 320;       // logical viewport square (px) used for the crop math
const MAX_OUTPUT = 1000;    // cap the exported square's side (Cloudinary re-optimises)
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface CropperProps {
  file: File;
  onDone: (result: File | null) => void;
}

const outputMime = (file: File): "image/png" | "image/jpeg" =>
  // Preserve transparency for PNG/WebP (e.g. partner logos); JPEG everything else.
  /image\/(png|webp)/i.test(file.type) ? "image/png" : "image/jpeg";

const SquareImageCropper = ({ file, onDone }: CropperProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // baseCover scale makes the shorter image side exactly fill the viewport.
  const baseCover = useRef(1);

  // Load the chosen file into an Image element.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      baseCover.current = VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight);
      setLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setError(true); URL.revokeObjectURL(url); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Largest offset that still keeps the image fully covering the viewport.
  const maxOffset = useCallback((scale: number) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (img.naturalWidth * scale - VIEWPORT) / 2),
      y: Math.max(0, (img.naturalHeight * scale - VIEWPORT) / 2),
    };
  }, []);

  const clampOffset = useCallback((next: { x: number; y: number }, scale: number) => {
    const max = maxOffset(scale);
    return { x: Math.max(-max.x, Math.min(max.x, next.x)), y: Math.max(-max.y, Math.min(max.y, next.y)) };
  }, [maxOffset]);

  // Render the current composition into the preview canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = baseCover.current * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (VIEWPORT - w) / 2 + offset.x;
    const y = (VIEWPORT - h) / 2 + offset.y;
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, w, h);
  }, [loaded, zoom, offset]);

  // Keep the offset valid whenever the zoom changes.
  useEffect(() => {
    if (loaded) setOffset((current) => clampOffset(current, baseCover.current * zoom));
  }, [zoom, loaded, clampOffset]);

  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setOffset(clampOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }, baseCover.current * zoom));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onWheel = (event: React.WheelEvent) => {
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z - event.deltaY * 0.0015)));
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    setExporting(true);
    try {
      const scale = baseCover.current * zoom;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (VIEWPORT - w) / 2 + offset.x;
      const y = (VIEWPORT - h) / 2 + offset.y;

      // Export at the captured source resolution (never upscaled past MAX_OUTPUT).
      const out = Math.round(Math.min(MAX_OUTPUT, Math.max(200, VIEWPORT / scale)));
      const ratio = out / VIEWPORT;
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) { onDone(null); return; }
      const mime = outputMime(file);
      if (mime === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, out, out); }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, x * ratio, y * ratio, w * ratio, h * ratio);

      canvas.toBlob((blob) => {
        if (!blob) { onDone(null); return; }
        const ext = mime === "image/png" ? "png" : "jpg";
        const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
        onDone(new File([blob], `${baseName}-square.${ext}`, { type: mime }));
      }, mime, 0.92);
    } catch {
      onDone(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={() => onDone(null)} />
      <div className="relative w-full max-w-sm rounded-xl bg-card p-5 shadow-hero">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg text-foreground">Crop to square</h3>
          <button onClick={() => onDone(null)} aria-label="Cancel" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {error ? (
          <p className="py-10 text-center font-body text-sm text-destructive">That image could not be read. Please choose another file.</p>
        ) : (
          <>
            <div
              className="relative mx-auto overflow-hidden rounded-lg border border-border bg-muted"
              style={{ width: VIEWPORT, height: VIEWPORT, maxWidth: "100%", touchAction: "none", cursor: dragRef.current ? "grabbing" : "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onWheel={onWheel}
            >
              {!loaded && <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>}
              <canvas ref={canvasRef} width={VIEWPORT} height={VIEWPORT} className="block h-full w-full" style={{ display: loaded ? "block" : "none" }} />
              {loaded && (
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-2">
                  <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-body text-[0.65rem] text-white"><Move className="h-3 w-3" /> Drag to position</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <ZoomIn className="h-4 w-4 text-muted-foreground" />
              <input
                type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                disabled={!loaded}
                className="h-2 flex-1 cursor-pointer accent-gold"
              />
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={() => onDone(null)} className="flex-1 rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleConfirm} disabled={!loaded || exporting} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Use image
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Open the square cropper for a single image file. Resolves with a guaranteed
 * 1:1 File, or null if the user cancelled / the file isn't a readable image.
 */
export const openSquareCropper = (file: File): Promise<File | null> => {
  if (!file || !file.type.startsWith("image/")) return Promise.resolve(null);

  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    const finish = (result: File | null) => {
      root.unmount();
      host.remove();
      resolve(result);
    };

    root.render(<SquareImageCropper file={file} onDone={finish} />);
  });
};

export default SquareImageCropper;
