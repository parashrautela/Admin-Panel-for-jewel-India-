import { Clock, Check } from 'lucide-react';

export function StatusPending() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-4xl w-full">
        <div className="flex gap-24">
          {/* Left side - Progress stepper */}
          <div className="w-56 flex-shrink-0">
            <div className="space-y-10">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-medium">Account created</div>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-medium">Details submitted</div>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="font-medium">Under verification</div>
                  <div className="text-sm text-gray-500 mt-1">Current step</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Content */}
          <div className="flex-1">
            <h1 className="text-5xl font-light mb-8">You're all submitted</h1>
            <p className="text-lg text-gray-700 mb-8 leading-relaxed">
              We're reviewing your details. We'll notify you within 24–48 hours once you're approved.
            </p>
            <p className="text-sm text-gray-600 mb-10">
              Need help? <a href="tel:9897453396" className="text-black hover:underline font-medium">9897453396</a>
            </p>
            <button className="bg-black text-white px-10 py-4 rounded-lg font-medium hover:bg-gray-800 transition-colors">
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}