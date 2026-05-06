import { Star } from "lucide-react";

interface TestimonialCardProps {
  quote: string;
  name: string;
  course: string;
  stars: number;
}

const TestimonialCard = ({ quote, name, course, stars }: TestimonialCardProps) => (
  <div className="bg-ivory p-8 border-l-[3px] border-gold rounded-sm">
    <div className="flex gap-1 mb-4">
      {Array.from({ length: stars }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-gold text-gold" />
      ))}
    </div>
    <p className="font-display italic text-[1.1rem] text-foreground leading-relaxed mb-6">"{quote}"</p>
    <div>
      <p className="font-display font-semibold text-foreground">{name}</p>
      <p className="font-body text-sm text-muted-foreground">{course}</p>
    </div>
  </div>
);

export default TestimonialCard;
