import React, { useState, useEffect, useRef } from "react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Issue, UserProfile } from "../types";
import { 
  Navigation, 
  AlertTriangle, 
  BellRing, 
  MapPin, 
  Volume2, 
  VolumeX, 
  CheckCircle, 
  ShieldAlert, 
  Map, 
  Info,
  HelpCircle,
  Locate,
  Zap,
  TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Haversine formula helper
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
}

// Preset teleport locations corresponding to key hot areas
const SIMULATION_PRESETS = [
  { name: "Oak & Filmore Intersection (Pothole area)", lat: 37.7710, lng: -122.4455 }, // ~160m from pothole
  { name: "782 Lakeview Blvd (Trash spill area)", lat: 37.7998, lng: -122.4242 },     // ~200m from hazardous dump
  { name: "Downtown Broadway Ave (Streetlight)", lat: 37.7752, lng: -122.4182 },      // Near Broadway Hotspot
  { name: "Far out (No Alerts Simulation)", lat: 37.7000, lng: -122.5000 }
];

export default function NearbyAlerts() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [trackingActive, setTrackingActive] = useState<boolean>(true);
  
  // Default centered location in San Francisco
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 37.7749,
    lng: -122.4194
  });
  
  const [locationSource, setLocationSource] = useState<"gps" | "simulated" | "fallback">("simulated");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  // Track which issues have already triggered an alert to avoid spamming the audio/popup
  const alertedIssuesRef = useRef<Set<string>>(new Set());
  const [recentNotifications, setRecentNotifications] = useState<{ id: string; title: string; desc: string; time: string }[]>([]);

  // Sound generator
  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // First high chime
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.4);
      
      // Secondary supporting chime
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1318.51, audioCtx.currentTime); // E6 note
        gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.5);
      }, 120);

    } catch (e) {
      console.warn("Audio Context blocked or failed:", e);
    }
  };

  // 1. Fetch unresolved issues from Firestore
  useEffect(() => {
    const q = query(collection(db, "issues"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const issuesList: Issue[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Issue;
        // Map unresolved issues
        if (data.status !== "Resolved") {
          issuesList.push({ ...data, id: doc.id });
        }
      });
      setIssues(issuesList);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "issues");
    });

    return () => unsubscribe();
  }, []);

  // 2. Real Geolocation Tracking Handler
  useEffect(() => {
    if (!trackingActive) return;

    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser");
      setLocationSource("fallback");
      return;
    }

    setGpsError(null);
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationSource("gps");
      },
      (error) => {
        console.warn("GPS tracking error (common inside iframe sandboxes):", error.message);
        setGpsError(error.code === 1 ? "Permission Denied" : "GPS Signal Timeout");
        // Fall back to current coordinates but mark as simulated/fallback
        if (locationSource === "gps") {
          setLocationSource("simulated");
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingActive]);

  // 3. Compute distances & trigger alerts when issues enter 500m
  const nearbyIssues = issues.map(issue => {
    const distance = getDistanceMeters(userCoords.lat, userCoords.lng, issue.lat, issue.lng);
    const isUnverified = issue.status === "Reported";
    const isHighPriority = 
      ["High", "Critical"].includes(issue.severity) || 
      ["High", "Immediate"].includes(issue.urgency);
    
    return {
      issue,
      distance,
      isUnverified,
      isHighPriority,
      isNearby: distance <= 500
    };
  }).filter(item => item.isNearby)
    .sort((a, b) => a.distance - b.distance);

  // Monitor list changes and trigger sound + alert feed update
  useEffect(() => {
    if (nearbyIssues.length === 0) return;

    let triggeredNew = false;
    nearbyIssues.forEach(({ issue, distance }) => {
      if (!alertedIssuesRef.current.has(issue.id)) {
        alertedIssuesRef.current.add(issue.id);
        triggeredNew = true;

        // Push to local notification lists
        setRecentNotifications(prev => [
          {
            id: `${issue.id}-${Date.now()}`,
            title: `Nearby Civic Alert! (${distance}m)`,
            desc: `"${issue.title}" requires citizen verification or immediate municipal attention.`,
            time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          },
          ...prev.slice(0, 4) // keep last 5 alerts
        ]);
      }
    });

    if (triggeredNew) {
      playAlertSound();
    }
  }, [nearbyIssues]);

  const handleTeleport = (preset: typeof SIMULATION_PRESETS[0]) => {
    setLocationSource("simulated");
    setUserCoords({ lat: preset.lat, lng: preset.lng });
    // Reset alert tracking list so you can re-trigger sounds when testing different zones
    alertedIssuesRef.current.clear();
  };

  return (
    <div id="nearby-alerts-widget" className="bg-white rounded-2xl border border-[#D9D2C5] p-5 shadow-sm space-y-4">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between border-b border-[#D9D2C5]/50 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Navigation className={`w-4.5 h-4.5 text-[#5A5A40] ${locationSource === "gps" ? "animate-spin" : ""}`} />
            {nearbyIssues.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-mono text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold animate-pulse">
                {nearbyIssues.length}
              </span>
            )}
          </div>
          <div>
            <h4 className="font-serif font-black text-xs text-[#2D2D24] uppercase tracking-wider">
              Local Spatial Ranger
            </h4>
            <p className="text-[9px] text-[#8A8A7A] font-semibold uppercase font-mono">
              500m Safety & Action Alerts
            </p>
          </div>
        </div>

        {/* Audio feedback switcher */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            soundEnabled 
              ? "bg-[#FCFAF2] border-amber-200 text-[#5A5A40] hover:bg-amber-50" 
              : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"
          }`}
          title={soundEnabled ? "Mute audio warning cues" : "Enable acoustic warning bells"}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* TRACKING TELEMETRY SUB-CARD */}
      <div className="bg-[#FBFBFA] border border-[#D9D2C5]/70 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-mono text-[#8A8A7A]">GPS TRACKER STATE</span>
          <div className="flex items-center gap-1.5 font-bold">
            <span className={`w-2 h-2 rounded-full ${
              locationSource === "gps" 
                ? "bg-emerald-500 animate-ping" 
                : locationSource === "simulated" 
                  ? "bg-amber-500 animate-pulse" 
                  : "bg-gray-400"
            }`} />
            <span className={`uppercase font-mono text-[9px] ${
              locationSource === "gps" 
                ? "text-emerald-700 font-black" 
                : "text-amber-800"
            }`}>
              {locationSource === "gps" ? "Active Satellite Link" : "Simulated / Hotspot"}
            </span>
          </div>
        </div>

        <div className="bg-white border border-[#D9D2C5]/40 p-2.5 rounded-lg flex items-center justify-between gap-3 text-[10.5px]">
          <div className="space-y-0.5">
            <p className="font-semibold text-[#2D2D24] flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#5A5A40]" />
              <span>Current Coordinates:</span>
            </p>
            <p className="font-mono text-[#6B6B5B] text-[9.5px]">
              {userCoords.lat.toFixed(5)}°N , {userCoords.lng.toFixed(5)}°W
            </p>
          </div>
          
          <button
            onClick={() => {
              setTrackingActive(!trackingActive);
              if (!trackingActive) setLocationSource("simulated");
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-black border transition-all cursor-pointer ${
              trackingActive 
                ? "bg-white text-rose-700 hover:bg-rose-50 border-rose-200" 
                : "bg-[#5A5A40] text-white hover:bg-[#4A4A33] border-transparent"
            }`}
          >
            {trackingActive ? "STOP GPS" : "START GPS"}
          </button>
        </div>

        {gpsError && (
          <div className="text-[8.5px] bg-rose-50 border border-rose-200/50 rounded-lg p-2 text-rose-700 flex items-start gap-1.5 leading-normal">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
            <div>
              <strong>GPS Constraint:</strong> {gpsError}. Enable browser location or use the simulation teleport deck below to test seamlessly inside this sandbox.
            </div>
          </div>
        )}
      </div>

      {/* DETECTED THREATS / ISSUES LIST */}
      <div className="space-y-2">
        <span className="block text-[8.5px] font-mono font-bold text-[#8A8A7A] uppercase tracking-wider">
          Nearby Alerts In Range (500 Meters)
        </span>

        {nearbyIssues.length === 0 ? (
          <div className="bg-[#FFFDF9] border border-amber-200/40 rounded-xl p-4 text-center space-y-1">
            <p className="text-[14px]">✨</p>
            <p className="font-bold text-[10.5px] text-amber-900">Zero active hazards near you!</p>
            <p className="text-[9px] text-[#8A8A7A] max-w-[210px] mx-auto leading-normal">
              No unverified or critical issues found in your 500m perimeter. Click a simulated zone below to walk around San Francisco!
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[175px] overflow-y-auto pr-1">
            <AnimatePresence>
              {nearbyIssues.map(({ issue, distance, isUnverified, isHighPriority }) => (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  key={issue.id}
                  className={`border rounded-xl p-3 space-y-2 relative transition-all shadow-3xs ${
                    isHighPriority 
                      ? "bg-rose-50/50 border-rose-200/60" 
                      : "bg-[#FCFAF2] border-amber-200"
                  }`}
                >
                  {/* Status header badges */}
                  <div className="flex items-center justify-between text-[9px]">
                    <div className="flex items-center gap-1">
                      {isHighPriority && (
                        <span className="bg-rose-100 text-rose-800 border border-rose-300 font-extrabold px-1.5 py-0.2 rounded uppercase text-[8px] animate-pulse">
                          🚨 Critical
                        </span>
                      )}
                      {isUnverified && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold px-1.5 py-0.2 rounded uppercase text-[8px]">
                          📝 Unverified
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-black text-slate-800">
                      📍 {distance} meters away
                    </span>
                  </div>

                  {/* Title & category */}
                  <div className="space-y-0.5">
                    <h5 className="font-serif font-black text-[10.5px] text-[#2D2D24] truncate leading-snug pr-8">
                      {issue.title}
                    </h5>
                    <p className="text-[8.5px] text-[#8A8A7A] truncate font-mono">
                      Category: <strong className="text-[#5A5A40] uppercase">{issue.category}</strong> • {issue.address}
                    </p>
                  </div>

                  {/* Action verification / support block */}
                  <div className="flex items-center justify-between border-t border-[#D9D2C5]/30 pt-2 text-[9px] mt-1.5">
                    <span className="text-[#8A8A7A] italic">Verify site to claim +15 XP</span>
                    <span className="font-bold text-[#5A5A40] underline hover:text-emerald-700 cursor-pointer flex items-center gap-0.5">
                      Check Detail <TrendingUp className="w-3 h-3" />
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* SIMULATOR CONTROLS */}
      <div className="bg-[#F2F0E9]/60 border border-[#D9D2C5]/60 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-[#5A5A40]" />
          <span className="text-[9px] font-mono font-black text-[#5A5A40] uppercase tracking-wide">
            Iframe Simulator Teleport Deck
          </span>
        </div>
        
        <p className="text-[8.5px] text-[#6B6B5B] leading-normal font-sans">
          Since sandbox limits can hinder raw satellite tracking, click below to teleport your coordinates instantly and test alerts!
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {SIMULATION_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => handleTeleport(preset)}
              className="text-[8.5px] font-medium font-mono text-left bg-white border border-[#D9D2C5] hover:bg-[#FBFBFA] hover:border-[#5A5A40] text-[#3D3D33] p-1.5 rounded-lg transition-all cursor-pointer truncate shadow-3xs"
              title={`Simulate coordinate: ${preset.lat}, ${preset.lng}`}
            >
              🚀 {preset.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* RECENT NOTIFICATIONS LOGGER */}
      {recentNotifications.length > 0 && (
        <div className="space-y-1.5 border-t border-[#D9D2C5]/40 pt-3">
          <span className="text-[8.5px] font-mono font-bold text-[#8A8A7A] uppercase tracking-wider flex items-center gap-1">
            <BellRing className="w-3 h-3 text-rose-500 animate-bounce" />
            <span>Alert Audit History</span>
          </span>
          <div className="space-y-1 max-h-[80px] overflow-y-auto">
            {recentNotifications.map(n => (
              <div key={n.id} className="text-[8.5px] bg-[#FCFAF2] p-1.5 rounded border border-[#D9D2C5]/30 flex justify-between gap-2">
                <p className="text-[#6B6B5B]">
                  <strong className="text-[#2D2D24]">{n.title}:</strong> {n.desc}
                </p>
                <span className="font-mono text-[#8A8A7A] shrink-0 text-[7.5px]">{n.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
