import React, { useEffect, useState, useRef } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Issue } from "../types";
import { Loader2, MapPin, Locate, Compass, History, Clock, Twitter, Linkedin, Share2, AlertTriangle, Megaphone } from "lucide-react";
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";

// API Key configuration following Google Maps Platform Skill Constitution
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface IssuesMapProps {
  selectedCategory: string;
}

// Category design parameters
const CATEGORY_MAP = {
  pothole: { color: "#E11D48", label: "Pothole", icon: "🚗" },
  garbage: { color: "#B45309", label: "Garbage", icon: "🗑️" },
  streetlight: { color: "#CA8A04", label: "Streetlight", icon: "💡" },
  leakage: { color: "#1D4ED8", label: "Leakage", icon: "💧" },
  other: { color: "#5A5A40", label: "Other", icon: "📍" },
};

// Status Badge Styling for Popup
const statusColorMap = {
  Reported: "bg-orange-100 text-orange-800 border-orange-200",
  Verified: "bg-blue-100 text-blue-800 border-blue-200",
  Scheduled: "bg-cyan-100 text-cyan-800 border-cyan-200",
  "In Progress": "bg-yellow-100 text-yellow-850 border-yellow-200",
  Resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const isOverdue = (issue: Issue) => {
  if (issue.status === "Resolved") return false;
  
  // Parse estimated resolution time if possible, otherwise default to 72 hours (3 days)
  let limitMs = 72 * 60 * 60 * 1000; // default 72h
  const est = issue.estimatedResolutionTime || "";
  if (est.toLowerCase().includes("24")) limitMs = 24 * 60 * 60 * 1000;
  else if (est.toLowerCase().includes("48")) limitMs = 48 * 60 * 60 * 1000;
  else if (est.toLowerCase().includes("72")) limitMs = 72 * 60 * 60 * 1000;
  else if (est.toLowerCase().includes("12")) limitMs = 12 * 60 * 60 * 1000;

  const reportedTime = new Date(issue.reportedAt).getTime();
  const elapsed = Date.now() - reportedTime;
  return elapsed > limitMs;
};

const getDurationText = (startStr: string, endStr: string) => {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diffMs = end - start;
  if (diffMs < 0) return "0 mins";
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
  
  const diffHours = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours !== 1 ? 's' : ''}${remMins > 0 ? ` ${remMins} min${remMins !== 1 ? 's' : ''}` : ''}`;
  }
  
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}${remHours > 0 ? ` ${remHours} hr${remHours !== 1 ? 's' : ''}` : ''}`;
};

const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // distance in km
  
  if (d < 1) {
    const meters = Math.round(d * 1000);
    return `${meters} m`;
  }
  return `${d.toFixed(2)} km`;
};

// Custom helper component to auto-fit bounds based on displayed markers
function MapFitBounds({ issues, userLocation }: { issues: Issue[], userLocation: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || issues.length === 0 || typeof google === "undefined") return;

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let validCount = 0;
    
    issues.forEach(issue => {
      if (typeof issue.lat === 'number' && typeof issue.lng === 'number') {
        if (issue.lat < minLat) minLat = issue.lat;
        if (issue.lat > maxLat) maxLat = issue.lat;
        if (issue.lng < minLng) minLng = issue.lng;
        if (issue.lng > maxLng) maxLng = issue.lng;
        validCount++;
      }
    });

    if (validCount === 0) return;

    const latSpread = maxLat - minLat;
    const lngSpread = maxLng - minLng;

    // If coordinates are extremely spread out globally (> 15 degrees spread), 
    // zooming out to fit both would zoom out to level 1 and create ugly gaps / repeating worlds.
    // In that case, center the map on the user's location if available, or the most recent issue.
    if (latSpread > 15 || lngSpread > 15) {
      if (userLocation) {
        map.setCenter(userLocation);
        map.setZoom(13);
      } else {
        const latestIssue = issues.find(issue => typeof issue.lat === 'number' && typeof issue.lng === 'number');
        if (latestIssue) {
          map.setCenter({ lat: latestIssue.lat, lng: latestIssue.lng });
          map.setZoom(13);
        }
      }
    } else {
      const bounds = new google.maps.LatLngBounds();
      issues.forEach(issue => {
        if (typeof issue.lat === 'number' && typeof issue.lng === 'number') {
          bounds.extend({ lat: issue.lat, lng: issue.lng });
        }
      });
      map.fitBounds(bounds);
      
      // Prevent bounds fitting from zooming in too tight (e.g., if there's only 1 issue)
      const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() && map.getZoom()! > 16) {
          map.setZoom(16);
        }
      });
    }
  }, [map, issues, userLocation]);

  return null;
}

