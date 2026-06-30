export interface StatusHistoryEntry {
  status: 'Reported' | 'Verified' | 'Scheduled' | 'In Progress' | 'Resolved';
  changedAt: string; // ISO Date string
  changedBy: string; // Name or role of the person/system making the change
  comment?: string; // Optional context about the change
}

export interface Issue {
  id: string; // Document ID from Firestore
  title: string;
  description: string;
  category: 'pothole' | 'garbage' | 'leakage' | 'streetlight' | 'other';
  imageUrl: string; // Base64 representation or illustrative image
  lat: number;
  lng: number;
  address: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  urgency: 'Low' | 'Medium' | 'High' | 'Immediate';
  urgencyReason: string; // Detailed AI justification
  estimatedCost: string; // Estimated budget parsed by AI
  complaintText: string; // Automated formal complaint letter drafted by AI
  status: 'Reported' | 'Verified' | 'Scheduled' | 'In Progress' | 'Resolved';
  reportedAt: string; // ISO Date String
  reportedBy: string; // Email or name
  upvotes: number;
  votedUsers: string[]; // List of user emails who voted/verified
  resolutionSummary?: string; // Short summary of the work done
  repairAdvice?: string; // Community tip/advice to keep it maintained
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  municipalityName?: string;
  municipalityAddress?: string;
  estimatedResolutionTime?: string;
  isEscalatedToRepresentatives?: boolean;
  escalatedRepresentatives?: string[];
  socialSharesCount?: number;
  statusHistory?: StatusHistoryEntry[];
  isEmergency?: boolean;
  emergencyDispatchSent?: boolean;
}

export interface UserProfile {
  email: string;
  displayName: string;
  points: number;
  reportsCount: number;
  votesCount: number;
  badges: string[];
  role?: "citizen" | "municipality";
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  isVerification?: boolean;
  verificationPhoto?: string;
}

export interface StatsData {
  category: string;
  count: number;
}
