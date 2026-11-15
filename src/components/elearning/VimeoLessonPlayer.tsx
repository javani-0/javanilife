import { useEffect, useRef, useState } from "react";
import type Player from "@vimeo/player";

interface VimeoLessonPlayerProps {
  /** player.vimeo.com embed URL (from vimeoEmbedUrlFromLink). */
  embedUrl: string;
  /** The lesson these callbacks report for (kept per player, so a late flush never lands on the next lesson). */
  lessonId: string;
  title: string;
  /** Resume point in seconds. */
  startAt: number;
  /** Throttled position updates while playing (seconds, duration). */
  onProgress: (lessonId: string, seconds: number, duration: number) => void;
  /** Pause, seek end or unmount: save now. */
  onFlush: (lessonId: string, seconds: number, duration: number) => void;
  onEnded: (lessonId: string) => void;
}

const SAVE_EVERY_SEC = 10;

/** Lesson player. @vimeo/player is loaded on demand so it never ships with the public pages. */
const VimeoLessonPlayer = ({ embedUrl, lessonId, title, startAt, onProgress, onFlush, onEnded }: VimeoLessonPlayerProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  // Latest callbacks without re-creating the player.
  const handlers = useRef({ onProgress, onFlush, onEnded });
  handlers.current = { onProgress, onFlush, onEnded };
  const startRef = useRef(startAt);
  startRef.current = startAt;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const id = lessonId;
    let player: Player | null = null;
    let alive = true;
    let last = { seconds: 0, duration: 0 };
    let lastSaved = 0;
    setFailed(false);

    const flush = () => {
      if (last.duration > 0) handlers.current.onFlush(id, last.seconds, last.duration);
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };

    void import("@vimeo/player")
      .then(({ default: VimeoPlayer }) => {
        if (!alive) return;
        player = new VimeoPlayer(iframe);
        player.on("loaded", async () => {
          try {
            const duration = await player!.getDuration();
            const start = startRef.current;
            // Resume unless the lesson was nearly finished last time.
            if (start > 5 && start < duration - 10) await player!.setCurrentTime(start);
          } catch { /* resume is best-effort */ }
        });
        player.on("timeupdate", ({ seconds, duration }: { seconds: number; duration: number }) => {
          last = { seconds, duration };
          if (Math.abs(seconds - lastSaved) >= SAVE_EVERY_SEC) {
            lastSaved = seconds;
            handlers.current.onProgress(id, seconds, duration);
          }
        });
        player.on("pause", ({ seconds, duration }: { seconds: number; duration: number }) => {
          last = { seconds, duration };
          lastSaved = seconds;
          flush();
        });
        player.on("ended", ({ duration }: { duration: number }) => {
          last = { seconds: duration, duration };
          flush();
          handlers.current.onEnded(id);
        });
        player.on("error", () => alive && setFailed(true));
      })
      .catch(() => alive && setFailed(true));

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
      // Not destroy(): it removes the iframe, which React owns.
      if (player) for (const event of ["loaded", "timeupdate", "pause", "ended", "error"] as const) player.off(event);
    };
  }, [embedUrl, lessonId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <iframe
        key={`${lessonId}:${embedUrl}`}
        ref={iframeRef}
        src={embedUrl}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
      {failed && (
        <p className="absolute inset-x-0 bottom-0 bg-black/80 px-4 py-2 text-center font-body text-xs text-white">
          The video player had a problem. Please refresh the page.
        </p>
      )}
    </div>
  );
};

export default VimeoLessonPlayer;
