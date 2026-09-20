import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Search, MessageCircle, Calendar } from "lucide-react";

const services = [
  {
    icon: Search,
    title: "AI Movement Assessment",
    description: "Understand your posture, mobility, and recovery needs.",
    price: "₹399",
    cta: "Start Assessment",
    popular: false
  },
  {
    icon: MessageCircle,
    title: "Assessment + Expert Consultation",
    description: "Discuss your report with a physiotherapist and plan next steps.",
    price: "₹499",
    cta: "Book Consultation",
    popular: true
  },
  {
    icon: Calendar,
    title: "Home Rehab Programs",
    description: "4, 8, or 12-week structured rehab programs designed by experts.",
    price: "From ₹3,999",
    cta: "View Plans",
    popular: false
  }
];

export function ServicesSection() {
  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl mb-4">Start With What You Need</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Flexible options to match your recovery journey
          </p>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide max-w-6xl mx-auto">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <Card key={index} className="flex-shrink-0 w-[180px] p-4 relative hover:shadow-xl transition-shadow snap-start">
                {service.popular && (
                  <Badge className="absolute top-2 right-2 bg-blue-600 text-[10px] px-1.5 py-0.5">Popular</Badge>
                )}
                <div className="bg-blue-100 w-8 h-8 rounded-lg flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-sm mb-1.5">{service.title}</h3>
                <p className="text-gray-600 text-[10px] mb-3 leading-relaxed">{service.description}</p>
                <div className="mt-auto">
                  <div className="text-lg mb-2 text-blue-600">{service.price}</div>
                  <Button className="w-full text-[10px] h-7" variant={service.popular ? "default" : "outline"}>
                    {service.cta}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}