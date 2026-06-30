import React, { useState, useRef, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, doc, setDoc, getDoc } from "firebase/firestore";
import { Issue, UserProfile } from "../types";
import { Camera, MapPin, Sparkles, Loader2, Save, CheckCircle2, Image as ImageIcon, Mic, MicOff, Building2, Clock, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useTranslation } from "../context/LanguageContext";
import { HOTSPOTS } from "../data/mockPoints";

interface ReportIssueProps {
  currentUser: UserProfile;
  onUserUpdate: (updated: UserProfile) => void;
  onSuccess: () => void;
}

// Low-resolution sample images relative to civic problems to trigger the AI analysis cleanly
const SAMPLES = [
  {
    name: "Suburban Pothole",
    category: "pothole",
    url: "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&q=80&w=400"
  },
  {
    name: "Illegal Garbage Pile",
    category: "garbage",
    url: "https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&q=80&w=400"
  },
  {
    name: "Broken Streetlight",
    category: "streetlight",
    url: "https://images.unsplash.com/photo-1508611822467-3aa151d07b9a?auto=format&fit=crop&q=80&w=400"
  },
  {
    name: "Pipeline Water Leakage",
    category: "leakage",
    url: "https://images.unsplash.com/photo-1484950797420-56d10c14c5b3?auto=format&fit=crop&q=80&w=400"
  }
];

