import { TrendingDown, Clock, Target } from "lucide-react";

export function CostValue() {
  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl mb-6">Better Rehab, Lower Overall Cost</h2>
          <p className="text-lg text-gray-700 leading-relaxed mb-8">
            By reducing travel, missed sessions, and early dropouts, Neura AI helps patients complete physiotherapy more consistently—leading to better outcomes and lower overall treatment costs compared to frequent clinic visits.
          </p>
          
          <div className="bg-white rounded-2xl p-8 shadow-lg inline-block">
            <div className="text-2xl text-blue-600 mb-2">
              Most patients save significantly over a typical 8–12 week rehab program.
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <TrendingDown className="w-10 h-10 text-blue-600 mb-4 mx-auto" />
              <h4 className="mb-2">Lower Cost</h4>
              <p className="text-sm text-gray-600">Eliminate travel expenses and reduce total treatment costs</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <Clock className="w-10 h-10 text-blue-600 mb-4 mx-auto" />
              <h4 className="mb-2">Save Time</h4>
              <p className="text-sm text-gray-600">No commute or waiting rooms—rehab on your schedule</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
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
