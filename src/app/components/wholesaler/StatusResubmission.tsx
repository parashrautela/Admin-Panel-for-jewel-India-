import { Check, RotateCcw, AlertCircle } from 'lucide-react';

export function StatusResubmission() {
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
                  <RotateCcw className="w-5 h-5 text-gray-900" />
                </div>
                <div>
                  <div className="font-medium">Action required</div>
                  <div className="text-sm text-gray-500 mt-1">Resubmit documents</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Content */}
          <div className="flex-1">
            <h1 className="text-5xl font-light mb-8">We need a few things from you</h1>
            <p className="text-lg text-gray-700 mb-10 leading-relaxed">
              Some of your documents need to be resubmitted.
            </p>

            {/* Document Status List */}
            <div className="space-y-3 mb-10">
              <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <Check className="w-5 h-5 text-black flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">Aadhaar Front</div>
                  <div className="text-sm text-gray-600">Accepted</div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <Check className="w-5 h-5 text-black flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">Aadhaar Back</div>
                  <div className="text-sm text-gray-600">Accepted</div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-gray-100 border border-gray-300 rounded-lg">
                <AlertCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900 mb-1">PAN Card</div>
                  <div className="text-sm text-gray-700">
                    Image is blurry and unreadable. Please upload a clearer photo.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <Check className="w-5 h-5 text-black flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">GST Certificate</div>
                  <div className="text-sm text-gray-600">Accepted</div>
                </div>
              </div>
            </div>

            <button className="bg-black text-white px-10 py-4 rounded-lg font-medium hover:bg-gray-800 transition-colors w-full">
              Re-upload Documents
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}