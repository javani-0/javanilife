import { useState } from "react";
import PrimaryButton from "./PrimaryButton";

interface CourseCardProps {
  image: string;
  title: string;
  description: string;
  badge: string;
  badgeColor?: "red" | "gold" | "charcoal";
}

const badgeStyles = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const CourseCard = ({ image, title, description, badge, badgeColor = "red" }: CourseCardProps) => {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div className="bg-card shadow-card rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-hero group cursor-pointer">
      <div className="aspect-[3/2] relative overflow-hidden">
        {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
        <img
          src={image}
          alt={title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <div className="p-6">
        <span className={`inline-block px-3 py-1 text-xs font-body font-medium rounded-full mb-3 ${badgeStyles[badgeColor]}`}>
          {badge}
        </span>
        <h3 className="font-display font-semibold text-[1.4rem] text-foreground mb-2">{title}</h3>
        <p className="font-body text-[0.9rem] text-muted-foreground mb-4 leading-relaxed">{description}</p>
        <PrimaryButton compact className="text-[0.9rem]">Learn More</PrimaryButton>
      </div>
    </div>
  );
};

export default CourseCard;
