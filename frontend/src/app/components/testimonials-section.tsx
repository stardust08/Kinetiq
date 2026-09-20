import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Play, Star } from "lucide-react";

const testimonials = [
  {
    name: "Amit K.",
    condition: "Chronic Lower Back Pain",
    initials: "AK",
    rating: 5,
    quote: "How I fixed my 3-year-old back pain in 2 weeks using Neura AI. The daily 15-minute sessions fit perfectly into my schedule.",
    videoThumbnail: "https://images.unsplash.com/photo-1615997380705-504484cd99c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21hbiUyMGJhY2slMjBwYWluJTIwcmVsaWVmJTIwcGh5c2lvdGhlcmFweXxlbnwxfHx8fDE3NzA1NzE5NTB8MA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Priya M.",
    condition: "Post Knee Replacement Recovery",
    initials: "PM",
    rating: 5,
    quote: "Started Neura just 2 days after my knee replacement. The AI-guided sessions were simple to follow. I was walking without support in 3 weeks!",
    videoThumbnail: "https://images.unsplash.com/photo-1759813641406-980519f58b1c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxrbmVlJTIwc3VyZ2VyeSUyMHJlY292ZXJ5JTIwcGF0aWVudCUyMHNtaWxpbmd8ZW58MXx8fHwxNzcwNTcxOTUwfDA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Rajesh C.",
    condition: "Hip Surgery Recovery",
    initials: "RC",
    rating: 5,
    quote: "Post-surgery rehab seemed daunting, but the personalized plan and expert oversight made it manageable. Recovery ahead of schedule!",
    videoThumbnail: "https://images.unsplash.com/photo-1762955911235-adeb8838dcf1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGRlcmx5JTIwcGF0aWVudCUyMHBoeXNpb3RoZXJhcHklMjByZWNvdmVyeSUyMGhhcHB5fGVufDF8fHx8MTc3MDU3MTk1MHww&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    name: "Sarah P.",
    condition: "Shoulder Pain",
    initials: "SP",
    rating: 5,
    quote: "No time for clinic visits with my schedule. Neura's flexibility allowed me to recover while maintaining my work commitments.",
    videoThumbnail: "https://images.unsplash.com/photo-1734483768408-87df54bbc89a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYW4lMjBzaG91bGRlciUyMGluanVyeSUyMHJlaGFiaWxpdGF0aW9uJTIwc3VjY2Vzc3xlbnwxfHx8fDE3NzA1NzE5NTF8MA&ixlib=rb-4.1.0&q=80&w=1080"
  }
];

export function TestimonialsSection() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl mb-4">Watch how Neura AI transformed their lives</h2>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide max-w-7xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="flex-shrink-0 w-[140px] overflow-hidden hover:shadow-lg transition-shadow snap-start">
              {/* Video Thumbnail */}
              <div className="relative aspect-[9/16] bg-gray-900 overflow-hidden group">
                <img
                  src={testimonial.videoThumbnail}
                  alt={testimonial.name}
                  className="w-full h-full object-cover opacity-80"
                />
                <Badge className="absolute top-1.5 right-1.5 bg-white text-gray-900 text-[10px] px-1 py-0">
                  Reel
                </Badge>
                <div className="absolute inset-0 flex items-center justify-center">
                  <button className="w-7 h-7 rounded-full bg-teal-500 hover:bg-teal-600 flex items-center justify-center transition-all group-hover:scale-110">
                    <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                  </button>
                </div>
              </div>

              {/* Testimonial Content */}
              <div className="p-2.5">
                <div className="flex gap-0.5 mb-1.5">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-2 h-2 fill-orange-500 text-orange-500" />
                  ))}
                </div>
                
                <p className="text-[10px] text-gray-700 mb-2 leading-relaxed line-clamp-3">
                  "{testimonial.quote}"
                </p>

                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[8px] font-semibold">
                    {testimonial.initials}
                  </div>
                  <div>
                    <div className="font-semibold text-[10px]">{testimonial.name}</div>
                    <div className="text-[8px] text-teal-600">{testimonial.condition}</div>
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