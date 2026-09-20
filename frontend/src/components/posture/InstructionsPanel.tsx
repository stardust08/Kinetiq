/**
 * InstructionsPanel Component
 * 
 * Displays clear positioning instructions, visual guides, and tips for best results
 * before starting the posture analysis webcam capture.
 * 
 * Features:
 * - Pre-capture positioning instructions
 * - Visual guide illustration
 * - Tips for optimal results
 * - Clear, organized layout
 * - Accessible design
 * 
 * @example
 * <InstructionsPanel />
 */
export default function InstructionsPanel() {
  return (
    <div className="space-y-6">
      {/* Visual Guide */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Visual Guide
        </h3>
        
        {/* Simple visual representation */}
        <div className="bg-white rounded-lg p-8 mb-4 flex items-center justify-center">
          <div className="relative">
            {/* Camera icon */}
            <div className="absolute -top-12 left-1/2 transform -translate-x-1/2">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            
            {/* Person silhouette */}
            <svg className="w-32 h-48 text-blue-600" viewBox="0 0 100 150" fill="currentColor">
              {/* Head */}
              <circle cx="50" cy="20" r="12" />
              {/* Neck */}
              <rect x="47" y="30" width="6" height="8" />
              {/* Torso */}
              <rect x="35" y="38" width="30" height="45" rx="4" />
              {/* Left arm */}
              <rect x="25" y="40" width="10" height="35" rx="3" />
              {/* Right arm */}
              <rect x="65" y="40" width="10" height="35" rx="3" />
              {/* Left leg */}
              <rect x="38" y="83" width="10" height="50" rx="3" />
              {/* Right leg */}
              <rect x="52" y="83" width="10" height="50" rx="3" />
            </svg>
            
            {/* Distance indicator */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              <div className="flex items-center text-sm text-gray-600">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                6-8 feet
              </div>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-blue-800 text-center">
          Position yourself so your entire body is visible in the camera frame
        </p>
      </div>

      {/* Before You Start */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Before You Start
        </h3>
        <ul className="space-y-2.5">
          <li className="flex items-start text-sm text-blue-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span><strong>Distance:</strong> Stand 6-8 feet away from your camera</span>
          </li>
          <li className="flex items-start text-sm text-blue-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span><strong>Visibility:</strong> Ensure your full body is visible in the frame (head to feet)</span>
          </li>
          <li className="flex items-start text-sm text-blue-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span><strong>Lighting:</strong> Stand in a well-lit area with even lighting</span>
          </li>
          <li className="flex items-start text-sm text-blue-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span><strong>Clothing:</strong> Wear fitted clothing for accurate body landmark detection</span>
          </li>
          <li className="flex items-start text-sm text-blue-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span><strong>Posture:</strong> Stand naturally in a relaxed, comfortable position</span>
          </li>
        </ul>
      </div>

      {/* During Capture */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
        <h3 className="font-semibold text-yellow-900 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          During Capture (10 seconds)
        </h3>
        <ul className="space-y-2.5">
          <li className="flex items-start text-sm text-yellow-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Stand still and maintain your natural posture</span>
          </li>
          <li className="flex items-start text-sm text-yellow-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Look straight ahead at the camera</span>
          </li>
          <li className="flex items-start text-sm text-yellow-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Keep your arms relaxed at your sides</span>
          </li>
          <li className="flex items-start text-sm text-yellow-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Breathe normally and stay relaxed</span>
          </li>
        </ul>
      </div>

      {/* Tips for Best Results */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-5">
        <h3 className="font-semibold text-green-900 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Tips for Best Results
        </h3>
        <ul className="space-y-2.5">
          <li className="flex items-start text-sm text-green-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Avoid backlighting (windows or bright lights behind you)</span>
          </li>
          <li className="flex items-start text-sm text-green-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Use a plain background without clutter for better detection</span>
          </li>
          <li className="flex items-start text-sm text-green-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Remove shoes for accurate foot and ankle analysis</span>
          </li>
          <li className="flex items-start text-sm text-green-900">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>If analysis fails, you can retry without using a screening count</span>
          </li>
        </ul>
      </div>

      {/* Important Note */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-purple-900 mb-1">Important</h4>
            <p className="text-sm text-purple-800">
              The analysis will capture 180 frames across three poses (Front, Side, Back) to calculate 33 clinical posture metrics. 
              One screening count will be deducted from your booking only after successful completion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
