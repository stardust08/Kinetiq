import { Header } from "../app/components/header";
import { HeroSection } from "../app/components/hero-section";
import { AIScreeningSection } from "../app/components/ai-screening-section";
import { ConditionsSection } from "../app/components/conditions-section";
import { Footer } from "../app/components/footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#030712]">
      <Header />
      <main>
        <HeroSection />
        <AIScreeningSection />
        <ConditionsSection />
      </main>
      <Footer />
    </div>
  );
}
