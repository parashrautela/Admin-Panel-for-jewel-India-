import { Check } from 'lucide-react';

export function StatusVerified() {
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
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-medium">Verified</div>
                  <div className="text-sm text-gray-500 mt-1">Complete</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Content */}
          <div className="flex-1">
            <h1 className="text-5xl font-light mb-8">You're verified</h1>
            <p className="text-lg text-gray-700 mb-10 leading-relaxed">
              Welcome to Jewels India. You can now start uploading your jewellery and reaching retailers across India.
            </p>
            <button className="bg-black text-white px-10 py-4 rounded-lg font-medium hover:bg-gray-800 transition-colors w-full">
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}