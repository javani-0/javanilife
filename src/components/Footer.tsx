import { Link } from "react-router-dom";
import { Instagram, Youtube, Facebook, Phone, Mail, MapPin } from "lucide-react";
import GoldDivider from "./GoldDivider";
import GoldOutlineButton from "./GoldOutlineButton";
import { useContactInfo } from "@/hooks/useContactInfo";

const footerLinks = [
  { label: "Home", path: "/" },
  { label: "About Us", path: "/about" },
  { label: "Courses", path: "/courses" },
  { label: "Grading System", path: "/grading" },
  { label: "Gallery", path: "/gallery" },
  { label: "Products", path: "/products" },
  { label: "Guru Bandhu", path: "/guru-bandhu" },
  { label: "Contact", path: "/contact" },
];

const Footer = () => {
  const { phone, email, address, whatsappNumber, instagramUrl, youtubeUrl, facebookUrl } = useContactInfo();

  const socialLinks = [
    { Icon: Instagram, url: instagramUrl },
    { Icon: Youtube, url: youtubeUrl },
    { Icon: Facebook, url: facebookUrl },
  ];

  return (
    <footer className="bg-[#1A0A0A] text-white">
      <GoldDivider />
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <h3 className="font-accent text-[1.4rem] text-white mb-1">Javani</h3>
            <p className="font-display italic text-gold text-[1rem] mb-4">Where Ancient Art Meets the Modern Soul</p>
            <p className="font-body font-light text-[0.85rem] text-white/60 leading-relaxed mb-6">
              Preserving and propagating the sacred classical arts of India through authentic, heart-centered teaching.
            </p>
            <div className="flex gap-3">
              {socialLinks.map(({ Icon, url }, i) => (
                <a key={i} href={url || "#"} target={url ? "_blank" : undefined} rel="noopener noreferrer" className="w-10 h-10 rounded-full border border-gold/60 flex items-center justify-center text-gold hover:bg-gold hover:text-white transition-all duration-300">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold text-gold text-[1rem] tracking-wide mb-6">Navigate</h4>
            <ul className="space-y-3">
              {footerLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="font-body font-light text-[0.875rem] text-white/70 hover:text-white hover:translate-x-1 transition-all duration-300 inline-block">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Terms & Conditions */}
          <div>
            <h4 className="font-display font-semibold text-gold text-[1rem] tracking-wide mb-6">Legal</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/terms-and-conditions" className="font-body font-light text-[0.875rem] text-white/70 hover:text-white hover:translate-x-1 transition-all duration-300 inline-block">
                  Terms and Conditions
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold text-gold text-[1rem] tracking-wide mb-6">Reach Us</h4>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-gold mt-1 flex-shrink-0" />
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-body font-light text-[0.875rem] text-white/70 hover:text-white transition-colors">{phone}</a>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-gold mt-1 flex-shrink-0" />
                <div className="flex flex-col gap-1">
                  {email.split(',').map((emailItem, index) => (
                    <a key={index} href={`mailto:${emailItem.trim()}`} className="font-body font-light text-[0.875rem] text-white/70 hover:text-white transition-colors">
                      {emailItem.trim()}
                    </a>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-gold mt-1 flex-shrink-0" />
                <span className="font-body font-light text-[0.875rem] text-white/70">{address}</span>
              </div>
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer"><GoldOutlineButton className="text-[0.8rem] px-5 py-2 mt-6">Chat With Us</GoldOutlineButton></a>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom bar */}
      <div className="border-t border-gold/20">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row items-center justify-center gap-2">
          <p className="font-body font-light text-[0.75rem] text-white/50">© 2026 Javani Spiritual Hub. All Rights Reserved | Built and developed by</p>
          <a href="https://www.thedreamteamservices.com/" target="_blank" rel="noopener noreferrer" className="font-body font-light text-[0.75rem] text-gold hover:text-white transition-colors duration-300">
            DREAM TEAM SERVICES
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
