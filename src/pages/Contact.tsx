import { useState } from "react";
import { useContactInfo } from "@/hooks/useContactInfo";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import GoldDivider from "@/components/GoldDivider";
import PrimaryButton from "@/components/PrimaryButton";
import GoldOutlineButton from "@/components/GoldOutlineButton";
import SEO from "@/components/SEO";
import { Phone, Mail, MapPin, Clock, Instagram, Youtube, Facebook, MessageCircle, Check } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";
import heroTemple from "@/assets/hero-temple.jpg";

// Types and interfaces
const courseOptions = [
  "Kuchipudi grades (Long Term)", "Diploma in kuchipudi (Long Term)", "Diploma in nattuvangam (long term)", "Certification konnakol (short term)", "Daily yoga ",
  "TTT in yoga ", "Thevaram ( long term)", "Konnakol (Short term)", "Kuchipudi Repertoire (Short term)",
  "Nritta karanas (Long term )",
];
const experienceLevels = [
  { value: "beginner", label: "🌱 Complete Beginner" },
  { value: "some", label: "📖 Some Background" },
  { value: "intermediate", label: "🎭 Intermediate" },
  { value: "advanced", label: "⭐ Advanced" },
];
const batchOptions = ["Morning (6AM – 9AM)", "Afternoon (12PM – 1PM)", "Evening (5–8PM)", "Weekends Only", "Flexible"];
const heardFromOptions = ["Google Search", "Instagram", "YouTube", "Friend / Family", "WhatsApp", "Other"];
const enquiryForOptions = ["Myself", "My Child", "Someone Else"];
const genderOptions = ["Male", "Female", "Other", "Prefer not to say"];

interface FormData {
  name: string; phone: string; email: string; age: string; gender: string; location: string;
  course: string; experienceLevel: string; batchPreference: string[]; message: string;
  heardFrom: string; enquiryFor: string; consent: boolean;
}

const initialForm: FormData = {
  name: "", phone: "", email: "", age: "", gender: "", location: "",
  course: "", experienceLevel: "", batchPreference: [], message: "",
  heardFrom: "", enquiryFor: "", consent: false,
};

interface FieldErrors { [key: string]: string; }

const validateForm = (form: FormData): FieldErrors => {
  const errors: FieldErrors = {};
  if (form.name.trim().length < 2) errors.name = "Name must be at least 2 characters";
  if (form.name.trim().length > 80) errors.name = "Name must be less than 80 characters";
  const phoneClean = form.phone.replace(/[\s\-+]/g, "");
  if (!/^(91)?\d{10}$/.test(phoneClean)) errors.phone = "Enter a valid 10-digit Indian phone number";
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Enter a valid email";
  const age = parseInt(form.age);
  if (!form.age || isNaN(age) || age < 4 || age > 80) errors.age = "Age must be between 4 and 80";
  if (!form.gender) errors.gender = "Please select gender";
  if (form.location.trim().length < 2) errors.location = "Please enter your city";
  if (!form.course) errors.course = "Please select a course";
  if (!form.experienceLevel) errors.experienceLevel = "Please select your experience level";
  if (!form.consent) errors.consent = "You must agree to be contacted";
  if (form.message.length > 1000) errors.message = "Message must be less than 1000 characters";
  return errors;
};

const inputClass = (error?: string) =>
  `w-full border rounded-md px-3 sm:px-4 py-2.5 sm:py-3 font-body text-[0.9rem] sm:text-[1rem] text-foreground bg-card placeholder:text-muted-foreground/50 outline-none transition-all duration-200 ${
    error ? "border-destructive shadow-[0_0_0_3px_rgba(220,38,38,0.15)]" : "border-ivory-dark focus:border-gold focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)]"
  }`;

