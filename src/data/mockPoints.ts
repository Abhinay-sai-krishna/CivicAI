import { Issue, UserProfile } from '../types';

export const HOTSPOTS = [
  { name: '452 Broadway Ave (Downtown)', lat: 37.7749, lng: -122.4194 },
  { name: 'Central Park West entrance', lat: 37.7833, lng: -122.4167 },
  { name: 'Oak & Filmore Intersection', lat: 37.7699, lng: -122.4468 },
  { name: 'Market Street crossing St. 12', lat: 37.7891, lng: -122.4014 },
  { name: 'Industrial Road (Warehouse zone)', lat: 37.7510, lng: -122.3920 },
  { name: '782 Lakeview Blvd (Residential)', lat: 37.8012, lng: -122.4255 }
];

export const INITIAL_LEADERBOARD: UserProfile[] = [
  {
    email: 'sarah.parks@civic.org',
    displayName: 'Sarah Jenkins (Civic Champion)',
    points: 840,
    reportsCount: 9,
    votesCount: 32,
    badges: ['Neighborhood Hero', 'Alpha Voter', 'Pothole Patrol', 'Street Medic']
  },
  {
    email: 'k.alvarez@gmail.com',
    displayName: 'Karlos Alvarez',
    points: 520,
    reportsCount: 5,
    votesCount: 22,
    badges: ['Inspector Badge', 'Civic Inspector', 'Active Citizen']
  },
  {
    email: 'kondapalliabhinaysaikrishna@gmail.com', // Active User
    displayName: 'Abhinay Sai Krishna (You)',
    points: 120,
    reportsCount: 1,
    votesCount: 4,
    badges: ['First Step', 'Alpha Voter']
  },
  {
    email: 'mclean.ryan@comcast.net',
    displayName: 'Ryan McLean',
    points: 380,
    reportsCount: 3,
    votesCount: 16,
    badges: ['Active Citizen', 'Detail Scout']
  }
];

export const INITIAL_ISSUES: Issue[] = [
  {
    id: 'issue-1',
    title: 'Severe Cracking and Deep Pothole',
    description: 'A deep pothole of about 6 inches in the middle of Oak & Filmore crossing. Cars are driving into the opposing lane to avoid it, presenting an immediate hazard.',
    category: 'pothole',
    imageUrl: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&q=80&w=600',
    lat: 37.7699,
    lng: -122.4468,
    address: 'Oak & Filmore Intersection',
    severity: 'High',
    urgency: 'High',
    urgencyReason: 'Forces active traffic maneuvers, threatening frontal vehicle crashes and tire ruptures during night hours.',
    estimatedCost: '$350 - $600',
    complaintText: `To:\nDepartment of Public Works / Road Maintenance Division\n\nSubject: Urgent Rectification Request - Dangerous Pothole at Oak & Filmore Intersection\n\nDear Commissioner,\n\nWe are writing on behalf of the local neighborhood residents to formally report a critical public infrastructure hazard. A deep pothole measuring approximately 6 inches in depth has developed directly in the middle of the active traffic lane at the Oak & Filmore Intersection.\n\nThis condition poses an immediate danger to community safety. Vehicles are routinely forcing emergency swerves into the opposing lane to avoid tire blown out, creating a severe potential collision hazard. This poses an additional high risk to night commuters and bicyclists due to poor street lighting in this sector.\n\nUnder sovereign public liability statutes, the municipality is responsible for the upkeep and safety of active roadways. We request an immediate inspection and resurfacing of this lane to prevent preventable accidents.\n\nSincerely,\nActive Community Residents`,
    status: 'In Progress',
    reportedAt: '2026-06-21T10:30:00.000Z',
    reportedBy: 'k.alvarez@gmail.com',
    upvotes: 14,
    votedUsers: ['sarah.parks@civic.org', 'mclean.ryan@comcast.net']
  },
  {
    id: 'issue-2',
    title: 'Illegal Hazardous Trash Dumping',
    description: 'Bulk construction debris, chemical paint cans, and household junk dumped along the side of the Lakeview marsh reservation.',
    category: 'garbage',
    imageUrl: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&q=80&w=600',
    lat: 37.8012,
    lng: -122.4255,
    address: '782 Lakeview Blvd (Residential)',
    severity: 'Critical',
    urgency: 'Immediate',
    urgencyReason: 'Involves toxic chemical cans next to a public watershed marsh, representing an imminent environmental health threat.',
    estimatedCost: '$800 - $1200',
    complaintText: `To:\nEnvironmental Health and Sanitation Department\n\nSubject: Formal Complaint - Major Illegal Hazardous Waste Dumping\n\nDear Commissioner,\n\nThis letter is to request emergency municipal intervention for a major illegal waste dump in our community. Bulk construction debris, discarded household furniture, and most concerning, leaking industrial paint and chemical canisters have been illegally emptied on the shoreline at 782 Lakeview Blvd, adjacent to our local marsh ecosystem.\n\nFailure to clear this hazard immediately will result in chemical runoff entering the watershed, affecting local water quality and wildlife. Furthermore, the stack blocks pedestrian sidewalks, prompting unsafe conditions.\n\nPlease mobilize the sanitation clearing unit immediately, enforce trespass/illegal dumping cameras, and prosecute the offenders.\n\nSincerely,\nCivic Environmental Committee`,
    status: 'Verified',
    reportedAt: '2026-06-22T06:15:00.000Z',
    reportedBy: 'sarah.parks@civic.org',
    upvotes: 28,
    votedUsers: ['voted-1', 'voted-2', 'voted-3']
  }
];
