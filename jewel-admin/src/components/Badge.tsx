import React from 'react';
import type { VerificationStatus } from '../types/wholesaler';

interface BadgeProps {
  status: VerificationStatus;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  const getStyles = (status: VerificationStatus) => {
    switch (status) {
      case 'verified':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'on_hold':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
      case 'resubmission_required':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'banned':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getLabel = (status: VerificationStatus) => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Rejected';
      case 'on_hold':
        return 'On Hold';
      case 'pending':
        return 'Pending';
      case 'resubmission_required':
        return 'Resubmission Required';
      case 'banned':
        return 'Banned';
      default:
        return status;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border ${getStyles(
        status
      )}`}
    >
      {getLabel(status)}
    </span>
  );
};
