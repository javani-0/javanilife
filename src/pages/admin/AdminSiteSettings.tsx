import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Pencil, Trash2, X, Image, BarChart3, MessageSquare, Layers, Phone, Globe, Bell, Award } from "lucide-react";
import { contactInfoDefaults, type ContactInfo } from "@/hooks/useContactInfo";
import { useToast } from "@/hooks/use-toast";
import { defaultGradingSettings, normalizeGradingSettings, type FeeRow, type GradingSettings } from "@/lib/gradingSettings";

// ── Types ──
interface StatItem { number: string; label: string }
interface Testimonial { id: string; quote: string; name: string; course: string; stars: number; order: number }
interface AboutImage { src: string; alt: string }

// ── Default About Page values (mirrors About.tsx fallbacks) ──
const defaultAboutHeroImages = [
  "/src/assets/hero-dancer-1.jpg",
  "/src/assets/hero-temple.jpg",
  "/src/assets/hero-dancer-3.jpg",
];
const defaultFounderImage = "/src/assets/dancer-closeup.jpg";

// ── Section wrapper ──
const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div className="bg-card shadow-card rounded-lg p-6 space-y-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-5 h-5 text-gold" />
      <h3 className="font-display font-semibold text-[1.15rem] text-foreground">{title}</h3>
    </div>
    {children}
  </div>
);