// Custom controller component to pan map to user location
function MapUserTracker({ userLocation }: { userLocation: { lat: number; lng: number } | null }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (map && userLocation && !hasCentered.current) {
      map.panTo(userLocation);
      map.setZoom(15);
      hasCentered.current = true;
    }
  }, [map, userLocation]);

  const handleRecenter = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRecenter}
      disabled={!userLocation}
      className="absolute top-2.5 right-2 bg-white hover:bg-[#F2F0E9] active:bg-[#E5E2D9] text-[#5A5A40] border border-[#D9D2C5] p-2 rounded-xl shadow-md z-20 transition-all cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed group"
      style={{ minWidth: "36px", minHeight: "36px" }}
      title="Recenter Map on My Accurate Location"
    >
      <Compass className={`w-4.5 h-4.5 ${userLocation ? "text-[#5A5A40] animate-spin-slow" : "text-[#8A8A7A]"}`} />
      <span className="absolute right-11 bg-[#5A5A40] text-white text-[9px] font-bold px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-sans">
        Recenter on My GPS Location
      </span>
    </button>
  );
}

export default function IssuesMap({ selectedCategory }: IssuesMapProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [activePopupTab, setActivePopupTab] = useState<"details" | "campaign" | "timeline">("details");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    setActivePopupTab("details");
  }, [selectedIssue]);

  const handleSocialEscalationShare = async (issue: Issue, platform: 'twitter' | 'linkedin' | 'native' | 'whatsapp') => {
    try {
      const issueRef = doc(db, "issues", issue.id);
      const currentShares = issue.socialSharesCount || 0;
      const newShares = currentShares + 1;

      // Write a comment/log for amplification
      const commentColl = collection(db, "issues", issue.id, "comments");
      const platformNames = {
        twitter: "X / Twitter",
        linkedin: "LinkedIn",
        native: "OS Share Hub (Web Share API)",
        whatsapp: "WhatsApp"
      };
      const cData = {
        userId: "system-amplification",
        userName: "📢 CIVIC AMPLIFIER",
        text: `Public Campaign shared on ${platformNames[platform]} by a citizen from Map Interface. Amplifying visibility to force municipal resolution!`,
        createdAt: new Date().toISOString(),
        isVerification: false
      };
      
      try {
        await updateDoc(issueRef, { socialSharesCount: newShares });
        await setDoc(doc(commentColl), cData);
      } catch (err) {
        console.error("Failed to write amplification tracking comment:", err);
      }

      // Construct platform share links
      const issueLink = `${window.location.origin}${window.location.pathname}?issueId=${issue.id}`;
      const isOverdueFlag = isOverdue(issue);

      const baseText = isOverdueFlag
        ? `⚠️ OVERDUE RESOLUTION TICKET! The critical civic issue "${issue.title}" at ${issue.address} has BREACHED its municipal deadline of ${issue.estimatedResolutionTime || "72 Hours"}! Demanding immediate action! Please amplify: ${issueLink} @District_Collector @MLA_Office`
        : `🚨 CIVIC URGENCY: Unresponsive municipal offices on issue "${issue.title}" at ${issue.address}! Severity: ${issue.severity}. Directing public pressure to local representatives! Please amplify: ${issueLink} @District_Collector @MLA_Office`;

      if (platform === "twitter") {
        const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(baseText)}`;
        window.open(shareUrl, "_blank");
      } else if (platform === "linkedin") {
        const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(issueLink)}`;
        window.open(shareUrl, "_blank");
      } else if (platform === "whatsapp") {
        const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(baseText)}`;
        window.open(shareUrl, "_blank");
      } else if (platform === "native") {
        if (navigator.share) {
          try {
            await navigator.share({
              title: `🚨 URGENT CIVIC ISSUE: ${issue.title}`,
              text: baseText,
              url: issueLink
            });
          } catch (shareErr) {
            console.warn("Web Share API cancelled or failed:", shareErr);
            try {
              await navigator.clipboard.writeText(issueLink);
              alert("Native share dismissed. Campaign link has been copied to your clipboard!");
            } catch (clipErr) {
              console.error(clipErr);
            }
          }
        } else {
          try {
            await navigator.clipboard.writeText(issueLink);
            alert("Web Share API is not supported on this browser or preview sandbox. Campaign link has been copied to your clipboard!");
          } catch (clipErr) {
            console.error(clipErr);
          }
        }
      }

      alert(`📢 Amplification tracker registered! Public campaign share initiated on ${platformNames[platform]}. You earned +15 Citizen XP and boosted issue priority!`);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Track citizen's accurate real-time GPS location
  useEffect(() => {
    if (!navigator.geolocation) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      (err) => {
        console.warn("Real-time map location tracking error:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Subscribe to Live Firestore Issues Data
  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("reportedAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Issue[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Issue);
      });
      setIssues(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "issues");
    });

    return () => unsubscribe();
  }, []);

  // Filter issues based on category prop
  const filteredIssues = selectedCategory === "all" 
    ? issues 
    : issues.filter(issue => issue.category === selectedCategory);

  // If there's no valid API Key, show the user instructions on how to set it up
  if (!hasValidKey) {
    return (
      <div id="interactive-issues-map-root" className="bg-white rounded-2xl border border-[#D9D2C5] p-4 shadow-sm relative overflow-hidden flex flex-col h-[340px] md:h-[400px] lg:h-[460px] xl:h-[520px]">
        {/* MAP TITLE BLOCK */}
        <div className="flex items-center justify-between border-b border-[#D9D2C5] pb-2 mb-3">
          <h4 className="font-serif font-bold text-xs text-[#2D2D24] uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#5A5A40]" />
            <span>Interactive Incident Matrix</span>
          </h4>
          <span className="text-[9px] font-mono font-bold bg-[#F2F0E9] border border-[#D9D2C5] text-[#5A5A40] px-1.5 py-0.5 rounded-full">
            0 active nodes
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#FBFBFA] border border-[#D9D2C5]/70 rounded-xl overflow-y-auto">
          <h5 className="font-serif font-bold text-xs text-[#2D2D24] mb-2 uppercase tracking-wide text-center">
            Google Maps API Key Required
          </h5>
          <p className="text-[11px] text-[#6B6B5B] text-center mb-3 max-w-[400px] leading-relaxed">
            Please add your Google Maps Platform API key in AI Studio Secrets to unlock the interactive live tracking matrix.
          </p>
          <div className="text-[10px] text-[#5A5A40] bg-white border border-[#D9D2C5] rounded-lg p-3 space-y-1.5 max-w-[420px] leading-relaxed">
            <p><strong>1. Get an API Key:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-[#C8A97E] underline font-bold hover:text-[#5A5A40]">Get key on Cloud Console</a></p>
            <p><strong>2. Configure in AI Studio:</strong></p>
            <ul className="list-disc pl-4 space-y-0.5 font-medium text-[#6B6B5B]">
              <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
              <li>Select <strong>Secrets</strong></li>
              <li>Add a secret with name <code className="bg-[#F2F0E9] px-1 py-0.5 rounded text-xs font-mono select-all">GOOGLE_MAPS_PLATFORM_KEY</code></li>
              <li>Paste your API key as the value and click save</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="interactive-issues-map-root" className="bg-white rounded-2xl border border-[#D9D2C5] p-4 shadow-sm relative overflow-hidden flex flex-col h-[340px] md:h-[400px] lg:h-[460px] xl:h-[520px]">
      
      {/* Inline styles for custom premium map marker animation classes */}
      <style>{`
        @keyframes civicMarkerBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @keyframes civicMarkerPulse {
          0% {
            transform: scale(0.6);
            opacity: 0.9;
          }
          100% {
            transform: scale(2.0);
            opacity: 0;
          }
        }
        .civic-marker-active {
          animation: civicMarkerBounce 0.9s infinite ease-in-out;
        }
        .civic-marker-pulse-ring {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          animation: civicMarkerPulse 1.4s infinite ease-out;
          pointer-events: none;
          z-index: 1;
        }
        /* Custom hover animations and transitions for map markers */
        .civic-marker-container {
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.3s ease;
          transform-origin: bottom center;
        }
        .civic-marker-container:hover {
          transform: translateY(-6px) scale(1.15);
          filter: drop-shadow(0 12px 16px rgba(0,0,0,0.28));
          z-index: 99;
        }
        .civic-marker-pin-effect {
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.3s ease, box-shadow 0.3s ease;
        }
        .civic-marker-container:hover .civic-marker-pin-effect {
          transform: scale(1.1);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
        }
        @keyframes civicMarkerHoverPulse {
          0% {
            transform: scale(0.6);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
        .civic-marker-hover-pulse {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .civic-marker-container:hover .civic-marker-hover-pulse {
          opacity: 1;
          animation: civicMarkerHoverPulse 1.2s infinite ease-out;
        }
      `}</style>
      
      {/* MAP TITLE BLOCK */}
      <div className="flex items-center justify-between border-b border-[#D9D2C5] pb-2 mb-3">
        <h4 className="font-serif font-bold text-xs text-[#2D2D24] uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-[#5A5A40]" />
          <span>Interactive Incident Matrix</span>
        </h4>
        <div className="flex items-center gap-1.5">
          {userLocation ? (
            <span className="text-[9px] font-mono font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              Live GPS Active
            </span>
          ) : (
            <span className="text-[9px] font-mono font-bold bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Locating...
            </span>
          )}
          <span className="text-[9px] font-mono font-bold bg-[#F2F0E9] border border-[#D9D2C5] text-[#5A5A40] px-1.5 py-0.5 rounded-full">
            {filteredIssues.length} active nodes
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#8A8A7A]">
          <Loader2 className="w-8 h-8 text-[#5A5A40] animate-spin mb-2" />
          <p className="text-[11px] font-bold uppercase tracking-wider">Projecting Incident Matrix...</p>
        </div>
      ) : (
        <div className="flex-1 relative rounded-xl overflow-hidden border border-[#D9D2C5]/70 shadow-inner">
          
          <APIProvider apiKey={API_KEY} version="weekly">
            <Map
              defaultCenter={{ lat: 37.7749, lng: -122.4194 }}
              defaultZoom={13}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              disableDefaultUI={false}
              gestureHandling="cooperative"
            >
              {/* Dynamic Auto-Fitting component */}
              <MapFitBounds issues={filteredIssues} userLocation={userLocation} />

              {/* User Real-Time Tracker and Recenter Control */}
              <MapUserTracker userLocation={userLocation} />

              {/* User's Live Accurate GPS Location marker */}
              {userLocation && (
                <AdvancedMarker
                  position={userLocation}
                  title="Your Live Accurate GPS Position"
                >
                  <div className="relative flex items-center justify-center" style={{ width: '28px', height: '28px', zIndex: 100 }}>
                    {/* Ring Pulsing Accent */}
                    <span className="absolute inline-flex h-7 w-7 rounded-full bg-blue-500 opacity-60 animate-ping" />
                    {/* Outer border/ring */}
                    <div className="relative w-4.5 h-4.5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                  </div>
                </AdvancedMarker>
              )}

              {/* Render Advanced Markers */}
              {filteredIssues.map((issue) => {
                if (typeof issue.lat !== 'number' || typeof issue.lng !== 'number') return null;
                const catInfo = CATEGORY_MAP[issue.category] || CATEGORY_MAP.other;
                const isSelected = selectedIssue?.id === issue.id;

                return (
                  <AdvancedMarker
                    key={issue.id}
                    position={{ lat: issue.lat, lng: issue.lng }}
                    onClick={() => setSelectedIssue(issue)}
                  >
                    <div className={`relative group/marker flex items-center justify-center cursor-pointer civic-marker-container ${isSelected ? "civic-marker-active" : ""}`} style={{ width: '32px', height: '32px' }}>
                      
                      {/* Pulse Ring when Selected or Hovered */}
                      {isSelected ? (
                        <div className="civic-marker-pulse-ring" style={{ backgroundColor: catInfo.color }} />
                      ) : (
                        <div className="civic-marker-hover-pulse" style={{ backgroundColor: catInfo.color }} />
                      )}

                      {/* Hover Tooltip Box */}
                      <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-250 z-50 ${
                        isSelected 
                          ? "opacity-100 translate-y-0 scale-100 animate-fade-in" 
                          : "opacity-0 group-hover/marker:opacity-100 translate-y-1.5 group-hover/marker:translate-y-0 scale-95 group-hover/marker:scale-100"
                      }`}>
                        <div className="bg-white text-[#3D3D33] border border-[#D9D2C5] rounded-xl shadow-xl p-2 w-44 flex flex-col gap-1.5 text-[10px] leading-tight select-none">
                          <div className="flex items-center justify-between gap-1.5 border-b border-[#D9D2C5]/50 pb-1">
                            <span className="font-bold text-[8px] uppercase tracking-wider text-[#8A8A7A]">
                              {catInfo.label}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold border uppercase tracking-wider ${statusColorMap[issue.status] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                              {issue.status}
                            </span>
                          </div>
                          <span className="font-serif font-black text-[10px] text-[#2D2D24] truncate block w-full">{issue.title}</span>
                          
                          {userLocation && (
                            <div className="text-[8px] font-mono font-bold text-blue-600 bg-blue-50/75 border border-blue-100 rounded px-1.5 py-0.5 flex items-center justify-between">
                              <span className="uppercase tracking-wider">Distance:</span>
                              <span>{getHaversineDistance(userLocation.lat, userLocation.lng, issue.lat, issue.lng)}</span>
                            </div>
                          )}
                          
                          {/* Thumbnail Image */}
                          {issue.imageUrl ? (
                            <div 
                              onClick={() => setLightboxImage({ url: issue.imageUrl, title: issue.title })}
                              className="w-full h-14 rounded overflow-hidden border border-[#D9D2C5]/50 bg-[#FBFBFA] cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              <img src={issue.imageUrl} className="w-full h-full object-cover" alt="thumbnail" referrerPolicy="no-referrer" />
                            </div>
                          ) : (
                            <div className="w-full h-10 flex items-center justify-center rounded bg-[#F8F9F4] border border-[#D9D2C5]/30 text-[#8A8A7A] text-[8px] font-medium italic">
                              No Attached Media
                            </div>
                          )}
                        </div>
                        {/* Down Arrow Indicator */}
                        <div className="w-2 h-2 bg-white border-b border-r border-[#D9D2C5] rotate-45 -mt-1 shadow-sm"></div>
                      </div>

                      {/* Main Pin Graphics */}
                      <div className="absolute w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-md transition-all group-hover/marker:scale-110 civic-marker-pin-effect" 
                           style={{ backgroundColor: catInfo.color, color: 'white', fontSize: '11px', zIndex: 10 }}>
                        {catInfo.icon}
                      </div>
                      <div className="absolute -bottom-1 w-2.5 h-2.5 rotate-45 border-b border-r border-white shadow-md transition-all group-hover/marker:scale-110 animate-fade-in civic-marker-pin-effect" 
                           style={{ backgroundColor: catInfo.color, zIndex: 5 }}></div>
                      <div className="absolute -bottom-2 w-1.5 h-1.5 rounded-full bg-slate-900/30 blur-[1px]"></div>
                    </div>
                  </AdvancedMarker>
                );
              })}

              {/* Render Popup InfoWindow */}
              {selectedIssue && (() => {
                const activeIssue = issues.find(i => i.id === selectedIssue.id) || selectedIssue;
                const isOverdueFlag = isOverdue(activeIssue);

                return (
                  <InfoWindow
                    position={{ lat: activeIssue.lat, lng: activeIssue.lng }}
                    onCloseClick={() => setSelectedIssue(null)}
                  >
                    <div className="p-1 min-w-[270px] max-w-[310px] text-[#3D3D33] font-sans antialiased leading-tight select-text">
                      {/* Category and Status header */}
                      <div className="flex items-center justify-between gap-1.5 border-b border-[#D9D2C5]/70 pb-1.5 mb-2">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase tracking-wider text-[#8A8A7A]">
                            {CATEGORY_MAP[activeIssue.category]?.label || "Other"}
                          </span>
                          {userLocation && (
                            <span className="text-[8.5px] font-mono font-bold text-blue-600 flex items-center gap-1 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              {getHaversineDistance(userLocation.lat, userLocation.lng, activeIssue.lat, activeIssue.lng)} away
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 font-sans">
                          {isOverdueFlag && (
                            <span className="inline-block text-[8px] font-black bg-rose-100 text-rose-700 border border-rose-200 px-1 py-0.5 rounded animate-pulse">
                              OVERDUE
                            </span>
                          )}
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            statusColorMap[activeIssue.status] || "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                            {activeIssue.status}
                          </span>
                        </div>
                      </div>

                      {/* Tab Buttons inside Popup */}
                      <div className="flex border-b border-[#D9D2C5]/50 pb-1.5 mb-2.5 gap-1 select-none">
                        <button
                          type="button"
                          onClick={() => setActivePopupTab("details")}
                          className={`flex-1 py-1 text-[9px] font-bold rounded text-center transition-all cursor-pointer ${
                            activePopupTab === "details"
                              ? "bg-[#5A5A40] text-white shadow-3xs"
                              : "bg-[#F8F9F4] text-[#6B6B5B] hover:bg-[#E5E2D9]"
                          }`}
                        >
                          Overview
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePopupTab("campaign")}
                          className={`flex-1 py-1 text-[9px] font-bold rounded text-center transition-all cursor-pointer ${
                            activePopupTab === "campaign"
                              ? "bg-[#5A5A40] text-white shadow-3xs"
                              : "bg-[#F8F9F4] text-[#6B6B5B] hover:bg-[#E5E2D9]"
                          }`}
                        >
                          Share Campaign
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePopupTab("timeline")}
                          className={`flex-1 py-1 text-[9px] font-bold rounded text-center transition-all cursor-pointer ${
                            activePopupTab === "timeline"
                              ? "bg-[#5A5A40] text-white shadow-3xs"
                              : "bg-[#F8F9F4] text-[#6B6B5B] hover:bg-[#E5E2D9]"
                          }`}
                        >
                          Timeline ({activeIssue.statusHistory?.length || 1})
                        </button>
                      </div>

                      {/* TAB CONTENT: DETAILS */}
                      {activePopupTab === "details" && (
                        <div className="space-y-2">
                          <h4 className="font-serif font-bold text-xs text-[#2D2D24] mb-0.5 line-clamp-2">{activeIssue.title}</h4>
                          <p className="text-[10px] text-[#6B6B5B] leading-relaxed max-h-[60px] overflow-y-auto pr-1">
                            {activeIssue.description}
                          </p>
                          
                          {activeIssue.imageUrl && (
                            <div 
                              onClick={() => setLightboxImage({ url: activeIssue.imageUrl, title: activeIssue.title })}
                              className="w-full h-20 rounded border border-[#D9D2C5]/60 overflow-hidden bg-slate-50 cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              <img src={activeIssue.imageUrl} className="w-full h-full object-cover" alt="Issue Attachment" referrerPolicy="no-referrer" />
                            </div>
                          )}

                          {isOverdueFlag && (
                            <div className="bg-rose-50 border border-rose-200 rounded p-1.5 text-[8.5px] text-rose-800 leading-normal flex gap-1 items-start shadow-3xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                              <div>
                                <span className="font-bold text-rose-950 uppercase block">Resolution Overdue SLA Breach!</span>
                                <span>Breached its municipal deadline of {activeIssue.estimatedResolutionTime || "72 Hours"}. Share this case to apply civic pressure!</span>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-1.5 bg-[#F8F9F4] p-1.5 rounded border border-[#D9D2C5] text-[9.5px]">
                            <span className="font-semibold text-[#8A8A7A]">🔥 {activeIssue.upvotes || 0} Neighbor Votes</span>
                            <span className="font-mono text-[#5A5A40] font-bold uppercase tracking-wider">{activeIssue.severity} Severity</span>
                          </div>
                        </div>
                      )}

                      {/* TAB CONTENT: CAMPAIGN */}
                      {activePopupTab === "campaign" && (
                        <div className="space-y-2 select-none">
                          <div className="text-center pb-1">
                            <span className="text-[8.5px] font-mono text-[#8A8A7A] uppercase tracking-wider block font-bold">Public Campaign Hub</span>
                            <span className="text-[10px] text-[#6B6B5B]">Mobilize community members to speed up municipal action.</span>
                          </div>

                          {isOverdueFlag && (
                            <div className="bg-rose-50 border border-rose-200 rounded p-1.5 text-[8.5px] text-rose-800 flex gap-1 items-start leading-snug">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                              <span>This ticket is <strong>OVERDUE</strong>. Shared campaigns will highlight this breach directly to pressure local authority offices!</span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => handleSocialEscalationShare(activeIssue, 'twitter')}
                              className="py-1.5 px-2 bg-black hover:bg-slate-900 text-white text-[9.5px] font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                            >
                              <Twitter className="w-3 h-3 text-white shrink-0" />
                              <span>Post Campaign on Twitter</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSocialEscalationShare(activeIssue, 'linkedin')}
                              className="py-1.5 px-2 bg-[#0077B5] hover:bg-[#00669c] text-white text-[9.5px] font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                            >
                              <Linkedin className="w-3 h-3 text-white shrink-0" />
                              <span>Publish on LinkedIn</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSocialEscalationShare(activeIssue, 'native')}
                              className="py-1.5 px-2 bg-[#5A5A40] hover:bg-[#4a4a33] text-white text-[9.5px] font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                            >
                              <Share2 className="w-3 h-3 text-white shrink-0" />
                              <span>Launch Web Share API (OS)</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB CONTENT: TIMELINE */}
                      {activePopupTab === "timeline" && (
                        <div className="space-y-2.5 max-h-[170px] overflow-y-auto pr-1">
                          <div className="flex items-center justify-between border-b border-[#D9D2C5]/50 pb-1">
                            <span className="text-[8.5px] font-mono text-[#8A8A7A] uppercase tracking-wider font-bold">Chronological Audits</span>
                            <span className="text-[8px] font-mono text-emerald-800 bg-emerald-50 px-1 py-0.2 rounded font-bold uppercase">
                              Verified Log
                            </span>
                          </div>

                          <div className="relative pl-3 border-l border-[#D9D2C5] space-y-3 mt-1.5 select-text">
                            {(() => {
                              const history = activeIssue.statusHistory && activeIssue.statusHistory.length > 0 
                                ? activeIssue.statusHistory 
                                : [
                                    {
                                      status: "Reported" as const,
                                      changedAt: activeIssue.reportedAt,
                                      changedBy: "Citizen",
                                      comment: "Issue report submitted and registered in District Metro Zone."
                                    }
                                  ];

                              return history.map((entry, index) => {
                                const isLast = index === history.length - 1;
                                const nextEntry = history[index + 1];
                                const endTime = nextEntry ? nextEntry.changedAt : (activeIssue.status === "Resolved" ? entry.changedAt : new Date().toISOString());
                                const duration = getDurationText(entry.changedAt, endTime);
                                const isCurrent = isLast && activeIssue.status !== "Resolved";

                                return (
                                  <div key={index} className="relative text-[9.5px]">
                                    {/* Small Dot */}
                                    <div className={`absolute -left-[18.5px] top-1 w-2 h-2 rounded-full border ${
                                      isCurrent 
                                        ? "bg-amber-500 border-white ring-1 ring-amber-300 animate-pulse" 
                                        : entry.status === "Resolved"
                                          ? "bg-emerald-600 border-white"
                                          : "bg-[#5A5A40] border-white"
                                    }`} />

                                    <div className="space-y-0.5">
                                      <div className="flex flex-wrap items-center gap-1 font-mono">
                                        <span className="font-extrabold text-[#2D2D24] text-[8.5px] uppercase bg-[#E5E2D9]/50 px-1 py-0.1 rounded border border-[#D9D2C5]/30">
                                          {entry.status}
                                        </span>
                                        <span className="text-[8px] text-[#8A8A7A]">
                                          by <span className="font-semibold text-[#5A5A40]">{entry.changedBy}</span>
                                        </span>
                                      </div>

                                      <p className="text-[9px] text-[#6B6B5B] leading-relaxed italic bg-[#FBFBFA] border border-[#D9D2C5]/30 p-1.5 rounded-md">
                                        "{entry.comment || `Issue status shifted to ${entry.status}.`}"
                                      </p>

                                      <div className="text-[7.5px] text-[#8A8A7A] font-mono flex items-center justify-between">
                                        <span>{new Date(entry.changedAt).toLocaleString()}</span>
                                        <span className="font-bold text-amber-900 bg-amber-50/50 border border-amber-100 px-1 rounded flex items-center gap-0.5 scale-95 origin-right">
                                          <Clock className="w-2 h-2 text-amber-600 shrink-0" />
                                          {entry.status === "Resolved"
                                            ? "Resolved"
                                            : isCurrent 
                                              ? `${duration} (Active)` 
                                              : `${duration}`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </InfoWindow>
                );
              })()}
            </Map>
          </APIProvider>

          {/* Floating Brief Tooltip Summary Card overlayed directly on the map interface */}
          {selectedIssue && (
            <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-md border border-[#D9D2C5] p-3 rounded-xl shadow-lg z-20 max-w-[210px] animate-fade-in text-[#3D3D33] select-none flex flex-col gap-1.5 pointer-events-auto">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[8px] font-mono font-extrabold text-[#8A8A7A] uppercase tracking-wider flex items-center gap-1">
                  📍 Active Incident HUD
                </span>
                <button 
                  type="button"
                  onClick={() => setSelectedIssue(null)}
                  className="text-[#8A8A7A] hover:text-[#5A5A40] text-[10px] font-bold p-0.5 cursor-pointer leading-none transition-colors"
                  title="Dismiss HUD"
                >
                  ✕
                </button>
              </div>
              <div>
                <h5 className="font-serif font-extrabold text-xs text-[#2D2D24] line-clamp-1 leading-normal">
                  {selectedIssue.title}
                </h5>
                <p className="text-[9.5px] text-[#6B6B5B] line-clamp-2 leading-relaxed mt-0.5">
                  {selectedIssue.description}
                </p>
              </div>
              <div className="flex items-center justify-between gap-1.5 border-t border-[#D9D2C5]/50 pt-1.5 mt-0.5 text-[9px]">
                <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-extrabold border uppercase tracking-wider ${statusColorMap[selectedIssue.status] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                  {selectedIssue.status}
                </span>
                <span className="font-mono text-[#5A5A40] font-bold">
                  🔥 {selectedIssue.upvotes || 0} Votes
                </span>
              </div>
            </div>
          )}
          
          {/* Custom controls overlay legend */}
          <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-xs border border-[#D9D2C5] p-2 rounded-xl text-[9.5px] z-20 shadow-md font-semibold flex flex-col md:flex-row md:items-center gap-2 md:gap-3 max-w-[280px] md:max-w-none">
            <span className="text-[8.5px] font-bold text-[#8A8A7A] uppercase tracking-wider block border-b md:border-b-0 md:border-r border-[#D9D2C5] pb-1 md:pb-0 md:pr-2">Map Legend</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48] inline-block shadow-3xs"></span>
                <span className="text-[#3D3D33] font-mono font-medium">Pothole (🚗)</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B45309] inline-block shadow-3xs"></span>
                <span className="text-[#3D3D33] font-mono font-medium">Garbage (🗑️)</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#CA8A04] inline-block shadow-3xs"></span>
                <span className="text-[#3D3D33] font-mono font-medium">Streetlight (💡)</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8] inline-block shadow-3xs"></span>
                <span className="text-[#3D3D33] font-mono font-medium">Leakage (💧)</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#5A5A40] inline-block shadow-3xs"></span>
                <span className="text-[#3D3D33] font-mono font-medium">Other (📍)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN GORGEOUS ZERO-GAP IMAGE LIGHTBOX */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-row items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          {/* Large full-screen blurred background to eliminate any background gaps completely */}
          <div 
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-35 scale-110 pointer-events-none select-none"
            style={{ backgroundImage: `url(${lightboxImage.url})` }}
          />

          {/* Close Button */}
          <button 
            type="button"
            className="absolute top-6 right-6 z-50 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer border border-white/10"
            onClick={() => setLightboxImage(null)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Styled Image Frame - Horizontal Side-by-Side Flex Layout */}
          <div className="relative w-full h-full max-w-7xl max-h-[90vh] p-4 md:p-8 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 z-10" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex-1 flex items-center justify-center w-full h-[60vh] md:h-full">
              <img 
                src={lightboxImage.url} 
                alt={lightboxImage.title} 
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/15 select-none animate-scale-up" 
                referrerPolicy="no-referrer"
              />
            </div>
            
            {lightboxImage.title && (
              <div className="w-full md:w-80 shrink-0 bg-black/80 text-[#F2F0E9] p-6 rounded-2xl border border-white/10 backdrop-blur-md flex flex-col justify-center animate-fade-in text-left">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#C8A97E] mb-2 font-mono block">CIVIC EVIDENCE SOURCE</span>
                <span className="text-xs font-sans font-medium leading-relaxed">{lightboxImage.title}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
