import { X } from 'lucide-react';
import { useState } from 'react';

type BannerType = 'verified' | 'resubmission' | 'rejected';

interface NotificationBannerProps {
  type: BannerType;
  onAction?: () => void;
}

export function NotificationBanner({ type, onAction }: NotificationBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const bannerConfig = {
    verified: {
      bg: 'bg-black',
      text: 'You\'re verified! You can now access your full dashboard.',
      buttonText: 'Go to Dashboard'
    },
    resubmission: {
      bg: 'bg-gray-900',
      text: 'Action required — some documents need to be resubmitted.',
      buttonText: 'Review now'
    },
    rejected: {
      bg: 'bg-gray-900',
      text: 'Your verification was unsuccessful. Tap to see the reason.',
      buttonText: 'See details'
    }
  };

  const config = bannerConfig[type];

  return (
    <div className={`${config.bg} text-white px-8 py-4 fixed top-0 left-0 right-0 z-50 flex items-center justify-between shadow-lg`}>
      <div className="flex-1 text-center">
        <span className="font-medium">{config.text}</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onAction}
          className="bg-white text-black px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          {config.buttonText}
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="text-white hover:text-gray-300 p-1.5 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}