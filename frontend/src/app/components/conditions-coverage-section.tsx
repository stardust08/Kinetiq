import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

const conditions = [
  {
    title: "ACL & Knee Surgery",
    description: "Complete rehabilitation program for knee replacement and ligament reconstruction recovery",
    image: "https://images.unsplash.com/photo-1643834534240-75aee14ecdc8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxrbmVlJTIwc3VyZ2VyeSUyMHJlaGFiaWxpdGF0aW9uJTIwdGhlcmFweXxlbnwxfHx8fDE3NzA1NzIwODJ8MA&ixlib=rb-4.1.0&q=80&w=1080",
    newLaunch: false
  },
  {
    title: "Shoulder Surgery",
    description: "Post-operative care for rotator cuff repairs and shoulder reconstruction",
    image: "https://images.unsplash.com/photo-1715111641804-f8af88e93b01?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzaG91bGRlciUyMHN1cmdlcnklMjByb3RhdG9yJTIwY3VmZiUyMHBoeXNpb3RoZXJhcHl8ZW58MXx8fHwxNzcwNTcyMDgyfDA&ixlib=rb-4.1.0&q=80&w=1080",
    newLaunch: false
  },
  {
    title: "Back & Neck Pain",
    description: "Root cause treatment for chronic back pain and cervical issues",
    image: "https://images.unsplash.com/photo-1768507423533-b87b62769758?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWNrJTIwcGFpbiUyMHNwaW5lJTIwdGhlcmFweSUyMHRyZWF0bWVudHxlbnwxfHx8fDE3NzA1NzIwODN8MA&ixlib=rb-4.1.0&q=80&w=1080",
    newLaunch: false
  },
  {
    title: "Hip Replacement",
    description: "Mobility restoration program designed for hip surgery recovery",
    image: "https://images.unsplash.com/photo-1564732122118-d9584c2b66dc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoaXAlMjByZXBsYWNlbWVudCUyMHN1cmdlcnklMjByZWNvdmVyeSUyMGVsZGVybHl8ZW58MXx8fHwxNzcwNTcyMDgzfDA&ixlib=rb-4.1.0&q=80&w=1080",
    newLaunch: true
  },
  {
    title: "Stroke & Neuro Rehab",
    description: "Specialized neurological rehabilitation for stroke recovery patients",
    image: "https://images.unsplash.com/photo-1753364980786-d2db08241ba9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdHJva2UlMjBuZXVyb2xvZ2ljYWwlMjByZWhhYmlsaXRhdGlvbiUyMHRoZXJhcHl8ZW58MXx8fHwxNzcwNTcyMDg0fDA&ixlib=rb-4.1.0&q=80&w=1080",
    newLaunch: true
  },
  {
    title: "Sports Injuries",
    description: "Return to sport program for athletes recovering from sports-related injuries",
    image: "https://images.unsplash.com/photo-1600642597492-2ccee7ff872a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBpbmp1cnklMjBhdGhsZXRlJTIwcmVjb3ZlcnklMjBwaHlzaW90aGVyYXB5fGVufDF8fHx8MTc3MDU3MjA4NHww&ixlib=rb-4.1.0&q=80&w=1080",
    newLaunch: false
  }
];

export function ConditionsCoverageSection() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl mb-4">Treat 250+ Conditions</h2>
          <p className="text-lg text-gray-600">
            From head to toe, we've got your recovery covered
          </p>
        </div>

        {/* Scrollable Container */}
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {conditions.map((condition, index) => (
              <Card 
                key={index} 
                className="flex-shrink-0 w-[140px] overflow-hidden hover:shadow-lg transition-shadow snap-start"
              >
                <div className="relative">
                  <div className="aspect-[4/5] overflow-hidden bg-gray-100">
                    <img
                      src={condition.image}
                      alt={condition.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {condition.newLaunch && (
                    <Badge className="absolute bottom-2 left-2 bg-teal-500 text-white text-[10px] px-1.5 py-0.5">
                      New Launch
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-xs mb-1">{condition.title}</h3>
                  <p className="text-[10px] text-gray-600 leading-relaxed">
                    {condition.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="text-center mt-6 text-sm text-gray-500 flex items-center justify-center gap-2">
          <ChevronLeft className="w-4 h-4" />
          <span>Scroll to explore all services</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </section>
  );
}