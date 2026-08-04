import { useEffect, useState } from "react";
import { Award, Loader2, X } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { listMyCertificates, type Certificate } from "@/lib/portal/exams";

// ---------------------------------------------------------------------------
// Digital certificate VIEWING (req P4): "only view certificates upon successful
// course completion."
//
// Honest note: this is friction, not protection. There is no download button,
// the context menu is suppressed and the image is unselectable — but a
// screenshot or the browser's network tab defeats all of it. Treat it as
// discouraging casual sharing, not as DRM.
// ---------------------------------------------------------------------------

const Certificates = () => {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Certificate | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      try {
        const mine = await listMyCertificates(user.uid).catch(() => []);
        if (!cancelled) setCertificates(mine);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Escape closes the viewer.
  useEffect(() => {
    if (!viewing) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setViewing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  if (loading) {
    return (
      <AccountLayout title="Certificates" description="Certificates awarded on course completion.">
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title="Certificates" description="Certificates awarded on course completion.">
      {certificates.length === 0 ? (
        <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <Award className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No certificates yet</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Certificates appear here once you complete a course.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((certificate) => (
            <button
              key={certificate.id}
              type="button"
              onClick={() => setViewing(certificate)}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-card transition-colors hover:border-gold/50"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src={certificate.imageUrl}
                  alt={certificate.title}
                  className="h-full w-full select-none object-cover"
                  loading="lazy"
                  draggable={false}
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>
              <div className="p-3">
                <p className="truncate font-body text-sm font-semibold text-foreground">{certificate.title}</p>
                <p className="truncate font-body text-xs text-muted-foreground">{certificate.className}</p>
                <p className="mt-0.5 font-body text-[0.7rem] text-muted-foreground">
                  Issued {certificate.issuedOn}{certificate.certificateNumber ? ` · ${certificate.certificateNumber}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* View-only modal */}
      {viewing && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewing(null)}
        >
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative max-h-full w-full max-w-4xl overflow-auto" onClick={(event) => event.stopPropagation()}>
            <img
              src={viewing.imageUrl}
              alt={viewing.title}
              className="pointer-events-none w-full select-none rounded-lg"
              draggable={false}
              onContextMenu={(event) => event.preventDefault()}
            />
            <p className="mt-2 text-center font-body text-xs text-white/70">
              {viewing.title} · {viewing.className}
              {viewing.certificateNumber ? ` · ${viewing.certificateNumber}` : ""}
            </p>
            <p className="mt-1 text-center font-body text-[0.7rem] text-white/50">
              View only — contact the office for an official copy.
            </p>
          </div>
        </div>
      )}
    </AccountLayout>
  );
};

export default Certificates;
