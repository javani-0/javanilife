import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CalendarDays, CheckCircle2, GraduationCap, Loader2, Maximize2, Users } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import ImageViewer from "@/components/ImageViewer";
import { useToast } from "@/hooks/use-toast";
import {
  classOffersTerm,
  getClass,
  getClassFeeLabel,
  type ClassDoc,
  type ClassTimeSlot,
} from "@/lib/classes";
import { createEnrollmentRequest } from "@/lib/students";
import heroTemple from "@/assets/hero-temple.jpg";

// ---------------------------------------------------------------------------
// Public class enrolment is now a LEAD form (req 1): the visitor submits their
// details and we create an enrolment request the admin picks up in the Student
// Manager "Enrolls" tab. No login, no payment here — the admin drives payment
// via the onboarding link after adding the student.
// ---------------------------------------------------------------------------

const seatsLeft = (slot: ClassTimeSlot): number | null => (
  slot.seatsTotal != null ? Math.max(0, slot.seatsTotal - (slot.seatsTaken || 0)) : null
);

const enrollSchema = z.object({
  studentName: z.string().trim().min(2, "Student name is required"),
  studentAge: z.coerce.number({ invalid_type_error: "Enter a valid age" }).int().min(2, "Enter a valid age").max(100, "Enter a valid age"),
  studentGender: z.enum(["male", "female", "other"], { errorMap: () => ({ message: "Select a gender" }) }),
  parentName: z.string().trim().min(2, "Parent name is required"),
  parentPhone: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit phone number"),
  parentWhatsapp: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit number").or(z.literal("")).optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  parentAddress: z.string().trim().min(5, "Address is required"),
});

type EnrollFormValues = z.infer<typeof enrollSchema>;

const inputClass = "w-full px-3 py-2.5 rounded-md border border-border font-body text-[0.9rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.85rem] font-medium text-foreground block mb-1.5";
const errorClass = "mt-1 font-body text-[0.75rem] text-destructive";

const ClassDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<EnrollFormValues>({
    resolver: zodResolver(enrollSchema),
    defaultValues: { studentGender: "male" },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) { setNotFound(true); setLoading(false); return; }
      setLoading(true);
      try {
        const doc = await getClass(id);
        if (cancelled) return;
        if (!doc || !doc.active) { setNotFound(true); }
        else setClassDoc(doc);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const slots = useMemo(() => classDoc?.timeSlots || [], [classDoc]);
  const isTerm = classDoc ? classOffersTerm(classDoc) && !classDoc.offersMonthly : false;

  const onSubmit = async (values: EnrollFormValues) => {
    if (!classDoc) return;
    if (slots.length > 0 && !selectedSlotId) {
      toast({ title: "Please choose a time slot", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const slot = slots.find((item) => item.id === selectedSlotId);
      await createEnrollmentRequest({
        studentName: values.studentName,
        age: values.studentAge,
        gender: values.studentGender,
        parentName: values.parentName,
        phone: values.parentPhone,
        whatsapp: values.parentWhatsapp || values.parentPhone,
        email: values.email || "",
        address: values.parentAddress,
        classId: classDoc.id,
        className: classDoc.name,
        slotId: slot?.id,
        slotLabel: slot?.label,
      });
      setSubmitted(true);
    } catch (error) {
      toast({ title: "Could not submit", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  if (notFound || !classDoc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <GraduationCap className="h-12 w-12 text-gold/60" />
        <h1 className="font-display text-2xl text-foreground">Class not found</h1>
        <p className="font-body text-sm text-muted-foreground">This class may be inactive or no longer available.</p>
        <Link to="/classes" className="rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Browse classes</Link>
      </div>
    );
  }

  return (
    <>
      <SEO title={`Enrol — ${classDoc.name} | Javani Spiritual Hub`} description={classDoc.description || `Enrol in ${classDoc.name} at Javani Spiritual Hub.`} />
      <main>
        <PageHero backgroundImages={[heroTemple]} label="ENROLMENT" heading={classDoc.name} subtext={getClassFeeLabel(classDoc)} size="compact" breadcrumb={[{ label: "Home", path: "/" }, { label: "Classes", path: "/classes" }, { label: "Enrol" }]} />

        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <Link to="/classes" className="mb-6 inline-flex items-center gap-2 rounded-sm border border-gold/40 bg-card px-4 py-2 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to classes
          </Link>

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Enrol lead form */}
            <div className="min-w-0 rounded-2xl border border-gold/15 bg-card p-5 shadow-card sm:p-6">
              {submitted ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100"><CheckCircle2 className="h-9 w-9 text-green-600" /></div>
                  <h2 className="mt-4 font-display text-2xl text-foreground">Enrolment request sent! 🎉</h2>
                  <p className="mt-2 max-w-md font-body text-sm text-muted-foreground">
                    Thank you for your interest in <span className="font-semibold text-foreground">{classDoc.name}</span>. Our team will reach out shortly to confirm your admission and share the payment details.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Link to="/classes" className="rounded-sm border border-gold/40 bg-card px-5 py-2.5 font-body text-sm font-semibold text-gold hover:bg-gold hover:text-white">Browse more classes</Link>
                    <Link to="/" className="rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Back to home</Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)}>
                  <h2 className="font-display text-2xl text-foreground">Student &amp; Parent Details</h2>
                  <p className="mt-1 font-body text-sm text-muted-foreground">Fill this in and we'll get in touch to complete your admission.</p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Student Name *</label>
                      <input className={inputClass} {...register("studentName")} />
                      {errors.studentName && <p className={errorClass}>{errors.studentName.message}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Age *</label>
                      <input className={inputClass} inputMode="numeric" {...register("studentAge")} />
                      {errors.studentAge && <p className={errorClass}>{errors.studentAge.message}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Gender *</label>
                      <select className={inputClass} {...register("studentGender")}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                      {errors.studentGender && <p className={errorClass}>{errors.studentGender.message}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Parent / Guardian Name *</label>
                      <input className={inputClass} {...register("parentName")} />
                      {errors.parentName && <p className={errorClass}>{errors.parentName.message}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Phone Number *</label>
                      <input className={inputClass} inputMode="numeric" placeholder="10-digit number" {...register("parentPhone")} />
                      {errors.parentPhone && <p className={errorClass}>{errors.parentPhone.message}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>WhatsApp Number</label>
                      <input className={inputClass} inputMode="numeric" placeholder="If different from phone" {...register("parentWhatsapp")} />
                      {errors.parentWhatsapp && <p className={errorClass}>{errors.parentWhatsapp.message}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Email <span className="font-normal text-muted-foreground">(optional)</span></label>
                      <input className={inputClass} type="email" placeholder="you@email.com" {...register("email")} />
                      {errors.email && <p className={errorClass}>{errors.email.message}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Address *</label>
                      <textarea className={inputClass} rows={2} {...register("parentAddress")} />
                      {errors.parentAddress && <p className={errorClass}>{errors.parentAddress.message}</p>}
                    </div>
                  </div>

                  {/* Time slot selection */}
                  {slots.length > 0 && (
                    <>
                      <h3 className="mt-7 font-display text-lg text-foreground">Choose a time slot</h3>
                      <p className="mt-1 font-body text-[0.8rem] text-muted-foreground">Pick the batch you'd like to join.</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {slots.map((slot) => {
                          const left = seatsLeft(slot);
                          const full = left !== null && left <= 0;
                          const active = selectedSlotId === slot.id;
                          const [dayPart, timePart] = (slot.label || "").split(" · ");
                          return (
                            <button
                              type="button"
                              key={slot.id}
                              disabled={full}
                              onClick={() => setSelectedSlotId(slot.id)}
                              className={`relative flex min-h-[5.5rem] flex-col justify-between gap-3 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-gold bg-gold/10 ring-1 ring-gold" : "border-border hover:border-gold/50 hover:bg-gold/5"}`}
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${active ? "bg-gold text-white" : "bg-gold/15 text-gold"}`}><CalendarDays className="h-4 w-4" /></span>
                                <span className={`rounded-full px-2 py-0.5 font-body text-[0.68rem] font-semibold ${full ? "bg-red-100 text-red-700" : left === null ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700"}`}>
                                  {left === null ? "Open" : full ? "Full" : `${left} seat${left === 1 ? "" : "s"} left`}
                                </span>
                              </span>
                              <span className="block">
                                <span className="block font-body text-[0.92rem] font-semibold leading-snug text-foreground">{dayPart || "Slot"}</span>
                                {timePart && <span className="mt-0.5 block font-body text-[0.8rem] text-muted-foreground">{timePart}</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <button type="submit" disabled={submitting} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-gradient-primary px-4 py-3 font-body text-[0.9rem] font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Enrol Now"}
                  </button>
                  <p className="mt-2 text-center font-body text-[0.72rem] text-muted-foreground">No payment now — we'll contact you to confirm your admission and share the payment details.</p>
                </form>
              )}
            </div>

            {/* Class summary */}
            <aside className="h-fit min-w-0 rounded-2xl border border-gold/15 bg-card p-5 shadow-card lg:sticky lg:top-28">
              {classDoc.image && (
                <div className="group relative mb-4 cursor-zoom-in overflow-hidden rounded-lg" onClick={() => setViewerOpen(true)}>
                  <img src={classDoc.image} alt={classDoc.name} className="aspect-square w-full object-cover" />
                  <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-body text-[0.7rem] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" /> View full
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-xl text-foreground">{classDoc.name}</h3>
                <ShareButton
                  title={classDoc.name}
                  text={`Check out *${classDoc.name}* at Javani Spiritual Hub — *${getClassFeeLabel(classDoc)}*`}
                  url={`/classes/${classDoc.id}`}
                  imageUrl={classDoc.image}
                />
              </div>
              {classDoc.description && <p className="mt-2 font-body text-sm text-muted-foreground">{classDoc.description}</p>}
              <div className="mt-4 space-y-2 font-body text-sm text-muted-foreground">
                {classDoc.schedule && <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold" /> {classDoc.schedule}</p>}
                {classDoc.ageGroup && <p className="flex items-center gap-2"><Users className="h-4 w-4 text-gold" /> {classDoc.ageGroup}</p>}
                {classDoc.facultyName && <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-gold" /> Trainer: {classDoc.facultyName}</p>}
                {isTerm
                  ? <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold" /> {classDoc.startDate || "?"} → {classDoc.endDate || "?"}{classDoc.durationMonths ? ` · ${classDoc.durationMonths} mo` : ""}</p>
                  : <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold" /> Billed on day {classDoc.billingDayOfMonth} each month</p>}
              </div>
              <div className="mt-4 rounded-xl bg-gold/10 p-4">
                <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{isTerm ? "Course fee" : "Fee"}</p>
                <p className="font-display text-2xl font-bold text-primary">{getClassFeeLabel(classDoc)}</p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
      {classDoc.image && <ImageViewer images={[classDoc.image]} isOpen={viewerOpen} onClose={() => setViewerOpen(false)} />}
    </>
  );
};

export default ClassDetail;