const AdminSiteSettings = () => {
  const { toast } = useToast();

  // ── Hero Images ──
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [newHeroUrl, setNewHeroUrl] = useState("");

  // ── About Images ──
  const [aboutImages, setAboutImages] = useState<AboutImage[]>([]);

  // ── Stats ──
  const [stats, setStats] = useState<StatItem[]>([]);
  const [editingStat, setEditingStat] = useState<number | null>(null);
  const [statForm, setStatForm] = useState<StatItem>({ number: "", label: "" });

  // ── Testimonials ──
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [showTestimonialModal, setShowTestimonialModal] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<string | null>(null);
  const [testimonialForm, setTestimonialForm] = useState({ quote: "", name: "", course: "", stars: 5 });

  // ── About Page ──
  const [aboutHeroImages, setAboutHeroImages] = useState<string[]>([]);
  const [newAboutHeroUrl, setNewAboutHeroUrl] = useState("");
  const [aboutFounderImage, setAboutFounderImage] = useState("");
  // ── Contact Info ──
  const [contactInfo, setContactInfo] = useState<ContactInfo>(contactInfoDefaults);
  const [gradingSettings, setGradingSettings] = useState<GradingSettings>(defaultGradingSettings);

  // ── Fetch all data ──
  useEffect(() => {
    // Hero
    getDoc(doc(db, "siteSettings", "hero")).then((snap) => {
      if (snap.exists() && snap.data().images) setHeroImages(snap.data().images);
    });
    // About
    getDoc(doc(db, "siteSettings", "about")).then((snap) => {
      if (snap.exists() && snap.data().images) setAboutImages(snap.data().images);
      else setAboutImages([{ src: "", alt: "Main dancer image" }, { src: "", alt: "Temple image" }, { src: "", alt: "Dance detail image" }]);
    });
    // Stats
    getDoc(doc(db, "siteSettings", "stats")).then((snap) => {
      if (snap.exists() && snap.data().items) setStats(snap.data().items);
    });
    // Testimonials
    const unsub = onSnapshot(query(collection(db, "testimonials"), orderBy("order", "asc")), (snap) => {
      setTestimonials(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Testimonial)));
    });
    // About Page data
    getDoc(doc(db, "siteSettings", "aboutPage")).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAboutHeroImages(data.heroImages?.length > 0 ? data.heroImages : defaultAboutHeroImages);
        setAboutFounderImage(data.founderImage || defaultFounderImage);
      } else {
        setAboutHeroImages(defaultAboutHeroImages);
        setAboutFounderImage(defaultFounderImage);
      }
    });
    // Contact Info
    getDoc(doc(db, "siteSettings", "contactInfo")).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setContactInfo({
          whatsappNumber: data.whatsappNumber || contactInfoDefaults.whatsappNumber,
          orderNotificationPhone: data.orderNotificationPhone || "",
          phone: data.phone || contactInfoDefaults.phone,
          email: data.email || contactInfoDefaults.email,
          address: data.address || contactInfoDefaults.address,
          hours: data.hours || contactInfoDefaults.hours,
          instagramUrl: data.instagramUrl || contactInfoDefaults.instagramUrl,
          youtubeUrl: data.youtubeUrl || contactInfoDefaults.youtubeUrl,
          facebookUrl: data.facebookUrl || contactInfoDefaults.facebookUrl,
        });
      }
    });
    // Grades & Diploma fees
    getDoc(doc(db, "siteSettings", "gradingFees")).then((snap) => {
      setGradingSettings(normalizeGradingSettings(snap.exists() ? snap.data() : undefined));
    });
    return unsub;
  }, []);

  // ── Hero Save ──
  const saveHeroImages = async (imgs: string[]) => {
    setHeroImages(imgs);
    await setDoc(doc(db, "siteSettings", "hero"), { images: imgs });
    toast({ title: "Hero images updated" });
  };
  const addHeroImage = () => {
    if (!newHeroUrl.trim()) return;
    saveHeroImages([...heroImages, newHeroUrl.trim()]);
    setNewHeroUrl("");
  };
  const removeHeroImage = (i: number) => saveHeroImages(heroImages.filter((_, idx) => idx !== i));

  // ── About Save ──
  const saveAboutImages = async (imgs: AboutImage[]) => {
    setAboutImages(imgs);
    await setDoc(doc(db, "siteSettings", "about"), { images: imgs });
    toast({ title: "About images updated" });
  };
  const updateAboutImage = (i: number, field: "src" | "alt", value: string) => {
    const updated = [...aboutImages];
    updated[i] = { ...updated[i], [field]: value };
    setAboutImages(updated);
  };

  // ── Stats Save ──
  const saveStats = async (items: StatItem[]) => {
    setStats(items);
    await setDoc(doc(db, "siteSettings", "stats"), { items });
    toast({ title: "Stats updated" });
  };
  const startEditStat = (i: number) => { setEditingStat(i); setStatForm(stats[i]); };
  const saveStatEdit = () => {
    if (editingStat === null) return;
    const updated = [...stats];
    updated[editingStat] = statForm;
    saveStats(updated);
    setEditingStat(null);
  };

  // ── Testimonials CRUD ──
  const openAddTestimonial = () => { setTestimonialForm({ quote: "", name: "", course: "", stars: 5 }); setEditingTestimonial(null); setShowTestimonialModal(true); };
  const openEditTestimonial = (t: Testimonial) => {
    setTestimonialForm({ quote: t.quote, name: t.name, course: t.course, stars: t.stars });
    setEditingTestimonial(t.id);
    setShowTestimonialModal(true);
  };
  const saveTestimonial = async () => {
    if (!testimonialForm.quote || !testimonialForm.name) { toast({ title: "Quote and name required", variant: "destructive" }); return; }
    try {
      if (editingTestimonial) {
        await updateDoc(doc(db, "testimonials", editingTestimonial), testimonialForm);
        toast({ title: "Testimonial updated" });
      } else {
        await addDoc(collection(db, "testimonials"), { ...testimonialForm, order: testimonials.length });
        toast({ title: "Testimonial added" });
      }
      setShowTestimonialModal(false);
    } catch { toast({ title: "Error saving", variant: "destructive" }); }
  };
  const deleteTestimonial = async (id: string) => {
    if (!confirm("Delete this testimonial?")) return;
    await deleteDoc(doc(db, "testimonials", id));
    toast({ title: "Testimonial deleted" });
  };

  // ── About Page Save ──
  const saveAboutPageData = async (data: { heroImages?: string[]; founderImage?: string }) => {
    const current: any = {};
    if (aboutHeroImages.length > 0) current.heroImages = aboutHeroImages;
    if (aboutFounderImage) current.founderImage = aboutFounderImage;
    await setDoc(doc(db, "siteSettings", "aboutPage"), { ...current, ...data });
    toast({ title: "About page updated" });
  };
  const addAboutHeroImage = () => {
    if (!newAboutHeroUrl.trim()) return;
    const updated = [...aboutHeroImages, newAboutHeroUrl.trim()];
    setAboutHeroImages(updated);
    saveAboutPageData({ heroImages: updated });
    setNewAboutHeroUrl("");
  };
  const removeAboutHeroImage = (i: number) => {
    const updated = aboutHeroImages.filter((_, idx) => idx !== i);
    setAboutHeroImages(updated);
    saveAboutPageData({ heroImages: updated });
  };
  // ── Contact Info Save ──
  const saveContactInfo = async () => {
    await setDoc(doc(db, "siteSettings", "contactInfo"), contactInfo);
    toast({ title: "Contact info updated" });
  };

  const updateGradingField = <K extends keyof GradingSettings>(field: K, value: GradingSettings[K]) => {
    setGradingSettings((current) => ({ ...current, [field]: value }));
  };
  const updateFeeRow = (field: "jgpRows" | "jdpRows", index: number, key: keyof FeeRow, value: string) => {
    setGradingSettings((current) => ({
      ...current,
      [field]: current[field].map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  };
  const addFeeRow = (field: "jgpRows" | "jdpRows") => {
    setGradingSettings((current) => ({
      ...current,
      [field]: [...current[field], { level: "", eligibility: "", fee: "" }],
    }));
  };
  const removeFeeRow = (field: "jgpRows" | "jdpRows", index: number) => {
    setGradingSettings((current) => ({
      ...current,
      [field]: current[field].filter((_, rowIndex) => rowIndex !== index),
    }));
  };
  const updateNotes = (field: "jgpNotes" | "jdpNotes", value: string) => {
    updateGradingField(field, value.split("\n").map((item) => item.trim()).filter(Boolean));
  };
  const saveGradingSettings = async () => {
    await setDoc(doc(db, "siteSettings", "gradingFees"), gradingSettings);
    toast({ title: "Grades & Diploma fees updated" });
  };

  return (
    <div className="space-y-8">
      <h2 className="font-display font-semibold text-[1.5rem] text-foreground">Site Settings</h2>

      {/* Order Notifications */}
      <Section title="Order Notification Number" icon={Bell}>
        <p className="font-body text-[0.8rem] text-muted-foreground">This WhatsApp number receives a message every time a customer places an order. Keep country code included, digits only (e.g. 919959935203).</p>
        <div>
          <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Admin WhatsApp Number for Order Alerts</label>
          <input
            value={contactInfo.orderNotificationPhone}
            onChange={(e) => setContactInfo({ ...contactInfo, orderNotificationPhone: e.target.value.replace(/\D/g, "") })}
            placeholder="919959935203"
            className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold"
          />
          <p className="font-body text-[0.75rem] text-muted-foreground mt-1">Currently: {contactInfo.orderNotificationPhone || <span className="text-destructive">Not set — fallback to WhatsApp Number below</span>}</p>
        </div>
        <button onClick={saveContactInfo} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save Notification Number</button>
      </Section>

      {/* Contact Information */}
      <Section title="Contact Information" icon={Phone}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Update the WhatsApp number, phone, email, address, and hours shown across the website.</p>
        <div className="space-y-3">
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">WhatsApp Number (digits only, e.g. 919876543210)</label>
            <input value={contactInfo.whatsappNumber} onChange={(e) => setContactInfo({ ...contactInfo, whatsappNumber: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Display Phone</label>
            <input value={contactInfo.phone} onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Email</label>
            <input value={contactInfo.email} onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Address</label>
            <input value={contactInfo.address} onChange={(e) => setContactInfo({ ...contactInfo, address: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Hours</label>
            <input value={contactInfo.hours} onChange={(e) => setContactInfo({ ...contactInfo, hours: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
        </div>
        <button onClick={saveContactInfo} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save Contact Info</button>
      </Section>

      {/* Social Media Links */}
      <Section title="Social Media Links" icon={Globe}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Add your social media profile URLs. These appear in the footer.</p>
        <div className="space-y-3">
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Instagram URL</label>
            <input value={contactInfo.instagramUrl} onChange={(e) => setContactInfo({ ...contactInfo, instagramUrl: e.target.value })} placeholder="https://instagram.com/yourpage" className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">YouTube URL</label>
            <input value={contactInfo.youtubeUrl} onChange={(e) => setContactInfo({ ...contactInfo, youtubeUrl: e.target.value })} placeholder="https://youtube.com/@yourchannel" className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Facebook URL</label>
            <input value={contactInfo.facebookUrl} onChange={(e) => setContactInfo({ ...contactInfo, facebookUrl: e.target.value })} placeholder="https://facebook.com/yourpage" className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
        </div>
        <button onClick={saveContactInfo} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save Social Links</button>
      </Section>

      <Section title="Grades & Diploma Fees" icon={Award}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Edit the IAF/ISO approval text and fee tables shown on the Grades & Diploma page.</p>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Approval Badge</label>
            <input value={gradingSettings.approvalLabel} onChange={(e) => updateGradingField("approvalLabel", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div className="md:col-span-2">
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Collaboration Text</label>
            <input value={gradingSettings.collaborationText} onChange={(e) => updateGradingField("collaborationText", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Highlighted Text</label>
            <input value={gradingSettings.collaborationHighlight} onChange={(e) => updateGradingField("collaborationHighlight", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/70 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">JGP Section Label</label>
              <input value={gradingSettings.jgpSectionLabel} onChange={(e) => updateGradingField("jgpSectionLabel", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
            </div>
            <div>
              <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">JGP Heading</label>
              <input value={gradingSettings.jgpHeading} onChange={(e) => updateGradingField("jgpHeading", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-semibold text-foreground">JGP Fee Rows</h4>
              <button onClick={() => addFeeRow("jgpRows")} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.8rem]"><Plus className="w-4 h-4" /> Add Row</button>
            </div>
            {gradingSettings.jgpRows.map((row, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[0.7fr_1.3fr_1fr_auto] items-center">
                <input value={row.level} onChange={(e) => updateFeeRow("jgpRows", index, "level", e.target.value)} placeholder="Grade" className="px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                <input value={row.eligibility} onChange={(e) => updateFeeRow("jgpRows", index, "eligibility", e.target.value)} placeholder="Eligibility" className="px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                <input value={row.fee} onChange={(e) => updateFeeRow("jgpRows", index, "fee", e.target.value)} placeholder="Fee" className="px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                <button onClick={() => removeFeeRow("jgpRows", index)} className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">JGP Notes (one per line)</label>
            <textarea value={gradingSettings.jgpNotes.join("\n")} onChange={(e) => updateNotes("jgpNotes", e.target.value)} rows={5} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/70 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">JDP Section Label</label>
              <input value={gradingSettings.jdpSectionLabel} onChange={(e) => updateGradingField("jdpSectionLabel", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
            </div>
            <div>
              <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">JDP Heading</label>
              <input value={gradingSettings.jdpHeading} onChange={(e) => updateGradingField("jdpHeading", e.target.value)} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-semibold text-foreground">JDP Fee Rows</h4>
              <button onClick={() => addFeeRow("jdpRows")} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.8rem]"><Plus className="w-4 h-4" /> Add Row</button>
            </div>
            {gradingSettings.jdpRows.map((row, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[0.7fr_1.3fr_1fr_auto] items-center">
                <input value={row.level} onChange={(e) => updateFeeRow("jdpRows", index, "level", e.target.value)} placeholder="Program Level" className="px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                <input value={row.eligibility} onChange={(e) => updateFeeRow("jdpRows", index, "eligibility", e.target.value)} placeholder="Eligibility" className="px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                <input value={row.fee} onChange={(e) => updateFeeRow("jdpRows", index, "fee", e.target.value)} placeholder="Fee" className="px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                <button onClick={() => removeFeeRow("jdpRows", index)} className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div>
            <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">JDP Notes (one per line)</label>
            <textarea value={gradingSettings.jdpNotes.join("\n")} onChange={(e) => updateNotes("jdpNotes", e.target.value)} rows={5} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
        </div>

        <button onClick={saveGradingSettings} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save Grades & Diploma Fees</button>
      </Section>

      {/* Hero Images */}
      <Section title="Hero Background Images" icon={Layers}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Add image URLs for the hero slideshow. Leave empty to use default images.</p>
        <div className="space-y-2">
          {heroImages.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={url} onChange={(e) => { const u = [...heroImages]; u[i] = e.target.value; setHeroImages(u); }} className="flex-1 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
              <button onClick={() => removeHeroImage(i)} className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newHeroUrl} onChange={(e) => setNewHeroUrl(e.target.value)} placeholder="Paste image URL..." className="flex-1 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          <button onClick={addHeroImage} className="px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium hover:brightness-110"><Plus className="w-4 h-4" /></button>
        </div>
        {heroImages.length > 0 && (
          <button onClick={() => saveHeroImages(heroImages)} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save Hero Images</button>
        )}
      </Section>

      {/* About Images */}
      <Section title="About Section Images" icon={Image}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Replace the 3 images in the OUR LEGACY section. Leave empty to use defaults.</p>
        {aboutImages.map((img, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="font-body text-[0.8rem] text-muted-foreground w-6">{i + 1}.</span>
            <input value={img.src} onChange={(e) => updateAboutImage(i, "src", e.target.value)} placeholder="Image URL" className="flex-1 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
            <input value={img.alt} onChange={(e) => updateAboutImage(i, "alt", e.target.value)} placeholder="Alt text" className="w-40 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          </div>
        ))}
        <button onClick={() => saveAboutImages(aboutImages)} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save About Images</button>
      </Section>

      {/* Stats */}
      <Section title="Stats Numbers" icon={BarChart3}>
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              {editingStat === i ? (
                <>
                  <input value={statForm.number} onChange={(e) => setStatForm({ ...statForm, number: e.target.value })} className="w-24 px-2 py-1.5 rounded border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                  <input value={statForm.label} onChange={(e) => setStatForm({ ...statForm, label: e.target.value })} className="flex-1 px-2 py-1.5 rounded border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
                  <button onClick={saveStatEdit} className="px-3 py-1.5 rounded bg-gold text-gold-foreground font-body text-[0.8rem]">Save</button>
                  <button onClick={() => setEditingStat(null)} className="px-3 py-1.5 rounded border border-border font-body text-[0.8rem]">Cancel</button>
                </>
              ) : (
                <>
                  <span className="font-display font-bold text-gold w-24">{s.number}</span>
                  <span className="flex-1 font-body text-[0.875rem] text-foreground">{s.label}</span>
                  <button onClick={() => startEditStat(i)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold"><Pencil className="w-4 h-4" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <Section title="Student Testimonials" icon={MessageSquare}>
        <div className="flex justify-end">
          <button onClick={openAddTestimonial} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium hover:brightness-110">
            <Plus className="w-4 h-4" /> Add Testimonial
          </button>
        </div>
        <div className="space-y-3">
          {testimonials.map((t) => (
            <div key={t.id} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex-1 min-w-0">
                <p className="font-body text-[0.85rem] text-foreground italic mb-1">"{t.quote.slice(0, 100)}..."</p>
                <p className="font-body text-[0.8rem] text-muted-foreground">— {t.name}, {t.course}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEditTestimonial(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteTestimonial(t.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Testimonial Modal */}
      {showTestimonialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTestimonialModal(false)} />
          <div className="relative bg-card rounded-xl shadow-hero w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-[1.3rem]">{editingTestimonial ? "Edit Testimonial" : "Add Testimonial"}</h3>
              <button onClick={() => setShowTestimonialModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Student Name *</label>
                <input value={testimonialForm.name} onChange={(e) => setTestimonialForm({ ...testimonialForm, name: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Course</label>
                <input value={testimonialForm.course} onChange={(e) => setTestimonialForm({ ...testimonialForm, course: e.target.value })} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Quote *</label>
                <textarea value={testimonialForm.quote} onChange={(e) => setTestimonialForm({ ...testimonialForm, quote: e.target.value })} rows={4} className="w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <div>
                <label className="font-body text-[0.85rem] text-muted-foreground block mb-1">Stars (1-5)</label>
                <input type="number" min={1} max={5} value={testimonialForm.stars} onChange={(e) => setTestimonialForm({ ...testimonialForm, stars: parseInt(e.target.value) || 5 })} className="w-24 px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold" />
              </div>
              <button onClick={saveTestimonial} className="w-full px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.9rem] font-medium hover:brightness-110">
                {editingTestimonial ? "Update" : "Add"} Testimonial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── About Page Settings ── */}
      <Section title="About Page — Hero Images" icon={Layers}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Manage the hero slideshow on the About page. Leave empty to use defaults.</p>
        <div className="space-y-2">
          {aboutHeroImages.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={url} onChange={(e) => { const u = [...aboutHeroImages]; u[i] = e.target.value; setAboutHeroImages(u); }} className="flex-1 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
              <button onClick={() => removeAboutHeroImage(i)} className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newAboutHeroUrl} onChange={(e) => setNewAboutHeroUrl(e.target.value)} placeholder="Paste image URL..." className="flex-1 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          <button onClick={addAboutHeroImage} className="px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.85rem] font-medium hover:brightness-110"><Plus className="w-4 h-4" /></button>
        </div>
        {aboutHeroImages.length > 0 && (
          <button onClick={() => saveAboutPageData({ heroImages: aboutHeroImages })} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save Hero Images</button>
        )}
      </Section>

      <Section title="About Page — Founder Image" icon={Image}>
        <p className="font-body text-[0.8rem] text-muted-foreground">Update the founder portrait on the About page.</p>
        <div className="flex gap-2 items-center">
          <input value={aboutFounderImage} onChange={(e) => setAboutFounderImage(e.target.value)} placeholder="Founder image URL" className="flex-1 px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold" />
          <button onClick={() => saveAboutPageData({ founderImage: aboutFounderImage })} className="px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110">Save</button>
        </div>
        {aboutFounderImage && (
          <img src={aboutFounderImage} alt="Founder preview" className="w-24 h-32 object-cover rounded mt-2 border border-border" />
        )}
      </Section>


    </div>
  );
};

export default AdminSiteSettings;
