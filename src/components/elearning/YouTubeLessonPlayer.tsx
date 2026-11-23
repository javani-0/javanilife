import { useEffect, useRef, useState } from "react";

// Minimal typing of the YouTube IFrame Player API we use.
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLIFrameElement,
    options: { events: { onReady?: () => void; onStateChange?: (event: { data: number }) => void; onError?: () => void } },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once, only on the lesson page. */
const loadYouTubeApi = (): Promise<YTNamespace> => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube player failed to load"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
};

interface YouTubeLessonPlayerProps {
  /** youtube-nocookie.com embed URL with enablejsapi=1 (from videoEmbedUrlFromLink). */
  embedUrl: string;
  lessonId: string;
  title: string;
  startAt: number;
  onProgress: (lessonId: string, seconds: number, duration: number) => void;
  onFlush: (lessonId: string, seconds: number, duration: number) => void;
  onEnded: (lessonId: string) => void;
}

const SAVE_EVERY_SEC = 10;
const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_PAUSED = 2;

/** Lesson player for YouTube links, with the same resume / progress callbacks as the Vimeo player. */
const YouTubeLessonPlayer = ({ embedUrl, lessonId, title, startAt, onProgress, onFlush, onEnded }: YouTubeLessonPlayerProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const handlers = useRef({ onProgress, onFlush, onEnded });
  handlers.current = { onProgress, onFlush, onEnded };
  const startRef = useRef(startAt);
  startRef.current = startAt;

  // The API needs the page origin on the embed URL to talk to the iframe.
  const src = `${embedUrl}&origin=${encodeURIComponent(window.location.origin)}`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const id = lessonId;
    let player: YTPlayer | null = null;
    let alive = true;
    let timer: number | undefined;
    let last = { seconds: 0, duration: 0 };
    let lastSaved = 0;
    setFailed(false);

    const read = () => {
      if (!player) return;
      try {
        last = { seconds: player.getCurrentTime() || 0, duration: player.getDuration() || 0 };
      } catch { /* player not ready */ }
    };
    const flush = () => {
      read();
      if (last.duration > 0) handlers.current.onFlush(id, last.seconds, last.duration);
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const stopTimer = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };

    loadYouTubeApi()
      .then((YT) => {
        if (!alive) return;
        player = new YT.Player(iframe, {
          events: {
            onReady: () => {
              try {
                const duration = player!.getDuration();
                const start = startRef.current;
                if (start > 5 && (!duration || start < duration - 10)) player!.seekTo(start, true);
              } catch { /* resume is best-effort */ }
            },
            onStateChange: ({ data }) => {
              if (data === STATE_PLAYING) {
                stopTimer();
                timer = window.setInterval(() => {
                  read();
                  if (last.duration > 0 && Math.abs(last.seconds - lastSaved) >= SAVE_EVERY_SEC) {
                    lastSaved = last.seconds;
                    handlers.current.onProgress(id, last.seconds, last.duration);
                  }
                }, 1000);
              } else if (data === STATE_PAUSED) {
                stopTimer();
                flush();
                lastSaved = last.seconds;
              } else if (data === STATE_ENDED) {
                stopTimer();
                read();
                last = { seconds: last.duration, duration: last.duration };
                if (last.duration > 0) handlers.current.onFlush(id, last.seconds, last.duration);
                handlers.current.onEnded(id);
              }
            },
            onError: () => alive && setFailed(true),
          },
        });
      })
      .catch(() => alive && setFailed(true));

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive = false;
      stopTimer();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
      // Not destroy(): it removes the iframe, which React owns.
    };
  }, [embedUrl, lessonId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <iframe
        key={`${lessonId}:${embedUrl}`}
        ref={iframeRef}
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
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

export default YouTubeLessonPlayer;
