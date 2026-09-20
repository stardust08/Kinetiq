import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-blue-600 to-blue-800 text-white">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl md:text-5xl">Start Today</h2>
          <p className="text-xl text-blue-100 leading-relaxed">
            Ready to Recover Faster? take the consult now before committing to a plan
          </p>
          
          <div className="pt-6">
            <Button size="lg" className="text-lg px-8 py-6">
              Start AI Assessment – ₹399
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          <p className="text-sm text-blue-200 pt-4">
            Quick • Convenient • Clinically Validated
          </p>
        </div>
      </div>
    </section>
  );
}