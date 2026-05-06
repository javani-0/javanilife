
import Footer from "@/components/Footer";

interface PlaceholderPageProps {
  title: string;
  phase: number;
}

const PlaceholderPage = ({ title, phase }: PlaceholderPageProps) => (
  <>
    <main className="min-h-screen flex items-center justify-center bg-background pt-20">
      <div className="text-center">
        <h1 className="font-display font-semibold text-[2.5rem] text-foreground mb-4">{title}</h1>
        <p className="font-body text-muted-foreground text-lg">Coming Soon — Phase {phase}</p>
      </div>
    </main>
    <Footer />
  </>
);

export default PlaceholderPage;
