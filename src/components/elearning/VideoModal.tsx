import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { vimeoEmbedUrlFromLink } from "@/lib/elearning";

interface VideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A Vimeo link (public trailer or free preview lesson). */
  vimeoUrl: string;
  subtitle?: string;
}

/** Trailer / free-preview player. A plain iframe so public pages stay light (no player SDK). */
const VideoModal = ({ open, onOpenChange, title, vimeoUrl, subtitle }: VideoModalProps) => {
  const embed = vimeoEmbedUrlFromLink(vimeoUrl);
  const src = embed ? `${embed}&autoplay=1` : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl gap-0 overflow-hidden rounded-xl border-gold/20 bg-charcoal p-0 text-ivory sm:rounded-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:bg-black/50 [&>button]:p-1.5 [&>button]:text-white [&>button]:opacity-100">
        <div className="px-5 pb-3 pt-4 pr-14">
          <DialogTitle className="font-display text-lg font-semibold leading-snug text-ivory sm:text-xl">{title}</DialogTitle>
          <DialogDescription className="font-body text-xs text-ivory/75">{subtitle || "Preview"}</DialogDescription>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {open && src ? (
            <iframe
              src={src}
              title={title}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <p className="absolute inset-0 grid place-items-center font-body text-sm text-ivory/75">This video is not available right now.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoModal;
