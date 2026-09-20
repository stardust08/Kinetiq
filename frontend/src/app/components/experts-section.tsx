import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, Briefcase, Languages } from "lucide-react";
import { useRef } from "react";

const experts = [
  {
    name: "Dr. Anand Kumar",
    title: "Physiotherapist (MPT)",
    specialty: "Musculoskeletal Rehabilitation",
    servicesDelivered: "800+",
    languages: "English, Hindi, Tamil, Telugu",
    image: "https://images.unsplash.com/photo-1698465281093-9f09159733b9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYWxlJTIwZG9jdG9yJTIwcG9ydHJhaXQlMjBwcm9mZXNzaW9uYWwlMjBpbmRpYXxlbnwxfHx8fDE3NzA1NzI1MjR8MA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Dr. Priya Sharma",
    title: "Orthopedic Surgeon",
    specialty: "Joint Replacement & Sports Injuries",
    servicesDelivered: "1200+",
    languages: "English, Hindi, Kannada",
    image: "https://images.unsplash.com/photo-1669829528850-959d7b08278b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmZW1hbGUlMjBkb2N0b3IlMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbCUyMGluZGlhfGVufDF8fHx8MTc3MDU3MjUyNHww&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Dr. Rajesh Menon",
    title: "Neurologist",
    specialty: "Stroke Rehabilitation & Neuro Recovery",
    servicesDelivered: "650+",
    languages: "English, Malayalam, Tamil",
    image: "https://images.unsplash.com/photo-1706565029539-d09af5896340?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZXVyb2xvZ2lzdCUyMGRvY3RvciUyMHBvcnRyYWl0JTIwcHJvZmVzc2lvbmFsfGVufDF8fHx8MTc3MDU3MjUyNXww&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Dr. Meera Patel",
    title: "Sports Medicine Specialist",
    specialty: "Athletic Performance & Injury Prevention",
    servicesDelivered: "900+",
    languages: "English, Hindi, Gujarati",
    image: "https://images.unsplash.com/photo-1645066928295-2506defde470?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBtZWRpY2luZSUyMGRvY3RvciUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MDU3MjUyNXww&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Dr. Vikram Singh",
    title: "Orthopedic Surgeon",
    specialty: "Spine Surgery & Back Pain Management",
    servicesDelivered: "1100+",
    languages: "English, Hindi, Punjabi",
    image: "https://images.unsplash.com/photo-1762237798212-bcc000c00891?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvcnRob3BlZGljJTIwc3VyZ2VvbiUyMHBvcnRyYWl0JTIwcHJvZmVzc2lvbmFsfGVufDF8fHx8MTc3MDU3MjUyNXww&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Dr. Anjali Reddy",
    title: "Physiotherapist (DPT)",
    specialty: "Post-Surgical Rehabilitation",
    servicesDelivered: "750+",
    languages: "English, Telugu, Hindi",
    image: "https://images.unsplash.com/photo-1659353887804-fc7f9313021a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaHlzaW90aGVyYXBpc3QlMjBkb2N0b3IlMjBwb3J0cmFpdCUyMHByb2Zlc3Npb25hbHxlbnwxfHx8fDE3NzA1NzI1MjV8MA&ixlib=rb-4.1.0&q=80&w=1080"
  }
];

export function ExpertsSection() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 320;
      const newScrollLeft = 
        direction === "left"
          ? scrollContainerRef.current.scrollLeft - scrollAmount
          : scrollContainerRef.current.scrollLeft + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: "smooth"
      });
    }
  };

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl md:text-4xl">Meet our Experts</h2>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll("left")}
              className="rounded-full w-8 h-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll("right")}
              className="rounded-full w-8 h-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
        >
          {experts.map((expert, index) => (
            <Card 
              key={index} 
              className="flex-shrink-0 w-[140px] overflow-hidden hover:shadow-lg transition-shadow snap-start"
            >
              <div className="aspect-[3/4] overflow-hidden bg-purple-100">
                <img
                  src={expert.image}
                  alt={expert.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-2.5 space-y-1.5">
                <div>
                  <h3 className="font-semibold text-[10px] mb-0.5">{expert.name}</h3>
                  <p className="text-[8px] text-gray-600">{expert.title}</p>
                  <p className="text-[8px] text-gray-500 mt-0.5 line-clamp-2">{expert.specialty}</p>
                </div>

                <div className="space-y-1 pt-1 border-t border-gray-100">
                  <div className="flex items-start gap-1 text-[8px] text-gray-600">
                    <Briefcase className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-teal-600" />
                    <span>{expert.servicesDelivered} services</span>
                  </div>
                  <div className="flex items-start gap-1 text-[8px] text-gray-600">
                    <Languages className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-teal-600" />
                    <span className="line-clamp-1">{expert.languages}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}