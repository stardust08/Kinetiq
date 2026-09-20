import { Heart, Building2, Syringe, ClipboardCheck } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

const outcomes = [
  {
    icon: Heart,
    title: "Recover With Confidence",
    description: "Structured rehab plans help reduce pain, stiffness, and mobility limitations over time.",
    image: "https://images.unsplash.com/photo-1579600161224-cac5a2971069?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMHBhdGllbnQlMjByZWNvdmVyeSUyMHN1Y2Nlc3MlMjBjb25maWRlbnR8ZW58MXx8fHwxNzcwNTcxODY0fDA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    icon: Building2,
    title: "Reduce Repeat Hospital Visits",
    description: "Consistent physiotherapy at home lowers the risk of relapse and complications.",
    image: "https://images.unsplash.com/photo-1512678080530-7760d81faba6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob3NwaXRhbCUyMGRpc2NoYXJnZSUyMGhvbWUlMjBjYXJlJTIwY29tZm9ydGFibGV8ZW58MXx8fHwxNzcwNTcxODY1fDA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    icon: Syringe,
    title: "Avoid Unnecessary Procedures",
    description: "Early and continued rehabilitation can help reduce dependence on injections, scans, or surgery.",
    image: "https://images.unsplash.com/photo-1633158832433-11a30ad1e10d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwcGVyc29uJTIwYXZvaWRpbmclMjBzdXJnZXJ5JTIwaGVhbHRoeXxlbnwxfHx8fDE3NzA1NzE4NjV8MA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    icon: ClipboardCheck,
    title: "Better Continuity After Discharge",
    description: "Neura AI ensures physiotherapy doesn't stop once the hospital stay ends.",
    image: "https://images.unsplash.com/photo-1758599880788-e49f6ee77bc7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaHlzaW90aGVyYXB5JTIwY29udGludWl0eSUyMGNhcmUlMjBqb3VybmV5fGVufDF8fHx8MTc3MDU3MTg2Nnww&ixlib=rb-4.1.0&q=80&w=1080"
  }
];

export function OutcomesSection() {
  return (
    <section className="py-16 md:py-24 bg-slate-800">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl mb-4 text-white">Outcomes That Matter</h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            Real benefits that improve your recovery journey and overall health
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {outcomes.map((outcome, index) => (
            <Card key={index} className="overflow-hidden border-slate-700 bg-slate-700/50 hover:bg-slate-700/70 transition-all">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={outcome.image}
                  alt={outcome.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl mb-3 text-white">{outcome.title}</h3>
                <p className="text-slate-300 leading-relaxed text-sm">{outcome.description}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="text-center mt-8">
          <Button size="lg" className="px-12">
            Start Your Recovery
          </Button>
        </div>
      </div>
    </section>
  );
}