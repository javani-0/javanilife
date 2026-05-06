import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ContactInfo {
  whatsappNumber: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  instagramUrl: string;
  youtubeUrl: string;
  facebookUrl: string;
}

const defaults: ContactInfo = {
  whatsappNumber: "919876543210",
  phone: "+91 9030200263",
  email: "seva@javanilife.com, spiritualhub@javanilife.com",
  address: "JAVANI SPIRITUAL HUB, Plot # 7&8, Raghava Kalyan Estate, Chandragiri Colony, Yapral, Secunderabad, Telangana 500094",
  hours: "Mon-Sat: 7:00 AM - 8:00 PM",
  instagramUrl: "",
  youtubeUrl: "",
  facebookUrl: "",
};

let cached: ContactInfo | null = null;

export const useContactInfo = () => {
  const [contactInfo, setContactInfo] = useState<ContactInfo>(cached || defaults);

  useEffect(() => {
    if (cached) return;
    getDoc(doc(db, "siteSettings", "contactInfo")).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const info: ContactInfo = {
          whatsappNumber: data.whatsappNumber || defaults.whatsappNumber,
          phone: data.phone || defaults.phone,
          email: data.email || defaults.email,
          address: data.address || defaults.address,
          hours: data.hours || defaults.hours,
          instagramUrl: data.instagramUrl || defaults.instagramUrl,
          youtubeUrl: data.youtubeUrl || defaults.youtubeUrl,
          facebookUrl: data.facebookUrl || defaults.facebookUrl,
        };
        cached = info;
        setContactInfo(info);
      } else {
        cached = defaults;
      }
    }).catch(() => { cached = defaults; });
  }, []);

  return contactInfo;
};

export const contactInfoDefaults = defaults;
