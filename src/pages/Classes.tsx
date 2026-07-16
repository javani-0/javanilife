import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, GraduationCap, Search, Users } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import { classOffersMonthly, classOffersTerm, getAutopayFeeLabel, getClassFeeLabel, getTermPayFullOfferLabel, hasAutopayDiscount, hasTermPayFullOffer, isClassEnrollable, subscribeToActiveClasses, type ClassDoc } from "@/lib/classes";

// Payment options shown on the preview card (req) so parents know what's
// available (Autopay / Pay Now / Pay Full / EMI) before opening the class.
const paymentOptionChips = (classDoc: ClassDoc): string[] => {
  const chips: string[] = [];
  if (classOffersMonthly(classDoc)) {
    if (classDoc.payment?.autopay) chips.push("Autopay");
    chips.push("Pay Now"); // always available for monthly classes
  }
  if (classOffersTerm(classDoc)) {
    if (classDoc.payment?.full) chips.push("Pay Full");
    if (classDoc.payment?.emi) chips.push("EMI");
  }
  return chips;
};
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";

const fieldControlClass = "h-10 sm:h-12 w-full rounded-md border border-gold/20 bg-card px-4 font-body text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-gold focus:ring-2 focus:ring-gold/20";

const SkeletonCard = () => (
  <div className="bg-card shadow-card rounded-lg overflow-hidden">
    <div className="aspect-square skeleton-shimmer" />
    <div className="p-5 space-y-3">
      <div className="h-6 w-3/4 skeleton-shimmer rounded" />
      <div className="h-4 w-full skeleton-shimmer rounded" />
      <div className="h-10 w-40 skeleton-shimmer rounded" />
    </div>
  </div>
);

const ClassCard = ({ classDoc }: { classDoc: ClassDoc }) => {
  const navigate = useNavigate();
  const openEnrol = () => navigate(`/classes/${classDoc.id}`);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEnrol(); }
  };
  return (
  <div role="link" tabIndex={0} onClick={openEnrol} onKeyDown={handleKeyDown} className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-gold/15 bg-card shadow-[0_10px_28px_rgba(51,35,20,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/40 hover:shadow-[0_14px_38px_rgba(51,35,20,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
    <div className="relative aspect-square overflow-hidden bg-muted">
      {classDoc.image ? (
        <img src={classDoc.image} alt={classDoc.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gold/10 to-primary/10">
          <GraduationCap className="h-12 w-12 text-gold/50" />
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-start justify-end p-2.5 sm:p-3">
        <ShareButton
          title={classDoc.name}
          text={`Check out *${classDoc.name}* at Javani Spiritual Hub — *${getClassFeeLabel(classDoc)}*`}
          url={`/classes/${classDoc.id}`}
          imageUrl={classDoc.image}
          className="h-8 w-8 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
        />
      </div>
    </div>
    <div className="flex flex-1 flex-col p-5">
      <h3 className="font-display text-[1.1rem] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">{classDoc.name}</h3>
      {classDoc.description && <p className="mt-2 line-clamp-2 font-body text-[0.82rem] leading-relaxed text-muted-foreground">{classDoc.description}</p>}
      <div className="mt-3 space-y-1.5 font-body text-[0.78rem] text-muted-foreground">
        {classDoc.schedule && <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-gold" /> {classDoc.schedule}</p>}
        {classDoc.ageGroup && <p className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-gold" /> {classDoc.ageGroup}</p>}
      </div>
      <p className="mt-3 font-display text-[1.2rem] font-bold text-primary">{getClassFeeLabel(classDoc)}</p>
      {/* Available payment options (req) — visible right on the preview */}
      {paymentOptionChips(classDoc).length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {paymentOptionChips(classDoc).map((chip) => (
            <span key={chip} className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-body text-[0.66rem] font-semibold text-gold">{chip}</span>
          ))}
        </div>
      )}
      {hasAutopayDiscount(classDoc) && (
        <p className="mt-1 flex items-center gap-1 font-body text-[0.78rem] text-green-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          Autopay: <span className="font-semibold">{getAutopayFeeLabel(classDoc)}</span>
        </p>
      )}
      {hasTermPayFullOffer(classDoc) && (
        <p className="mt-1 flex items-center gap-1 font-body text-[0.78rem] font-semibold text-green-700">
          🎁 {getTermPayFullOfferLabel(classDoc)}
        </p>
      )}
      <div className="mt-auto pt-4">
        <Link
          to={`/classes/${classDoc.id}`}
          onClick={(event) => event.stopPropagation()}
          className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-3 py-2.5 font-body text-[0.85rem] font-semibold text-primary-foreground transition-all hover:brightness-110"
        >
          <GraduationCap className="h-4 w-4" /> Enrol Now
        </Link>
      </div>
    </div>
  </div>
  );
};

const Classes = () => {
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => subscribeToActiveClasses(
    (items) => { setClasses(items); setLoading(false); },
    () => setLoading(false),
  ), []);

  const visibleClasses = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return classes
      .filter(isClassEnrollable)
      .filter((classDoc) => !normalizedSearch || [classDoc.name, classDoc.description, classDoc.facultyName, classDoc.ageGroup, classDoc.schedule]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, searchTerm]);

  return (
    <>
      <SEO
        title="Classes | Monthly Fee Classes & Autopay | Javani Spiritual Hub"
        description="Enrol your child in our monthly classical arts classes. Pay monthly fees online with autopay, get reminders, and track payment history."
      />
      <main>
        <PageHero
          backgroundImages={[heroDancer1, heroDancer2, heroDancer3]}
          label="OUR CLASSES"
          heading="Monthly Classes"
          subtext="Enrol once, pay monthly. Autopay or pay manually — with reminders and a clear payment history."
          size="compact"
        />

        <div className="relative z-30 border-b border-gold/10 bg-background py-3 shadow-[0_10px_30px_rgba(51,35,20,0.08)] sm:sticky sm:top-[80px] sm:py-4">
          <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6">
            <label className="relative block w-full sm:w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className={`${fieldControlClass} pl-10`} placeholder="Search classes" />
            </label>
          </div>
        </div>

        <section className="py-10 sm:py-14 md:py-16 bg-background">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
                {[0, 1, 2].map((item) => <SkeletonCard key={item} />)}
              </div>
            ) : visibleClasses.length === 0 ? (
              <div className="py-16 text-center">
                <GraduationCap className="mx-auto mb-4 h-12 w-12 text-gold/60" />
                <p className="font-display text-xl text-muted-foreground">No classes available right now.</p>
                <p className="mt-1 font-body text-sm text-muted-foreground">Please check back soon or contact us for enrolment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
                {visibleClasses.map((classDoc) => <ClassCard key={classDoc.id} classDoc={classDoc} />)}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default Classes;
