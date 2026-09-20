import { Camera, FileText, TrendingUp } from "lucide-react";
import { Card } from "./ui/card";

export function HowCareIsDelivered() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl">A Care Model Built Around You</h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Neura AI combines clinical expertise with digital convenience. You start with an AI movement assessment, followed by a rehab plan designed by experts, and continue therapy from home with regular monitoring and check-ins.
            </p>

            <div className="space-y-4 pt-4">
              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Camera className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="mb-1">AI-based assessment using your phone camera</h4>
                  <p className="text-sm text-gray-600">Quick, convenient movement analysis without special equipment</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="mb-1">Personalised rehab plans by experts</h4>
                  <p className="text-sm text-gray-600">Tailored programs designed specifically for your condition</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="mb-1">Ongoing monitoring and plan updates</h4>
                  <p className="text-sm text-gray-600">Regular check-ins to track progress and adjust your program</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Card className="p-8 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
              <h3 className="text-2xl mb-4">Not Just Online Exercises</h3>
              <p className="text-blue-50 leading-relaxed">
                Neura AI focuses on clinical rehabilitation—not generic workout videos. Every plan follows structured physiotherapy principles.
              </p>
              <div className="mt-6 pt-6 border-t border-blue-500">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-3xl mb-1">100%</div>
                    <div className="text-sm text-blue-100">Expert Designed</div>
                  </div>
                  <div>
                    <div className="text-3xl mb-1">Clinical</div>
                    <div className="text-sm text-blue-100">Approach</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
