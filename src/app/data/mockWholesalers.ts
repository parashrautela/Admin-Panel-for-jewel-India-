export type WholesalerStatus = 'pending' | 'onhold' | 'verified' | 'resubmission' | 'rejected' | 'banned';

export interface Document {
  name: string;
  url: string;
  size: string;
  status?: 'accepted' | 'resubmit';
  reason?: string;
}

export interface Wholesaler {
  id: string;
  orderId: string;
  name: string;
  initials: string;
  businessName: string;
  city: string;
  state: string;
  submittedAt: string;
  status: WholesalerStatus;
  aadhaarNumber: string;
  panCard: string;
  gstNumber: string;
  logoUrl?: string;
  documents: {
    aadhaarFront: Document;
    aadhaarBack: Document;
    panCard: Document;
    gstCertificate: Document;
  };
  rejectionReason?: string;
  resubmissionNotes?: string;
}

export const mockWholesalers: Wholesaler[] = [
  {
    id: '1',
    orderId: 'ORD-VER-2026-001',
    name: 'Ramesh Kumar',
    initials: 'RK',
    businessName: 'RK Jewellers',
    city: 'Surat',
    state: 'Gujarat',
    submittedAt: '2 hours ago',
    status: 'pending',
    aadhaarNumber: 'XXXX XXXX 3421',
    panCard: 'ABCDE1234F',
    gstNumber: '24ABCDE1234F1Z5',
    documents: {
      aadhaarFront: {
        name: 'aadhaar_front.jpg',
        url: '/docs/aadhaar-front.jpg',
        size: '2.3 MB'
      },
      aadhaarBack: {
        name: 'aadhaar_back.jpg',
        url: '/docs/aadhaar-back.jpg',
        size: '2.1 MB'
      },
      panCard: {
        name: 'pan_card.jpg',
        url: '/docs/pan-card.jpg',
        size: '1.8 MB'
      },
      gstCertificate: {
        name: 'gst_certificate.pdf',
        url: '/docs/gst-cert.pdf',
        size: '3.2 MB'
      }
    }
  },
  {
    id: '2',
    orderId: 'ORD-VER-2026-002',
    name: 'Meena Joshi',
    initials: 'MJ',
    businessName: 'Meena Gold House',
    city: 'Jaipur',
    state: 'Rajasthan',
    submittedAt: '5 hours ago',
    status: 'pending',
    aadhaarNumber: 'XXXX XXXX 5678',
    panCard: 'FGHIJ5678K',
    gstNumber: '08FGHIJ5678K1Z5',
    documents: {
      aadhaarFront: {
        name: 'aadhaar_front.jpg',
        url: '/docs/aadhaar-front.jpg',
        size: '2.0 MB'
      },
      aadhaarBack: {
        name: 'aadhaar_back.jpg',
        url: '/docs/aadhaar-back.jpg',
        size: '1.9 MB'
      },
      panCard: {
        name: 'pan_card.jpg',
        url: '/docs/pan-card.jpg',
        size: '1.5 MB'
      },
      gstCertificate: {
        name: 'gst_certificate.pdf',
        url: '/docs/gst-cert.pdf',
        size: '2.8 MB'
      }
    }
  },
  {
    id: '3',
    orderId: 'ORD-VER-2026-003',
    name: 'Prakash Verma',
    initials: 'PV',
    businessName: 'PV Ornaments',
    city: 'Chennai',
    state: 'Tamil Nadu',
    submittedAt: 'Yesterday',
    status: 'onhold',
    aadhaarNumber: 'XXXX XXXX 9012',
    panCard: 'KLMNO9012P',
    gstNumber: '33KLMNO9012P1Z5',
    documents: {
      aadhaarFront: {
        name: 'aadhaar_front.jpg',
        url: '/docs/aadhaar-front.jpg',
        size: '2.5 MB'
      },
      aadhaarBack: {
        name: 'aadhaar_back.jpg',
        url: '/docs/aadhaar-back.jpg',
        size: '2.4 MB'
      },
      panCard: {
        name: 'pan_card.jpg',
        url: '/docs/pan-card.jpg',
        size: '1.7 MB'
      },
      gstCertificate: {
        name: 'gst_certificate.pdf',
        url: '/docs/gst-cert.pdf',
        size: '3.0 MB'
      }
    }
  },
  {
    id: '4',
    orderId: 'ORD-VER-2026-004',
    name: 'Ashok Shah',
    initials: 'AS',
    businessName: 'Shah Fine Jewels',
    city: 'Mumbai',
    state: 'Maharashtra',
    submittedAt: '2 days ago',
    status: 'verified',
    aadhaarNumber: 'XXXX XXXX 3456',
    panCard: 'QRSTU3456V',
    gstNumber: '27QRSTU3456V1Z5',
    documents: {
      aadhaarFront: {
        name: 'aadhaar_front.jpg',
        url: '/docs/aadhaar-front.jpg',
        size: '2.2 MB'
      },
      aadhaarBack: {
        name: 'aadhaar_back.jpg',
        url: '/docs/aadhaar-back.jpg',
        size: '2.0 MB'
      },
      panCard: {
        name: 'pan_card.jpg',
        url: '/docs/pan-card.jpg',
        size: '1.6 MB'
      },
      gstCertificate: {
        name: 'gst_certificate.pdf',
        url: '/docs/gst-cert.pdf',
        size: '2.9 MB'
      }
    }
  },
  {
    id: '5',
    orderId: 'ORD-VER-2026-005',
    name: 'Lata Gupta',
    initials: 'LG',
    businessName: 'Gupta Jewellers',
    city: 'Pune',
    state: 'Maharashtra',
    submittedAt: '3 days ago',
    status: 'resubmission',
    aadhaarNumber: 'XXXX XXXX 7890',
    panCard: 'WXYZK7890L',
    gstNumber: '27WXYZK7890L1Z5',
    resubmissionNotes: 'Image is blurry and unreadable. Please upload a clearer photo.',
    documents: {
      aadhaarFront: {
        name: 'aadhaar_front.jpg',
        url: '/docs/aadhaar-front.jpg',
        size: '2.1 MB',
        status: 'accepted'
      },
      aadhaarBack: {
        name: 'aadhaar_back.jpg',
        url: '/docs/aadhaar-back.jpg',
        size: '2.0 MB',
        status: 'accepted'
      },
      panCard: {
        name: 'pan_card.jpg',
        url: '/docs/pan-card.jpg',
        size: '1.4 MB',
        status: 'resubmit',
        reason: 'Image is blurry and unreadable. Please upload a clearer photo.'
      },
      gstCertificate: {
        name: 'gst_certificate.pdf',
        url: '/docs/gst-cert.pdf',
        size: '3.1 MB',
        status: 'accepted'
      }
    }
  },
  {
    id: '6',
    orderId: 'ORD-VER-2026-006',
    name: 'Naresh Khatri',
    initials: 'NK',
    businessName: 'NK Gold Works',
    city: 'Ahmedabad',
    state: 'Gujarat',
    submittedAt: '5 days ago',
    status: 'banned',
    aadhaarNumber: 'XXXX XXXX 2468',
    panCard: 'ABCXY2468M',
    gstNumber: '24ABCXY2468M1Z5',
    documents: {
      aadhaarFront: {
        name: 'aadhaar_front.jpg',
        url: '/docs/aadhaar-front.jpg',
        size: '2.0 MB'
      },
      aadhaarBack: {
        name: 'aadhaar_back.jpg',
        url: '/docs/aadhaar-back.jpg',
        size: '1.8 MB'
      },
      panCard: {
        name: 'pan_card.jpg',
        url: '/docs/pan-card.jpg',
        size: '1.3 MB'
      },
      gstCertificate: {
        name: 'gst_certificate.pdf',
        url: '/docs/gst-cert.pdf',
        size: '2.7 MB'
      }
    }
  }
];

export const getStatusCounts = () => {
  return {
    pending: mockWholesalers.filter(w => w.status === 'pending').length,
    onhold: mockWholesalers.filter(w => w.status === 'onhold').length,
    verified: 148, // As per spec
    rejected: 12, // As per spec
    banned: mockWholesalers.filter(w => w.status === 'banned').length
  };
};
