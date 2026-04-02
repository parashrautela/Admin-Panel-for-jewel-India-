import { Check, X } from 'lucide-react';

export function StatusRejected() {
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
                  <X className="w-5 h-5 text-gray-900" />
                </div>
                <div>
                  <div className="font-medium">Verification failed</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Content */}
          <div className="flex-1">
            <h1 className="text-5xl font-light mb-8">We couldn't verify your account</h1>
            <p className="text-lg text-gray-700 mb-8 leading-relaxed">
              Unfortunately your application was not approved.
            </p>

            {/* Reason Box */}
            <div className="bg-gray-50 border border-gray-200 p-6 mb-10 rounded-lg">
              <div className="font-medium text-gray-900 mb-2">Reason</div>
              <p className="text-gray-700 leading-relaxed">
                GST number is invalid or expired. Please ensure your GST registration is active before reapplying.
              </p>
            </div>

            <div className="space-y-4">
              <button className="bg-black text-white px-10 py-4 rounded-lg font-medium hover:bg-gray-800 transition-colors">
                Contact support
              </button>
              <div>
                <a href="#" className="text-black hover:underline font-medium">
                  Learn more about requirements
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}