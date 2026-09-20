import { Camera, FileText, TrendingUp, TrendingDown, Clock, Target } from "lucide-react";
import { Card } from "./ui/card";

export function CareModelSection() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl mb-4">Better Rehab, Lower Overall Cost</h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Neura AI combines clinical expertise with digital convenience—reducing travel, missed sessions, and early dropouts for better outcomes at lower cost.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center mb-12">
          <div className="space-y-4">
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

          <div>
            <Card className="p-8 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
              <h3 className="text-2xl mb-4">Not Just Online Exercises</h3>
              <p className="text-blue-50 leading-relaxed mb-6">
                Neura AI focuses on clinical rehabilitation—not generic workout videos. Every plan follows structured physiotherapy principles.
              </p>
              <div className="pt-6 border-t border-blue-500">
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

        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 md:p-8 text-center mb-8">
            <div className="text-xl md:text-2xl text-blue-600">
              Most patients save significantly over a typical 8–12 week rehab program
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              <TrendingDown className="w-10 h-10 text-blue-600 mb-4 mx-auto" />
              <h4 className="mb-2">Lower Cost</h4>
              <p className="text-sm text-gray-600">Eliminate travel expenses and reduce total treatment costs</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              <Clock className="w-10 h-10 text-blue-600 mb-4 mx-auto" />
              <h4 className="mb-2">Save Time</h4>
              <p className="text-sm text-gray-600">No commute or waiting rooms—rehab on your schedule</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              <Target className="w-10 h-10 text-blue-600 mb-4 mx-auto" />
              <h4 className="mb-2">Better Compliance</h4>
              <p className="text-sm text-gray-600">Complete your full program without dropping out early</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}