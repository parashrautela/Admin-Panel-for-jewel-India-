import { Check, Pause } from 'lucide-react';

export function StatusOnHold() {
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
                  <Pause className="w-5 h-5 text-gray-900" />
                </div>
                <div>
                  <div className="font-medium">Additional review</div>
                  <div className="text-sm text-gray-500 mt-1">In progress</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Content */}
          <div className="flex-1">
            <h1 className="text-5xl font-light mb-8">Your account is under review</h1>
            <p className="text-lg text-gray-700 mb-8 leading-relaxed">
              We're doing some additional checks on your account. This usually takes 1–3 business days. We'll notify you once it's resolved.
            </p>
            <p className="text-sm text-gray-600">
              Need help? <a href="tel:9897453396" className="text-black hover:underline font-medium">9897453396</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}