const getAnalysisSteps = (isEmerg: boolean) => [
  "Digitizing image pixels & validating MIME type...",
  isEmerg 
    ? "🚨 Scanning for power sparks, heat signatures & gas line leaks..." 
    : "Running convolution neural filters to detect civic damage...",
  isEmerg
    ? "⚠️ Formulating urgent coordinate telemetry dispatch for live rescue..."
    : "Inherent context parsing (Severity, Category, Repair budget estimation...)",
  isEmerg
    ? "⚡ Initiating municipal dispatch high-priority response protocols..."
    : "Formulating official legal complaint letter for municipal administration...",
  "Synchronizing final database schemas of the report..."
];

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export default function ReportIssue({ currentUser, onUserUpdate, onSuccess }: ReportIssueProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [citizenUrgency, setCitizenUrgency] = useState<'Low' | 'Medium' | 'High'>("Medium");
  const [address, setAddress] = useState(HOTSPOTS[0].name);
  const [coords, setCoords] = useState({ lat: HOTSPOTS[0].lat, lng: HOTSPOTS[0].lng });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [dynamicPlaces, setDynamicPlaces] = useState<{ name: string; lat: number; lng: number }[]>(HOTSPOTS);
  const [dynamicSamples, setDynamicSamples] = useState(SAMPLES);
  const [isEmergency, setIsEmergency] = useState(false);
  
  // Speech recognition state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    if (!SpeechRecognitionAPI) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Safari.");
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setDescription((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript}` : transcript;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Speech recognition start failed:", err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Camera state & stream references
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraCapture, setIsCameraCapture] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera stream & speech recognition on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startCamera = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setIsCameraActive(true);
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setCameraError("Camera access denied or device has no camera stream available.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement("canvas");
      const videoWidth = videoRef.current.videoWidth || 640;
      const videoHeight = videoRef.current.videoHeight || 480;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setImagePreview(dataUrl);
        setIsCameraCapture(true);
        setAiAnalysis(null);
        setIsSaved(false);
      }
      stopCamera();
    } catch (err) {
      console.error("Failed to capture image frame:", err);
      alert("Capture failed. Please try uploading a file instead.");
    }
  };

  interface AnalysisResult extends Omit<Issue, "id" | "imageUrl" | "lat" | "lng" | "address" | "reportedAt" | "reportedBy" | "upvotes" | "votedUsers"> {
    isCivicRelated?: boolean;
    nonCivicReason?: string;
  }

  // Storing intermediate AI results before database save
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // --- OFFLINE / AUTO-SYNC SYSTEM ---
  interface OfflineReport {
    tempId: string;
    image: string;
    description: string;
    citizenUrgency: 'Low' | 'Medium' | 'High';
    address: string;
    coords: { lat: number; lng: number };
    reportedAt: string;
    reportedBy: string;
    isEmergency?: boolean;
  }

  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [offlineQueue, setOfflineQueue] = useState<OfflineReport[]>(() => {
    try {
      const stored = localStorage.getItem("civicai_offline_reports");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const syncOfflineReports = async (queueToSync: OfflineReport[]) => {
    if (queueToSync.length === 0 || isSyncing) return;
    setIsSyncing(true);
    setSyncStatus(`Syncing ${queueToSync.length} offline report(s)...`);
    
    let successCount = 0;
    const remainingQueue = [...queueToSync];
    
    for (let i = 0; i < queueToSync.length; i++) {
      const item = queueToSync[i];
      setSyncStatus(`Syncing report ${i + 1}/${queueToSync.length}: Running AI assessment...`);
      try {
        // 1. Call Gemini analysis API to enrich/verify the report details
        const res = await fetch("/api/analyze-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: item.image,
            description: item.description,
            userLocation: item.address,
            citizenUrgency: item.citizenUrgency,
            isEmergency: item.isEmergency
          })
        });

        if (!res.ok) {
          throw new Error("Failed to reach Gemini AI verification service");
        }

        const parsedAnalysis = await res.json();

        // 2. Prepare full Issue structure
        const syncedIssue: Omit<Issue, "id"> = {
          title: parsedAnalysis.title,
          description: item.description || parsedAnalysis.description,
          category: parsedAnalysis.category,
          imageUrl: item.image,
          lat: item.coords.lat,
          lng: item.coords.lng,
          address: item.address,
          severity: parsedAnalysis.severity,
          urgency: item.citizenUrgency,
          urgencyReason: parsedAnalysis.urgencyReason,
          estimatedCost: parsedAnalysis.estimatedCost,
          complaintText: parsedAnalysis.complaintText,
          municipalityName: parsedAnalysis.municipalityName || "",
          municipalityAddress: parsedAnalysis.municipalityAddress || "",
          estimatedResolutionTime: parsedAnalysis.estimatedResolutionTime || "72 Hours",
          status: "Reported",
          reportedAt: item.reportedAt,
          reportedBy: item.reportedBy,
          upvotes: 0,
          votedUsers: [],
          isEmergency: item.isEmergency || false,
          emergencyDispatchSent: item.isEmergency || false,
          statusHistory: [
            {
              status: "Reported",
              changedAt: item.reportedAt,
              changedBy: item.isEmergency ? "Emergency Dispatch" : "Citizen (Offline)",
              comment: item.isEmergency 
                ? "🚨 EMERGENCY HAZARD FLAGGED! Automated high-priority alert triggered and routed to Municipal Emergency Dispatch."
                : "Report originally captured offline and synchronized via CivicAI Auto-Sync Engine."
            },
            ...(item.isEmergency ? [{
              status: "Verified" as const,
              changedAt: item.reportedAt,
              changedBy: "Municipal Dispatch",
              comment: "⚡ Emergency dispatch unit assigned. Field engineers dispatched to coordinate with emergency services."
            }] : [])
          ]
        };

        // 3. Save to Firestore
        await addDoc(collection(db, "issues"), syncedIssue);

        // 4. Update user points (award 100 points per synced report)
        const userDocRef = doc(db, "users", currentUser.email);
        const updatedProfile: UserProfile = {
          ...currentUser,
          points: currentUser.points + 100,
          reportsCount: currentUser.reportsCount + 1,
          badges: currentUser.reportsCount + 1 >= 5 
            ? [...currentUser.badges.filter(b => b !== "Civic Inspector"), "Civic Inspector"]
            : currentUser.reportsCount + 1 >= 1 && !currentUser.badges.includes("First Step")
            ? [...currentUser.badges, "First Step"]
            : currentUser.badges
        };
        
        await setDoc(userDocRef, updatedProfile);
        onUserUpdate(updatedProfile);

        successCount++;
        remainingQueue.shift(); // Remove successfully synced report
        
        // Save intermediate state
        localStorage.setItem("civicai_offline_reports", JSON.stringify(remainingQueue));
        setOfflineQueue([...remainingQueue]);
      } catch (err) {
        console.error("Error syncing offline report:", err);
        setSyncStatus(`Sync paused due to connection issue.`);
        setIsSyncing(false);
        return;
      }
    }
    
    setIsSyncing(false);
    setSyncStatus("");
    if (successCount > 0) {
      alert(`🎉 Auto-Synced ${successCount} offline report(s)! You earned +${successCount * 100} Citizen XP!`);
      onSuccess();
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Trigger auto-sync when network connectivity returns
      const stored = localStorage.getItem("civicai_offline_reports");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.length > 0) {
            syncOfflineReports(parsed);
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check on mount
    if (navigator.onLine) {
      const stored = localStorage.getItem("civicai_offline_reports");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.length > 0) {
            syncOfflineReports(parsed);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleQueueOffline = () => {
    if (!imagePreview) {
      alert("Please capture or upload an issue photo to save offline.");
      return;
    }

    const newOfflineReport: OfflineReport = {
      tempId: Math.random().toString(36).substring(2, 9),
      image: imagePreview,
      description: description || "No manual description provided",
      citizenUrgency: citizenUrgency,
      address: address,
      coords: coords,
      reportedAt: new Date().toISOString(),
      reportedBy: currentUser.email,
      isEmergency: isEmergency
    };

    const newQueue = [...offlineQueue, newOfflineReport];
    localStorage.setItem("civicai_offline_reports", JSON.stringify(newQueue));
    setOfflineQueue(newQueue);
    
    alert("📴 Report captured and saved locally! It has been added to your offline queue and will sync automatically once connectivity is restored.");
    
    // Reset form
    setImagePreview(null);
    setDescription("");
    setAiAnalysis(null);
    setIsSaved(false);
    onSuccess();
  };
  // ----------------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Convert file to Base64
  const handleFileChange = (file: File) => {
    setIsCameraCapture(false);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setAiAnalysis(null); // Clear previous runs
      setIsSaved(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Helper: Load third-party Unsplash URL and convert to Base64 in-browser to circumvent CORS
  const handleSelectSample = async (sampleUrl: string) => {
    setIsCameraCapture(false);
    setLoading(true);
    setAiAnalysis(null);
    setIsSaved(false);
    try {
      const response = await fetch(sampleUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setLoading(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Failed to load sample image directly, setting raw URL", err);
      setImagePreview(sampleUrl); // Fallback to raw URL string
      setLoading(false);
    }
  };

  // Automatically trigger GPS tracking on mount to make live map and nearby locations active immediately
  useEffect(() => {
    handleGetLocation();
  }, []);

  // Browser Geolocation API pull with resilient tiered retry and fallback
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setGpsLoading(true);

    const tryReverseGeocode = async (latitude: number, longitude: number) => {
      const latVal = parseFloat(latitude.toFixed(4));
      const lngVal = parseFloat(longitude.toFixed(4));
      setCoords({ lat: latVal, lng: lngVal });

      let baseName = "";
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          {
            headers: {
              "Accept-Language": "en"
            }
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data && data.display_name) {
            const addrParts = data.display_name.split(",");
            const shortAddr = addrParts.slice(0, 3).join(",").trim();
            setAddress(shortAddr || data.display_name);

            // Extract road or neighborhood for dynamic hotspot creation
            const addr = data.address || {};
            const road = addr.road || addr.suburb || addr.neighbourhood || addr.city || "Nearby Road";
            const area = addr.suburb || addr.neighbourhood || addr.city || "";
            baseName = road + (area ? ` (${area})` : "");
          }
        }
      } catch (err) {
        console.warn("Reverse-geocoding failed or rate limited, falling back to coordinate string", err);
      }

      if (!baseName) {
        baseName = `GPS Block (${latVal}, ${lngVal})`;
      }

      // Generate 5 beautiful dynamic nearby location names to replace the preconfigured static ones in the dropdown selector
      const generatedPlaces = [
        { name: `${baseName} (Primary Crossing)`, lat: latVal, lng: lngVal },
        { name: `Central crossing near ${baseName}`, lat: parseFloat((latVal + 0.0011).toFixed(4)), lng: parseFloat((lngVal - 0.0007).toFixed(4)) },
        { name: `Oak Intersection Blvd (${baseName})`, lat: parseFloat((latVal - 0.0008).toFixed(4)), lng: parseFloat((lngVal + 0.0014).toFixed(4)) },
        { name: `Industrial Zone entry, ${baseName}`, lat: parseFloat((latVal - 0.0020).toFixed(4)), lng: parseFloat((lngVal - 0.0015).toFixed(4)) },
        { name: `Residential Sector Lakeview, ${baseName}`, lat: parseFloat((latVal + 0.0016).toFixed(4)), lng: parseFloat((lngVal + 0.0019).toFixed(4)) }
      ];

      setDynamicPlaces(generatedPlaces);
      
      // Update test samples dynamically to reference these nearby location names
      const customSamples = [
        {
          name: `🚗 Pothole at ${generatedPlaces[1].name.replace("Central crossing near ", "").split(" (")[0]}`,
          category: "pothole",
          url: "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&q=80&w=400"
        },
        {
          name: `🗑️ Garbage near ${generatedPlaces[2].name.replace("Oak Intersection Blvd (", "").replace(")", "").split(" (")[0]}`,
          category: "garbage",
          url: "https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&q=80&w=400"
        },
        {
          name: `💡 Streetlight near ${generatedPlaces[3].name.replace("Industrial Zone entry, ", "").split(" (")[0]}`,
          category: "streetlight",
          url: "https://images.unsplash.com/photo-1508611822467-3aa151d07b9a?auto=format&fit=crop&q=80&w=400"
        },
        {
          name: `💧 Leakage near ${generatedPlaces[4].name.replace("Residential Sector Lakeview, ", "").split(" (")[0]}`,
          category: "leakage",
          url: "https://images.unsplash.com/photo-1484950797420-56d10c14c5b3?auto=format&fit=crop&q=80&w=400"
        }
      ];
      setDynamicSamples(customSamples);

      // Auto-select the first generated nearby location as default active address
      setAddress(generatedPlaces[0].name);
      setGpsLoading(false);
    };

    // Stage 1: High Accuracy, short timeout
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        tryReverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      (err1) => {
        console.warn("Stage 1 GPS retrieval failed, retrying with standard accuracy...", err1);
        
        // Stage 2: Standard Accuracy, longer timeout
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            tryReverseGeocode(pos.coords.latitude, pos.coords.longitude);
          },
          (err2) => {
            console.error("Stage 2 GPS retrieval failed, applying default hotspot fallback", err2);
            
            // Stage 3: Smooth Hotspot fallback
            const fallbackSpot = HOTSPOTS[0];
            setCoords({ lat: fallbackSpot.lat, lng: fallbackSpot.lng });
            setAddress(`${fallbackSpot.name} (Estimated Location)`);
            setGpsLoading(false);
          },
          { enableHighAccuracy: false, timeout: 10000 }
        );
      },
      { enableHighAccuracy: true, timeout: 4000 }
    );
  };

  const handleHotspotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const spot = dynamicPlaces.find(h => h.name === e.target.value);
    if (spot) {
      setCoords({ lat: spot.lat, lng: spot.lng });
      setAddress(spot.name);
    }
  };

  // Call the server API endpoint to run Gemini Vision analysis
  const handleAnalyzeWithAI = async () => {
    if (!imagePreview) {
      alert("Please upload or choose a sample issue image to analyze.");
      return;
    }

    setLoading(true);
    setAnalysisStep(0);
    const steps = getAnalysisSteps(isEmergency);
    const interval = setInterval(() => {
      setAnalysisStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1400);

    try {
      const res = await fetch("/api/analyze-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imagePreview,
          description: description,
          userLocation: address,
          citizenUrgency: citizenUrgency,
          isEmergency: isEmergency
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || "Analysis request failed");
      }

      const parsedData = await res.json();
      setAiAnalysis(parsedData);
    } catch (err: any) {
      alert(`AI Assessment Error: ${err.message || String(err)}`);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  // Save full incident package to firebase under 'issues' collection
  const handleSaveToDatabase = async () => {
    if (!aiAnalysis || !imagePreview) return;

    setLoading(true);
    try {
      const newIssue: Omit<Issue, "id"> = {
        title: aiAnalysis.title,
        description: description || aiAnalysis.description,
        category: aiAnalysis.category,
        imageUrl: imagePreview,
        lat: coords.lat,
        lng: coords.lng,
        address: address,
        severity: aiAnalysis.severity,
        urgency: citizenUrgency, // Prioritize the user's manual categorization
        urgencyReason: aiAnalysis.urgencyReason,
        estimatedCost: aiAnalysis.estimatedCost,
        complaintText: aiAnalysis.complaintText,
        municipalityName: aiAnalysis.municipalityName || "",
        municipalityAddress: aiAnalysis.municipalityAddress || "",
        estimatedResolutionTime: aiAnalysis.estimatedResolutionTime || "72 Hours",
        status: "Reported",
        reportedAt: new Date().toISOString(),
        reportedBy: currentUser.email,
        upvotes: 0,
        votedUsers: [],
        isEmergency: isEmergency,
        emergencyDispatchSent: isEmergency,
        statusHistory: [
          {
            status: "Reported",
            changedAt: new Date().toISOString(),
            changedBy: isEmergency ? "Emergency Dispatch" : "Citizen",
            comment: isEmergency 
              ? "🚨 EMERGENCY HAZARD FLAGGED! Automated high-priority alert triggered and routed to Municipal Emergency Dispatch."
              : "Issue report submitted and verified with Gemini AI."
          },
          ...(isEmergency ? [{
            status: "Verified" as const,
            changedAt: new Date().toISOString(),
            changedBy: "Municipal Dispatch",
            comment: "⚡ Emergency dispatch unit assigned. Field engineers dispatched to coordinate with emergency services."
          }] : [])
        ]
      };

      // Add to Firestore list
      try {
        await addDoc(collection(db, "issues"), newIssue);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "issues");
        throw err;
      }

      // Adjust user's points (awarding 100 points for civic report submission + reports count bump)
      const userDocRef = doc(db, "users", currentUser.email);
      const updatedProfile: UserProfile = {
        ...currentUser,
        points: currentUser.points + 100,
        reportsCount: currentUser.reportsCount + 1,
        badges: currentUser.reportsCount + 1 >= 5 
          ? [...currentUser.badges.filter(b => b !== "Civic Inspector"), "Civic Inspector"]
          : currentUser.reportsCount + 1 >= 1 && !currentUser.badges.includes("First Step")
          ? [...currentUser.badges, "First Step"]
          : currentUser.badges
      };

      try {
        await setDoc(userDocRef, updatedProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.email}`);
        throw err;
      }
      onUserUpdate(updatedProfile);

      setIsSaved(true);
      setTimeout(() => {
        setIsEmergency(false);
        onSuccess();
      }, 1500);

    } catch (err: any) {
      console.error(err);
      alert(`Failed to save issue: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="report-issue-container" className="bg-white border border-[#D9D2C5] rounded-2xl p-6 shadow-sm overflow-hidden animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-[#F2F0E9] text-[#5A5A40] rounded-lg border border-[#D9D2C5]/60">
          <Camera className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-serif font-bold text-lg text-[#2D2D24] leading-tight">{t("report_issue")}</h2>
          <p className="text-xs text-[#8A8A7A]">Provide proof & trigger immediate Gemini automated assessment</p>
        </div>
      </div>

      {/* OFFLINE STATUS BANNER & SYNC PROGRESS */}
      {isOffline && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2.5 shadow-3xs animate-fade-in">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <p className="font-bold">Offline Capturing Mode Active</p>
            <p className="text-[10.5px] mt-0.5 text-amber-700 leading-normal">
              You are currently disconnected from the internet. You can still snap photos and save your reports locally. Once connectivity is restored, they will automatically synchronize and get fully verified via Gemini Vision AI!
            </p>
          </div>
        </div>
      )}

      {offlineQueue.length > 0 && (
        <div className="mb-4 bg-[#FCFAF2] border border-[#C8A97E]/40 rounded-xl p-3 text-xs text-[#5A5A40] flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw className="w-4 h-4 text-[#C8A97E] animate-spin" />
              ) : (
                <Wifi className="w-4 h-4 text-emerald-600 animate-bounce" />
              )}
              <span className="font-bold">
                {offlineQueue.length} Offline Report{offlineQueue.length > 1 ? "s" : ""} Queued Locally
              </span>
            </div>
            {!isOffline && !isSyncing && (
              <button
                type="button"
                onClick={() => syncOfflineReports(offlineQueue)}
                className="px-2 py-1 bg-[#5A5A40] hover:bg-[#4A4A33] text-white text-[10px] font-bold rounded-md flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync Now</span>
              </button>
            )}
          </div>
          {syncStatus && (
            <p className="text-[10px] text-[#8A8A7A] font-mono leading-normal bg-white py-1.5 px-2 rounded border border-[#D9D2C5]/40 animate-pulse">
              {syncStatus}
            </p>
          )}
        </div>
      )}

      {/* DRAG AND DROP BLOCK */}
      <div 
        onDragOver={isCameraActive ? undefined : handleDragOver}
        onDrop={isCameraActive ? undefined : handleDrop}
        className="border-2 border-dashed border-[#D9D2C5] rounded-xl text-center overflow-hidden transition-colors bg-[#FBFBFA] shadow-inner mb-4 relative min-h-[11rem] flex flex-col justify-center"
      >
        {isCameraActive ? (
          <div className="relative w-full h-56 bg-black flex flex-col justify-between">
            {cameraError ? (
              <div className="p-4 flex flex-col items-center justify-center text-center text-white h-full space-y-3">
                <p className="text-xs text-rose-300 font-medium">{cameraError}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); stopCamera(); }}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Control bar */}
                <div className="absolute bottom-0 inset-x-0 bg-black/65 p-2.5 flex items-center justify-between gap-3 backdrop-blur-xs select-none">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stopCamera(); }}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-4 py-1.5 bg-[#C8A97E] hover:bg-[#B8986E] text-white rounded-lg text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture Photo</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : imagePreview ? (
          <div className="relative group max-h-56 overflow-hidden rounded-lg">
            <img src={imagePreview} alt="Civic problem proof" className="w-full h-44 object-cover" />
            
            {/* Client-side preview type badge */}
            <div className="absolute top-2.5 left-2.5 bg-black/75 text-white text-[9px] font-mono uppercase px-2 py-0.5 rounded-md flex items-center gap-1.5 select-none backdrop-blur-xs border border-white/10">
              <span className={`w-1.5 h-1.5 rounded-full ${isCameraCapture ? "bg-emerald-500 animate-ping" : "bg-sky-400"}`} />
              <span>{isCameraCapture ? "Camera Capture Preview" : "Uploaded File Preview"}</span>
            </div>

            {/* Geolocation metadata watermark overlay */}
            <div className="absolute bottom-2 left-2 right-2 bg-black/75 text-white text-[9px] font-mono px-2 py-1 rounded flex items-center justify-between gap-1.5 backdrop-blur-xs border border-white/10 pointer-events-none transition-opacity group-hover:opacity-0">
              <span className="truncate flex items-center gap-1">📍 <span className="font-sans font-bold text-white">{address}</span></span>
              <span className="shrink-0 opacity-75">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>
            </div>

            {loading && !aiAnalysis ? (
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
                <style>{`
                  @keyframes scanLine {
                    0% { top: 0%; opacity: 0.2; }
                    50% { top: 100%; opacity: 0.9; }
                    100% { top: 0%; opacity: 0.2; }
                  }
                `}</style>
                <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono tracking-wider flex items-center gap-1.5 border border-[#C8A97E]/30 animate-pulse select-none">
                  <span className="w-2 h-2 rounded-full bg-[#C8A97E] animate-ping" />
                  <span>AI Analyzing...</span>
                </div>
                {/* Visual horizontal glowing radar sweep */}
                <div 
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#C8A97E] to-transparent shadow-[0_0_12px_#C8A97E] pointer-events-none"
                  style={{
                    animation: "scanLine 2.2s ease-in-out infinite"
                  }}
                />
              </div>
            ) : (
              <div 
                onClick={() => { setImagePreview(null); setAiAnalysis(null); setIsSaved(false); setIsEmergency(false); }}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold cursor-pointer"
              >
                Change Attachment
              </div>
            )}
          </div>
        ) : (
          <div className="py-5 px-4 flex flex-col items-center justify-center select-none" onClick={() => fileInputRef.current?.click()}>
            <div className="flex gap-6 mb-3">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="flex flex-col items-center justify-center p-3 w-28 bg-white border border-[#D9D2C5] rounded-xl hover:bg-[#F2F0E9] hover:border-[#8A8A7A] transition-all group cursor-pointer"
              >
                <ImageIcon className="w-7 h-7 text-[#8A8A7A] group-hover:text-[#5A5A40] transition-colors mb-1.5" />
                <span className="text-xs font-bold text-[#5A5A40]">Browse File</span>
              </button>
              
              <button
                type="button"
                onClick={startCamera}
                className="flex flex-col items-center justify-center p-3 w-28 bg-white border-2 border-dashed border-[#C8A97E]/50 rounded-xl hover:bg-[#FCFAF2] hover:border-[#C8A97E] transition-all group cursor-pointer"
              >
                <Camera className="w-7 h-7 text-[#C8A97E]/70 group-hover:text-[#C8A97E] transition-colors mb-1.5 animate-pulse" />
                <span className="text-xs font-bold text-[#C8A97E]">Live Camera</span>
              </button>
            </div>
            
            <p className="text-xs text-[#6B6B5B] font-medium">Drag & drop file or start camera to capture proof</p>
            <p className="text-[10px] text-[#8A8A7A] mt-1">Supports JPEG, PNG, WEBP (AI vision will verify context)</p>
          </div>
        )}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
          className="hidden" 
          accept="image/*"
        />
      </div>

      {/* SAMPLE QUICK LINKS */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-[#6B6B5B] mb-2">Or, quickly test with realistic sample cases:</p>
        <div className="grid grid-cols-2 gap-2">
          {dynamicSamples.map((sample) => (
            <button
              key={sample.name}
              type="button"
              disabled={loading}
              onClick={() => handleSelectSample(sample.url)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#F2F0E9] hover:bg-[#E5E2D9] text-[#5A5A40] border border-[#D9D2C5] transition-colors text-left flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 text-[#C8A97E] shrink-0" />
              <span className="truncate">{sample.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* BRIEF DESCRIPTION */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold text-[#2D2D24]">Your brief Description (Optional):</label>
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
              isListening
                ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse shadow-sm"
                : "bg-[#F2F0E9] hover:bg-[#E5E2D9] text-[#5A5A40] border-[#D9D2C5]"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5 text-rose-600" />
                <span>Stop Voice Note</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-[#C8A97E]" />
                <span>Record Voice Note</span>
              </>
            )}
          </button>
        </div>
        <div className="relative">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isListening ? "Listening... Speak now into your microphone." : isEmergency ? "Describe the immediate emergency hazard (e.g. sparks from live wire, strong gas odor near storm drain, collapsed transformer, major water burst...)" : "e.g. Garbage piled up near public gate, streetlight flicker, deep road hole..."}
            className={`w-full text-sm rounded-lg border p-2.5 focus:outline-none focus:ring-1 focus:ring-[#5A5A40] bg-white text-[#3D3D33] transition-all duration-200 ${
              isListening ? "border-rose-300 focus:border-rose-400 focus:ring-rose-400 bg-rose-50/20 shadow-inner" : "border-[#D9D2C5] focus:border-[#5A5A40]"
            }`}
            rows={2.5}
          />
          {isListening && (
            <div className="absolute right-3 bottom-3 flex items-center gap-1 bg-white/85 px-1.5 py-0.5 rounded border border-rose-200 shadow-xs backdrop-blur-xs select-none">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
              <span className="text-[9px] font-mono font-bold text-rose-600 tracking-wider uppercase">Live Mic</span>
            </div>
          )}
        </div>
      </div>

      {/* EMERGENCY HAZARD TOGGLE */}
      <div className={`mb-5 rounded-xl border p-4 transition-all duration-300 ${
        isEmergency 
          ? "bg-rose-50/70 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.12)]" 
          : "bg-[#FDFCF9] border-[#D9D2C5] hover:border-rose-200"
      }`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg border shrink-0 transition-colors duration-300 ${
              isEmergency 
                ? "bg-rose-600 border-rose-500 text-white shadow-sm animate-pulse" 
                : "bg-rose-50 border-rose-100 text-rose-600"
            }`}>
              <span className="text-lg font-bold leading-none select-none">🚨</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#2D2D24] flex items-center gap-1.5 leading-snug">
                Is this an Immediate Hazard?
                {isEmergency && (
                  <span className="text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    Emergency Active
                  </span>
                )}
              </h4>
              <p className="text-xs text-[#6B6B5B] mt-0.5 leading-normal">
                Flag immediate threats like live wires, gas leaks, structural collapses, or main line bursts to trigger <strong>Automated Municipal Dispatch</strong>.
              </p>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => {
              const nextVal = !isEmergency;
              setIsEmergency(nextVal);
              if (nextVal) {
                setCitizenUrgency("High");
                // Play elegant high-priority alert tone
                try {
                  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.type = "sine";
                  osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
                  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.35);
                  
                  setTimeout(() => {
                    const osc2 = audioCtx.createOscillator();
                    const gain2 = audioCtx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(audioCtx.destination);
                    osc2.type = "sine";
                    osc2.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
                    gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                    osc2.start();
                    osc2.stop(audioCtx.currentTime + 0.55);
                  }, 120);
                } catch (e) {
                  console.warn("AudioContext tone blocked:", e);
                }
              }
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-rose-500 select-none ${
              isEmergency ? 'bg-rose-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                isEmergency ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        
        {isEmergency && (
          <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-[11px] text-rose-800 leading-normal animate-fade-in flex items-start gap-1.5">
            <span className="shrink-0 text-xs">⚠️</span>
            <p>
              <strong>Immediate Dispatch Lock:</strong> Municipal Emergency Services will be triggered instantly upon submission. Please verify that the image clearly captures the hazard.
            </p>
          </div>
        )}
      </div>

      {/* CITIZEN URGENCY SELECTION */}
      <div className={`mb-5 border rounded-xl p-3.5 transition-all ${
        isEmergency ? "bg-rose-50/20 border-rose-200" : "bg-[#FBFBFA] border-[#D9D2C5]"
      }`}>
        <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2.5 font-mono flex items-center justify-between">
          <span>Immediate Urgency Category:</span>
          {isEmergency && <span className="text-[10px] text-rose-700 font-sans font-bold">Locked to High for Emergency</span>}
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(["Low", "Medium", "High"] as const).map((level) => {
            const isSelected = citizenUrgency === level;
            const isDisabled = isEmergency && level !== "High";
            const colors = {
              Low: {
                activeBg: "bg-emerald-50 border-emerald-400 text-emerald-800",
                inactiveBg: "hover:bg-emerald-50/40 border-[#D9D2C5] text-[#6B6B5B] hover:border-emerald-300 bg-white",
                dot: "bg-emerald-500 border-emerald-500",
                desc: "Safe to defer"
              },
              Medium: {
                activeBg: "bg-amber-50 border-amber-400 text-amber-800",
                inactiveBg: "hover:bg-amber-50/40 border-[#D9D2C5] text-[#6B6B5B] hover:border-amber-300 bg-white",
                dot: "bg-amber-500 border-amber-500",
                desc: "Needs prompt care"
              },
              High: {
                activeBg: "bg-rose-50 border-rose-400 text-rose-800",
                inactiveBg: "hover:bg-rose-50/40 border-[#D9D2C5] text-[#6B6B5B] hover:border-rose-300 bg-white",
                dot: "bg-rose-500 border-rose-500",
                desc: "Direct hazard"
              }
            }[level];

            return (
              <label
                key={level}
                onClick={() => {
                  if (isEmergency) return;
                  setCitizenUrgency(level);
                }}
                className={`flex flex-col p-2.5 rounded-xl border-2 cursor-pointer transition-all text-left select-none ${
                  isDisabled ? "opacity-30 cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-200" : ""
                } ${
                  isSelected && (!isEmergency || level === "High") ? colors.activeBg : colors.inactiveBg
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold tracking-tight">{level}</span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    isSelected ? "border-current" : "border-[#D9D2C5]"
                  }`}>
                    {isSelected && <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
                  </div>
                </div>
                <span className="text-[9.5px] opacity-85 leading-tight font-medium">{colors.desc}</span>
              </label>
            );
          })}
        </div>
        <p className="text-[9.5px] text-[#8A8A7A] mt-2 leading-normal">
          {isEmergency ? "Locked to High priority. Direct 24-Hour action letter will be generated by Gemini." : "Categorize the severity to prioritize municipal attention. Gemini will factor this into the formal report context."}
        </p>
      </div>

      {/* GEOLOCATION SELECTION */}
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-[#2D2D24] mb-1.5">Issue Location / Street Address:</label>
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 15 Maple Avenue, Downtown"
              className="w-full text-sm rounded-lg border border-[#D9D2C5] p-2.5 pr-10 focus:border-[#5A5A40] focus:outline-none focus:ring-1 focus:ring-[#5A5A40] bg-white text-[#3D3D33] font-medium"
            />
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gpsLoading}
              title="Detect my location"
              className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-[#C8A97E] hover:text-[#5A5A40] transition-colors cursor-pointer disabled:opacity-50"
            >
              {gpsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4 animate-pulse text-[#C8A97E]" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-[#8A8A7A] mt-1">
            Type custom address manually, or click the Map Pin to auto-populate using live GPS tracking.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#2D2D24] mb-1.5">Preset Hotspot Shortcuts:</label>
            <select
              value={dynamicPlaces.some(h => h.name === address) ? address : ""}
              onChange={handleHotspotChange}
              className="w-full text-xs rounded-lg border border-[#D9D2C5] p-2.5 bg-white focus:ring-1 focus:ring-[#5A5A40] font-semibold text-[#6B6B5B] cursor-pointer"
            >
              <option value="" disabled>-- Choose preconfigured hotspot --</option>
              {dynamicPlaces.map(h => (
                 <option key={h.name} value={h.name}>{h.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#2D2D24] mb-1.5">Automatic GPS Detection:</label>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gpsLoading}
              className="w-full py-2.5 px-3 text-xs font-bold bg-[#F2F0E9] border border-[#D9D2C5] hover:border-[#8A8A7A] rounded-lg text-[#5A5A40] flex items-center justify-center gap-1.5 hover:bg-[#EBE5D8] transition-all cursor-pointer disabled:opacity-60 active:scale-98"
            >
              <MapPin className="w-4 h-4 text-[#C8A97E]" />
              <span>{gpsLoading ? "Retrieving Coordinates..." : "Detect My Location"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#F2F0E9] p-3 rounded-xl border border-[#D9D2C5] flex items-center justify-between text-[11px] text-[#6B6B5B] mb-5 font-mono">
        <span>Coordinate Pin:</span>
        <span className="font-semibold text-[#2D2D24]">LAT: {coords.lat.toFixed(4)}, LNG: {coords.lng.toFixed(4)}</span>
      </div>

      {/* ANALYZE METRICS TRIGGER OR PROGRESS CONTROL PANEL */}
      {isOffline ? (
        <button
          type="button"
          disabled={!imagePreview}
          onClick={handleQueueOffline}
          className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4 text-white" />
          <span>Queue Issue Report Offline</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={!imagePreview || loading}
          onClick={handleAnalyzeWithAI}
          className="w-full py-3 bg-[#5A5A40] hover:bg-[#4A4A33] text-white font-medium rounded-xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 text-[#C8A97E]" />
          <span>Verify & Assess with Gemini Vision</span>
        </button>
      )}

      {/* FULL-SCREEN GORGEOUS ZERO-GAP ANALYSIS DECK OVERLAY */}
      {(loading || aiAnalysis) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#2D2D24]/80 backdrop-blur-md overflow-y-auto animate-fade-in">
          {/* Custom scan line styling injected once */}
          <style>{`
            @keyframes scanLineAnim {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
            .radar-scan-line {
              animation: scanLineAnim 3s ease-in-out infinite;
            }
          `}</style>

          {/* Main Overlay Deck panel */}
          <div className="relative bg-[#FDFCF9] w-full max-w-[96vw] lg:max-w-[90vw] xl:max-w-[1200px] 2xl:max-w-[1400px] rounded-3xl border border-[#D9D2C5] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[85vh] max-h-[850px] my-auto">
            
            {/* LEFT SIDE: SCANNING INFRASTRUCTURE & ACTIVE IMAGE PROOF */}
            <div className="w-full md:w-1/2 h-52 md:h-full bg-[#1A1A15] relative flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-[#D9D2C5] shrink-0">
              {imagePreview ? (
                <>
                  {/* Beautiful blurred ambient background to eliminate empty/black gaps */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center blur-2xl opacity-40 scale-110 pointer-events-none select-none"
                    style={{ backgroundImage: `url(${imagePreview})` }}
                  />
                  <img 
                    src={imagePreview} 
                    alt="Active civic investigation case" 
                    className="relative w-full h-full object-cover z-10 select-none" 
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Glowing vertical scanning radar bar */}
                  {loading && !aiAnalysis && (
                    <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#C8A97E] to-transparent shadow-[0_0_12px_#C8A97E] pointer-events-none radar-scan-line" />
                  )}
                  
                  {/* High-fidelity GPS overlay banner */}
                  <div className="absolute bottom-4 left-4 right-4 bg-black/75 text-[#F2F0E9] text-[10.5px] font-mono px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 backdrop-blur-md border border-white/10 pointer-events-none shadow-md">
                    <span className="truncate flex items-center gap-1.5 font-sans font-bold">
                      <span className="text-emerald-400">●</span> {address}
                    </span>
                    <span className="shrink-0 opacity-70 font-mono">LAT: {coords.lat.toFixed(4)}, LNG: {coords.lng.toFixed(4)}</span>
                  </div>
                </>
              ) : (
                <div className="text-[#8A8A7A] text-xs font-mono">Waiting for image proof packet...</div>
              )}
            </div>

            {/* RIGHT SIDE: TELEMETRY ANALYSIS SCREEN & ACTIONS */}
            <div className="w-full md:w-1/2 flex flex-col flex-1 h-full min-h-0 bg-[#FCFAF5]">
              
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#D9D2C5] flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C8A97E] shrink-0" />
                  <span className="font-serif font-black text-xs text-[#2D2D24] uppercase tracking-wider">
                    {loading && !aiAnalysis ? "AI Telemetry Screening..." : "Gemini Vision Verified Assessment"}
                  </span>
                </div>
                {!loading && (
                  <button
                    type="button"
                    onClick={() => { setAiAnalysis(null); setIsEmergency(false); }}
                    className="p-1 rounded-full hover:bg-[#F2F0E9] text-[#6B6B5B] transition-colors cursor-pointer border border-[#D9D2C5]/30"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Central Scroll Area */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {loading && !aiAnalysis ? (
                  /* PROGRESS STEPPING LOADER */
                  <div className="space-y-6 py-8 flex flex-col justify-center items-center">
                    <div className="text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-white border border-[#E9E4D6] flex items-center justify-center mx-auto shadow-sm">
                        <Loader2 className="w-6 h-6 text-[#C8A97E] animate-spin" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#5A5A40] font-mono">
                        Running Verification Pipelines
                      </h4>
                      <div className="bg-white/80 border border-[#D9D2C5]/60 rounded-xl px-4 py-3 shadow-3xs inline-block text-center max-w-xs">
                        <p className="text-xs text-[#2D2D24] font-medium leading-relaxed font-serif italic">
                          "{getAnalysisSteps(isEmergency)[analysisStep]}"
                        </p>
                      </div>
                    </div>

                    {/* Simple sleek progress bar */}
                    <div className="w-full bg-[#E5E2D9] h-2 rounded-full overflow-hidden border border-[#D9D2C5]/60 max-w-sm">
                      <div 
                        className="bg-gradient-to-r from-[#C8A97E] via-[#5A5A40] to-[#C8A97E] h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${(analysisStep + 1) * 20}%` }}
                      />
                    </div>

                    {/* Step-by-step telemetry tickers */}
                    <div className="w-full max-w-xs space-y-2 pt-3 border-t border-[#D9D2C5]/50 text-left select-none">
                      {getAnalysisSteps(isEmergency).map((stepName, idx) => {
                        const isDone = analysisStep > idx;
                        const isActive = analysisStep === idx;
                        return (
                          <div key={idx} className="flex items-center gap-3 text-xs font-mono">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border text-[10px] ${
                              isDone 
                                ? "bg-emerald-50 border-emerald-300 text-emerald-600 font-bold" 
                                : isActive 
                                ? "bg-[#FCFAF2] border-[#C8A97E] text-[#C8A97E] animate-pulse font-bold" 
                                : "bg-slate-50/50 border-slate-200 text-slate-300"
                            }`}>
                              {isDone ? "✓" : isActive ? "●" : "◦"}
                            </div>
                            <span className={`${
                              isDone ? "text-[#8A8A7A] line-through font-medium" : isActive ? "text-[#2D2D24] font-bold" : "text-[#8A8A7A]/60"
                            }`}>
                              {stepName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : aiAnalysis ? (
                  aiAnalysis.isCivicRelated === false ? (
                    /* NON-CIVIC WARNING STATE */
                    <div className="space-y-4 py-4 animate-fade-in text-[#3D3D33]">
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex flex-col gap-3 shadow-xs">
                        <div className="flex items-center gap-2 text-rose-800">
                          <span className="text-xl">⚠️</span>
                          <h4 className="font-serif font-bold text-sm">Non-Civic Content Flagged</h4>
                        </div>
                        <p className="text-xs text-rose-700 leading-relaxed font-medium">
                          {aiAnalysis.nonCivicReason || "This platform is specifically dedicated to reporting municipal and civic issues like potholes, garbage dumping, faulty streetlights, or leakage. Please upload a relevant picture of a civic concern."}
                        </p>
                        <div className="text-[10px] text-rose-600 bg-white/60 rounded-lg p-2.5 border border-rose-100/50 font-mono">
                          <strong>Muted Category:</strong> categorized as "{aiAnalysis.category || "other"}" but marked as unrelated.
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* AI DETECTED CITIZEN METRICS - ZERO GAP */
                    <div className="space-y-4 animate-fade-in text-[#3D3D33]">
                      <div className="bg-white border border-[#D9D2C5] rounded-2xl p-4.5 space-y-4 shadow-3xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#5A5A40]">Critical Assessment</span>
                          <span className="text-[10.5px] font-mono font-bold text-[#2D2D24] bg-[#F2F0E9] px-2.5 py-0.5 rounded-full border border-[#D9D2C5]/60">{aiAnalysis.category.toUpperCase()}</span>
                        </div>
                        
                        <div>
                          <h3 className="font-serif font-black text-[#2D2D24] text-sm mb-1 leading-tight">{aiAnalysis.title}</h3>
                          <p className="text-xs text-[#6B6B5B] leading-relaxed">{description || aiAnalysis.description}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-[#FCFAF5] p-2.5 rounded-xl border border-[#D9D2C5]/60">
                            <span className="text-[10px] text-[#8A8A7A] uppercase font-bold">Severity Class</span>
                            <p className={`font-mono font-black mt-0.5 text-xs ${
                              aiAnalysis.severity === "Critical" ? "text-rose-700" :
                              aiAnalysis.severity === "High" ? "text-amber-700" : "text-emerald-700"
                            }`}>{aiAnalysis.severity}</p>
                          </div>
                          <div className="bg-[#FCFAF5] p-2.5 rounded-xl border border-[#D9D2C5]/60">
                            <span className="text-[10px] text-[#8A8A7A] uppercase font-bold">Priority Urgency</span>
                            <p className={`font-mono font-black mt-0.5 text-xs ${
                              citizenUrgency === "High" || aiAnalysis.urgency === "Immediate" ? "text-rose-700" :
                              citizenUrgency === "Medium" || aiAnalysis.urgency === "High" ? "text-amber-700" : "text-emerald-700"
                            }`}>{citizenUrgency || aiAnalysis.urgency}</p>
                          </div>
                        </div>

                        <div className="bg-[#FCFAF5] p-2.5 rounded-xl border border-[#D9D2C5]/60 text-xs">
                          <span className="text-[10px] text-[#6B6B5B] font-bold block">Priority Cause:</span>
                          <p className="text-[#6B6B5B] leading-relaxed mt-0.5 text-[11px] italic">{aiAnalysis.urgencyReason}</p>
                        </div>

                        <div className="bg-[#F2F0E9]/40 p-3 rounded-xl border border-[#D9D2C5] text-xs flex justify-between items-center font-mono">
                          <span className="text-[10px] text-[#5A5A40] font-extrabold uppercase">Estimated Repair Budget:</span>
                          <span className="font-black text-[#5A5A40] text-sm">{aiAnalysis.estimatedCost}</span>
                        </div>

                        {/* Target Municipality & Resolution Time */}
                        {(aiAnalysis.municipalityName || aiAnalysis.estimatedResolutionTime) && (
                          <div className="space-y-2 border-t border-[#D9D2C5]/40 pt-3.5">
                            {aiAnalysis.municipalityName && (
                              <div className="bg-white p-3 rounded-xl border border-[#D9D2C5]/60 text-xs flex gap-2.5 items-start">
                                <Building2 className="w-4 h-4 text-[#5A5A40] shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-[9px] text-[#8A8A7A] uppercase font-bold block">Target Municipal Office</span>
                                  <p className="font-bold text-[#2D2D24] text-[11px] leading-tight">{aiAnalysis.municipalityName}</p>
                                  {aiAnalysis.municipalityAddress && (
                                    <p className="text-[10px] text-[#6B6B5B] mt-0.5 leading-snug">{aiAnalysis.municipalityAddress}</p>
                                  )}
                                </div>
                              </div>
                            )}
                            {aiAnalysis.estimatedResolutionTime && (
                              <div className="bg-white p-3 rounded-xl border border-[#D9D2C5]/60 text-xs flex gap-2.5 items-center justify-between">
                                <div className="flex gap-2.5 items-center">
                                  <Clock className="w-4 h-4 text-[#C8A97E] shrink-0" />
                                  <div>
                                    <span className="text-[9px] text-[#8A8A7A] uppercase font-bold block">Est. Resolution Window</span>
                                    <p className="font-bold text-[#2D2D24] text-[11px]">{aiAnalysis.estimatedResolutionTime}</p>
                                  </div>
                                </div>
                                <div className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                                  Dispatch Scheduled
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="bg-[#F2F0E9]/50 rounded-xl p-3 border border-[#D9D2C5]">
                        <h4 className="text-xs font-bold text-[#2D2D24] uppercase tracking-wide mb-1.5">Automated Complaint Letter Draft</h4>
                        <div className="bg-white p-2.5 rounded border border-[#D9D2C5] max-h-32 overflow-y-auto text-[10px] text-[#6B6B5B] font-mono leading-relaxed whitespace-pre-wrap select-text">
                          {aiAnalysis.complaintText}
                        </div>
                      </div>
                    </div>
                  )
                ) : null}
              </div>

              {/* Action Buttons Footer */}
              <div className="px-6 py-4 bg-white border-t border-[#D9D2C5] flex gap-3 shrink-0">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => { setAiAnalysis(null); setIsEmergency(false); }}
                  className="flex-1 py-3 text-xs text-[#6B6B5B] font-bold bg-white border border-[#D9D2C5] rounded-xl hover:bg-[#F2F0E9] active:bg-[#E5E2D9] transition-all cursor-pointer disabled:opacity-50 text-center uppercase tracking-wider"
                >
                  {t("discard")}
                </button>
                <button
                  type="button"
                  disabled={loading || isSaved || !aiAnalysis || aiAnalysis.isCivicRelated === false}
                  onClick={async () => {
                    await handleSaveToDatabase();
                  }}
                  className="flex-[2] py-3 bg-[#5A5A40] hover:bg-[#4A4A33] active:scale-95 text-white font-extrabold rounded-xl transition-all text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 uppercase tracking-wider"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isSaved ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-white animate-bounce" />
                      <span>{t("report_lodged")}</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{t("lodge_report")}</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
