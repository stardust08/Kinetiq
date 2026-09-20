import { Button } from "./ui/button";
import { Bell, User, RefreshCw, MapPin } from "lucide-react";
import { Card } from "./ui/card";

export function ComingSoon() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <Card className="max-w-4xl mx-auto p-8 md:p-12 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm uppercase tracking-wide">
              Coming Soon
            </div>
          </div>

          <h2 className="text-3xl md:text-4xl mb-4">In-Person Physiotherapy at Home</h2>
          <p className="text-lg text-gray-700 mb-8">
            Neura AI is expanding to include certified physiotherapist home visits, combined with digital follow-up and monitoring.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="flex gap-3 items-start">
              <User className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="mb-1">Hands-on care when required</h4>
                <p className="text-sm text-gray-600">Expert physiotherapists visit your home</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <RefreshCw className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="mb-1">Hybrid rehab model</h4>
                <p className="text-sm text-gray-600">Combine in-person and digital care</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <MapPin className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="mb-1">Launching in select cities</h4>
                <p className="text-sm text-gray-600">Expanding coverage gradually</p>
              </div>
            </div>
          </div>

          <Button size="lg">
            <Bell className="w-5 h-5 mr-2" />
            Notify Me When Available
          </Button>
        </Card>
      </div>
    </section>
  );
}
