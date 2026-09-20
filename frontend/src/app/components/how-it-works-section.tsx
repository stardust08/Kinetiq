import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

const steps = [
  {
    number: "1",
    title: "Consultation",
    description: "1:1 consultation with physiotherapist having 14+ years avg. experience",
    image: "https://images.unsplash.com/photo-1758691463606-1493d79cc577?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2aWRlbyUyMGNhbGwlMjBjb25zdWx0YXRpb24lMjBkb2N0b3IlMjBwYXRpZW50fGVufDF8fHx8MTc3MDU3MTc1MXww&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    number: "2",
    title: "Examination",
    description: "Artificial intelligence to detect the root cause of problem",
    image: "https://images.unsplash.com/photo-1649751361457-01d3a696c7e6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaHlzaW90aGVyYXB5JTIwYXNzZXNzbWVudCUyMG1vdmVtZW50JTIwYW5hbHlzaXN8ZW58MXx8fHwxNzcwNTcxNzUyfDA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    number: "3",
    title: "Treatment Session",
    description: "45 min live 1:1 session with a physiotherapist between 10am to 10:30pm",
    image: "https://images.unsplash.com/photo-1609113160023-4e31f3765fd7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvbmxpbmUlMjBwaHlzaW90aGVyYXB5JTIwc2Vzc2lvbiUyMHRlbGVoZWFsdGh8ZW58MXx8fHwxNzcwNTcxNzUyfDA&ixlib=rb-4.1.0&q=80&w=1080"
  },
  {
    number: "4",
    title: "Outcome based treatment",
    description: "Progress measured & exercise updated every 5th session",
    image: "https://images.unsplash.com/photo-1699787167971-db840f61c3bd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwb3N0dXJlJTIwYmVmb3JlJTIwYWZ0ZXIlMjBjb21wYXJpc29ufGVufDF8fHx8MTc3MDU3MTc1Mnww&ixlib=rb-4.1.0&q=80&w=1080"
  }
];

export function HowItWorksSection() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl mb-4">How It Works</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            A simple, systematic approach to get you back to your best
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {steps.map((step) => (
            <Card key={step.number} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-slate-700 text-white py-3 px-4 flex items-center gap-3">
                <Badge className="bg-white text-slate-800 w-8 h-8 rounded-full flex items-center justify-center p-0 text-base font-bold">
                  {step.number}
                </Badge>
                <h3 className="font-semibold text-lg">{step.title}</h3>
              </div>
              <div className="aspect-[4/3] overflow-hidden bg-gray-100">
                <img
                  src={step.image}
                  alt={step.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 bg-gray-50">
                <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