const selectClass = (error?: string) =>
  `w-full border rounded-md px-3 sm:px-4 py-2.5 sm:py-3 font-body text-[0.9rem] sm:text-[1rem] text-foreground bg-card outline-none transition-all duration-200 appearance-none cursor-pointer ${
    error ? "border-destructive shadow-[0_0_0_3px_rgba(220,38,38,0.15)]" : "border-ivory-dark focus:border-gold focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)]"
  }`;

const Contact = () => {
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const contactInfo = useContactInfo();
  const { ref: leftRef, isVisible: leftVisible } = useScrollAnimation();
  const { ref: rightRef, isVisible: rightVisible } = useScrollAnimation();

  const updateField = (field: keyof FormData, value: string | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const toggleBatch = (batch: string) => {
    setForm((prev) => ({
      ...prev,
      batchPreference: prev.batchPreference.includes(batch)
        ? prev.batchPreference.filter((b) => b !== batch)
        : [...prev.batchPreference, batch],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, "enquiries"), {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        age: parseInt(form.age), gender: form.gender, location: form.location.trim(),
        course: form.course, experienceLevel: form.experienceLevel,
        batchPreference: form.batchPreference, message: form.message.trim(),
        heardFrom: form.heardFrom, enquiryFor: form.enquiryFor,
        timestamp: serverTimestamp(), status: "new",
      });
      setSubmitted(true);
    } catch {
      toast({ title: "Something went wrong", description: "Please WhatsApp us directly.", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <SEO
        title="Enquire Now | Javani Spiritual Hub | Secunderabad"
        description="Submit a detailed enquiry to Javani Spiritual Hub. We offer free initial counselling and guide you to the perfect course for your age and experience level."
      />
      <main>
        <PageHero
          backgroundImages={[heroDancer3, heroTemple, heroDancer1]}
          label="CONTACT US"
          heading="Begin Your Journey With Us"
          subtext="Fill in your details and we'll guide you to the perfect course for your goals."
        />

        <section className="py-12 sm:py-16 md:py-24 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[40%_60%] gap-0 overflow-hidden rounded-xl shadow-hero">
            {/* Left Panel */}
            <div ref={leftRef} className={`bg-gradient-dark text-white p-8 sm:p-10 md:p-12 relative overflow-hidden ${leftVisible ? "animate-fade-left" : "opacity-0"}`}>
              <div className="relative z-10">
                <h2 className="font-accent text-[1.1rem] sm:text-[1.2rem] text-white mb-1">Javani</h2>
                <h3 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.2rem] text-white mb-4">Let's Connect</h3>
                <div className="w-10 h-0.5 bg-gold mb-6 sm:mb-8" />

                <div className="space-y-4 sm:space-y-5 mb-8 sm:mb-10">
                  {[
                    { icon: Phone, label: "Phone", value: contactInfo.phone },
                    { icon: Mail, label: "Email", value: contactInfo.email },
                    { icon: MapPin, label: "Location", value: contactInfo.address },
                    { icon: Clock, label: "Hours", value: contactInfo.hours },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 sm:gap-4">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-4 h-4 text-gold" />
                      </div>
                      <div>
                        <p className="font-body text-xs text-white/50 uppercase tracking-wider">{item.label}</p>
                        <p className="font-body font-light text-[0.85rem] sm:text-[0.95rem] text-white/90">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <a href={`https://wa.me/${contactInfo.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-md bg-[#25D366] text-white font-body font-medium text-[0.9rem] sm:text-[0.95rem] hover:bg-[#128C7E] transition-colors mb-6 sm:mb-8">
                  <MessageCircle className="w-5 h-5" /> Chat on WhatsApp Now
                </a>

                <div className="flex gap-3 mb-6 sm:mb-8">
                  {[Instagram, Youtube, Facebook].map((Icon, i) => (
                    <a key={i} href="#" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/30 flex items-center justify-center text-white/60 hover:bg-gold hover:border-gold hover:text-white transition-all duration-300">
                      <Icon className="w-4 h-4" />
                    </a>
                  ))}
                </div>

                {/* Google Maps */}
                <div className="w-full rounded-lg overflow-hidden">
                  <iframe 
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3805.7164016679676!2d78.53407287389398!3d17.47328278342863!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bcba1af70361a59%3A0x74322e57cc5eeb87!2sJavani%20Spiritual%20Hub!5e0!3m2!1sen!2sin!4v1772033320226!5m2!1sen!2sin" 
                    className="w-full h-48 sm:h-56 md:h-64"
                    style={{ border: 0 }}
                    allowFullScreen={true}
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
              <svg className="absolute -bottom-10 -right-10 w-40 h-40 sm:w-48 sm:h-48 text-white/[0.06]" viewBox="0 0 200 200" fill="currentColor">
                <path d="M100 20c0 40-30 60-30 80s30 40 30 60c0-20 30-40 30-60s-30-40-30-80z" />
                <path d="M100 20c-20 20-50 30-60 50s10 50 60 90c50-40 70-70 60-90s-40-30-60-50z" opacity="0.5" />
              </svg>
            </div>

            {/* Right Panel — Form */}
            <div ref={rightRef} className={`bg-card p-6 sm:p-8 md:p-12 ${rightVisible ? "animate-fade-right" : "opacity-0"}`}>
              {submitted ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto mb-6">
                    <Check className="w-8 h-8 sm:w-10 sm:h-10 text-[#25D366]" />
                  </div>
                  <h3 className="font-display font-semibold text-[1.6rem] sm:text-[2rem] text-primary mb-4">Enquiry Submitted Successfully!</h3>
                  <p className="font-body font-light text-[0.9rem] sm:text-[1rem] text-muted-foreground mb-8 max-w-md mx-auto">
                    Thank you, {form.name}! Our team will reach out to you within 24 hours on {form.phone}. In the meantime, feel free to WhatsApp us for a faster response.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                    <a href={`https://wa.me/${contactInfo.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-sm bg-[#25D366] text-white font-body font-medium hover:bg-[#128C7E] transition-colors">
                      <MessageCircle className="w-4 h-4" /> WhatsApp Us Now
                    </a>
                    <GoldOutlineButton onClick={() => window.location.href = "/courses"}>Browse Our Courses</GoldOutlineButton>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-display font-bold text-[1.5rem] sm:text-[1.8rem] md:text-[2rem] text-primary mb-2">Advanced Enquiry Form</h3>
                  <p className="font-body font-light text-[0.85rem] sm:text-[0.95rem] text-muted-foreground mb-4">Give us a few details so we can give you the best guidance.</p>
                  <GoldDivider className="mb-6 sm:mb-8 [&>div]:max-w-[60px]" />

                  <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
                    <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Full Name *</label>
                        <input type="text" placeholder="Your Full Name" maxLength={80} value={form.name} onChange={(e) => updateField("name", e.target.value)} className={inputClass(errors.name)} />
                        {errors.name && <p className="font-body text-xs text-destructive mt-1">{errors.name}</p>}
                      </div>
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Phone Number *</label>
                        <input type="tel" placeholder="+91 XXXXX XXXXX" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className={inputClass(errors.phone)} />
                        {errors.phone && <p className="font-body text-xs text-destructive mt-1">{errors.phone}</p>}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Email Address</label>
                        <input type="email" placeholder="your@email.com" maxLength={255} value={form.email} onChange={(e) => updateField("email", e.target.value)} className={inputClass(errors.email)} />
                        {errors.email && <p className="font-body text-xs text-destructive mt-1">{errors.email}</p>}
                      </div>
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Age *</label>
                        <input type="number" min={4} max={80} placeholder="Your age" value={form.age} onChange={(e) => updateField("age", e.target.value)} className={inputClass(errors.age)} />
                        {errors.age && <p className="font-body text-xs text-destructive mt-1">{errors.age}</p>}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Gender *</label>
                        <select value={form.gender} onChange={(e) => updateField("gender", e.target.value)} className={selectClass(errors.gender)}>
                          <option value="">Select gender</option>
                          {genderOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                        {errors.gender && <p className="font-body text-xs text-destructive mt-1">{errors.gender}</p>}
                      </div>
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Location / City *</label>
                        <input type="text" placeholder="Your city" maxLength={100} value={form.location} onChange={(e) => updateField("location", e.target.value)} className={inputClass(errors.location)} />
                        {errors.location && <p className="font-body text-xs text-destructive mt-1">{errors.location}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Course / Art Interested In *</label>
                      <select value={form.course} onChange={(e) => updateField("course", e.target.value)} className={selectClass(errors.course)}>
                        <option value="">Select a course</option>
                        {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {errors.course && <p className="font-body text-xs text-destructive mt-1">{errors.course}</p>}
                    </div>

                    <div>
                      <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-2 block">Experience Level *</label>
                      <div className="flex flex-wrap gap-2">
                        {experienceLevels.map((l) => (
                          <button key={l.value} type="button" onClick={() => updateField("experienceLevel", l.value)}
                            className={`px-3 sm:px-4 py-2 rounded-full font-body text-[0.8rem] sm:text-[0.85rem] transition-all duration-200 ${
                              form.experienceLevel === l.value ? "bg-gradient-primary text-primary-foreground" : "border border-ivory-dark text-muted-foreground hover:bg-ivory-dark"
                            }`}>{l.label}</button>
                        ))}
                      </div>
                      {errors.experienceLevel && <p className="font-body text-xs text-destructive mt-1">{errors.experienceLevel}</p>}
                    </div>

                    <div>
                      <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-2 block">Preferred Batch Timing</label>
                      <div className="flex flex-wrap gap-2">
                        {batchOptions.map((b) => (
                          <button key={b} type="button" onClick={() => toggleBatch(b)}
                            className={`px-3 sm:px-4 py-2 rounded-full font-body text-[0.8rem] sm:text-[0.85rem] transition-all duration-200 ${
                              form.batchPreference.includes(b) ? "bg-gold text-gold-foreground" : "border border-ivory-dark text-muted-foreground hover:bg-ivory-dark"
                            }`}>{b}</button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Message / Special Notes</label>
                      <textarea rows={3} maxLength={1000} placeholder="Any questions, health conditions, or preferences..." value={form.message} onChange={(e) => updateField("message", e.target.value)} className={inputClass(errors.message)} />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">How Did You Hear About Us?</label>
                        <select value={form.heardFrom} onChange={(e) => updateField("heardFrom", e.target.value)} className={selectClass()}>
                          <option value="">Select</option>
                          {heardFromOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="font-display font-semibold text-[0.85rem] sm:text-[0.95rem] text-foreground mb-1.5 block">Enquiry For</label>
                        <select value={form.enquiryFor} onChange={(e) => updateField("enquiryFor", e.target.value)} className={selectClass()}>
                          <option value="">Select</option>
                          {enquiryForOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 pt-2">
                      <input type="checkbox" id="consent" checked={form.consent} onChange={(e) => updateField("consent", e.target.checked)} className="mt-1 w-4 h-4 accent-gold" />
                      <label htmlFor="consent" className="font-body text-[0.8rem] sm:text-[0.85rem] text-muted-foreground leading-relaxed">
                        I agree to be contacted by Javani Spiritual Hub via phone, WhatsApp, or email regarding my enquiry. *
                      </label>
                    </div>
                    {errors.consent && <p className="font-body text-xs text-destructive">{errors.consent}</p>}

                    <PrimaryButton type="submit" className="w-full text-[1rem] sm:text-[1.1rem]" disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit Enquiry →"}
                    </PrimaryButton>

                    <p className="font-body text-[0.75rem] sm:text-[0.8rem] text-muted-foreground text-center pt-2">
                      📞 Prefer talking? Call us at <span className="text-primary font-medium">{contactInfo.phone}</span> or WhatsApp us directly.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default Contact;
