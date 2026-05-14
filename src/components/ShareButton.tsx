import { Share2 } from "lucide-react";
import { createShareUrl } from "@/lib/shareLinks";

interface ShareButtonProps {
  title: string;
  text: string;
  /** relative path, e.g. /products/abc123 */
  url: string;
  /** kept for existing product/course callers; previews come from URL metadata */
  imageUrl?: string;
  className?: string;
}

const ShareButton = ({ title, text, url, className = "" }: ShareButtonProps) => {
  const shareUrl = createShareUrl({ origin: window.location.origin, url });

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (navigator.share) {
      try {
        const shareData: ShareData = { 
          title, 
          text,
          url: shareUrl
        };

        await navigator.share(shareData);
      } catch {
        // user cancelled — do nothing
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      alert(`Link copied!\n${shareUrl}`);
    }
  };

  return (
    <button
      onClick={handleShare}
      className={`p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-gold flex-shrink-0 flex items-center justify-center ${className}`}
      aria-label="Share"
      title="Share"
    >
      <Share2 className="w-4 h-4" />
    </button>
  );
};

export default ShareButton;
