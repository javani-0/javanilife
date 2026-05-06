import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import SectionLabel from "@/components/SectionLabel";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Clock, LogIn, LogOut, UserPlus, Eye, ShoppingBag, FileText } from "lucide-react";

const actionIcons: Record<string, any> = {
  login: LogIn,
  logout: LogOut,
  signup: UserPlus,
  "page-visit": Eye,
  "product-view": ShoppingBag,
  "enquiry-sent": FileText,
};

const actionLabels: Record<string, string> = {
  login: "Signed In",
  logout: "Signed Out",
  signup: "Account Created",
  "page-visit": "Page Visited",
  "product-view": "Product Viewed",
  "enquiry-sent": "Enquiry Sent",
};

const actionColors: Record<string, string> = {
  login: "bg-green-100 text-green-700",
  logout: "bg-orange-100 text-orange-700",
  signup: "bg-blue-100 text-blue-700",
  "page-visit": "bg-purple-100 text-purple-700",
  "product-view": "bg-gold/20 text-gold",
  "enquiry-sent": "bg-primary/10 text-primary",
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const History = () => {
  const { user, userProfile, loading, history } = useAuth();
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <SEO
        title="My Activity | Javani Spiritual Hub"
        description="View your activity history on Javani Spiritual Hub."
      />
      <main>
        {/* Hero */}
        <section className="relative pt-[120px] pb-16 sm:pb-20 bg-gradient-to-b from-charcoal to-charcoal/95">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
            <SectionLabel text="YOUR ACTIVITY" className="mb-4" />
            <h1 className="font-display font-semibold text-[2rem] sm:text-[2.5rem] md:text-[3rem] text-white mb-3">
              My History
            </h1>
            <p className="font-body font-light text-[0.95rem] sm:text-[1.05rem] text-white/60 max-w-xl mx-auto">
              Welcome back, <span className="text-gold font-medium">{userProfile?.username || user.displayName || "User"}</span>. Here's your activity timeline.
            </p>
          </div>
        </section>

        {/* History Timeline */}
        <section className="py-12 sm:py-16 md:py-20 bg-background">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div ref={headerRef} className={`mb-10 ${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
              <h2 className="font-display font-semibold text-[1.5rem] sm:text-[1.8rem] text-foreground">
                Activity Timeline ({history.length})
              </h2>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-16">
                <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="font-display text-lg text-muted-foreground">
                  No activity recorded yet.
                </p>
                <p className="font-body text-sm text-muted-foreground/60 mt-1">
                  Your activity history will appear here as you use the site.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

                <div className="space-y-4">
                  {history.map((entry) => {
                    const Icon = actionIcons[entry.action] || Clock;
                    const label = actionLabels[entry.action] || entry.action;
                    const color = actionColors[entry.action] || "bg-muted text-muted-foreground";

                    return (
                      <div key={entry.id} className="relative flex items-start gap-4 pl-12">
                        {/* Icon dot on timeline */}
                        <div className={`absolute left-2 top-1 w-7 h-7 rounded-full flex items-center justify-center ${color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>

                        {/* Card */}
                        <div className="flex-1 bg-card shadow-sm rounded-lg p-4 border border-border/50 hover:shadow-card transition-shadow">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <span className="font-display font-semibold text-[0.95rem] text-foreground">
                              {label}
                            </span>
                            <span className="font-body text-[0.75rem] text-muted-foreground whitespace-nowrap">
                              {formatDate(entry.timestamp)}
                            </span>
                          </div>
                          <p className="font-body text-[0.85rem] text-muted-foreground mt-1">
                            {entry.description}
                          </p>
                          {entry.meta && Object.keys(entry.meta).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {Object.entries(entry.meta).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="inline-block px-2 py-0.5 rounded-full bg-muted font-body text-[0.7rem] text-muted-foreground"
                                >
                                  {key}: {String(value)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default History;
