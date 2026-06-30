import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType, auth } from "./firebase";
import { collection, doc, setDoc, getDoc, getDocs, query, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Issue, UserProfile } from "./types";
import { INITIAL_ISSUES, INITIAL_LEADERBOARD } from "./data/mockPoints";
import ReportIssue from "./components/ReportIssue";
import NearbyAlerts from "./components/NearbyAlerts";
import IssuesFeed from "./components/IssuesFeed";
import IssuesMap from "./components/IssuesMap";
import ReportFrequencyChart from "./components/ReportFrequencyChart";
import AdminDashboard from "./components/AdminDashboard";
import Leaderboard from "./components/Leaderboard";
import AuthScreen from "./components/AuthScreen";
import { ToastContainer, ToastMessage } from "./components/ToastNotification";
import { ShieldCheck, UserCheck, Play, CheckCircle2, RefreshCw, BarChart2, Hammer, Landmark, HelpCircle, Users, Activity, Loader2, LogOut, Globe } from "lucide-react";
import { useTranslation, Language } from "./context/LanguageContext";


// Default Persona matching the user environment information securely
const ACTIVE_USER_EMAIL = "kondapalliabhinaysaikrishna@gmail.com";
const ACTIVE_USER_NAME = "Abhinay Sai Krishna";

// Helper function to prevent infinite hanging when Firestore is unreachable or experiencing latency inside iframe sandbox
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore connection timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

export default function App() {
  const { language, setLanguage, t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"citizen" | "admin">("citizen");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [appReady, setAppReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 1. Subscribe to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        const userEmail = user.email || "";
        const userRef = doc(db, "users", userEmail);
        try {
          const userSnap = await withTimeout(getDoc(userRef), 2500);
          if (userSnap.exists()) {
            const profile = userSnap.data() as UserProfile;
            setCurrentUser(profile);
            if (profile.role) {
              setActiveTab(profile.role === "municipality" ? "admin" : "citizen");
            }
          } else {
            const newProfile: UserProfile = {
              email: userEmail,
              displayName: user.displayName || userEmail.split("@")[0],
              points: 100,
              reportsCount: 0,
              votesCount: 0,
              badges: ["Citizen Rookie"],
              role: "citizen"
            };
            await withTimeout(setDoc(userRef, newProfile), 2500);
            setCurrentUser(newProfile);
            setActiveTab("citizen");
          }
        } catch (err) {
          console.error("Error setting up auth user profile:", err);
          setCurrentUser({
            email: userEmail,
            displayName: user.displayName || userEmail.split("@")[0],
            points: 100,
            reportsCount: 0,
            votesCount: 0,
            badges: ["Citizen Rookie"],
            role: "citizen"
          });
          setActiveTab("citizen");
        }
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Firestore Database Seeding
  useEffect(() => {
    async function bootDatabase() {
      try {
        setSyncing(true);

        // Seed issues collection if empty to ensure instant rich visual content
        const issuesColl = collection(db, "issues");
        let issuesSnap;
        try {
          issuesSnap = await withTimeout(getDocs(issuesColl), 2500);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, "issues");
          throw err;
        }
        
        if (issuesSnap.empty) {
          console.log("Seeding remote Firestore issues database...");
          for (const initIssue of INITIAL_ISSUES) {
            try {
              await withTimeout(setDoc(doc(db, "issues", initIssue.id), initIssue), 1000);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `issues/${initIssue.id}`);
            }
          }
        }

        // Seed leaderboard heroes to Firestore for comparative list lookups
        for (const player of INITIAL_LEADERBOARD) {
          try {
            const playerRef = doc(db, "users", player.email);
            const playerSnap = await withTimeout(getDoc(playerRef), 1000);
            if (!playerSnap.exists()) {
              await withTimeout(setDoc(playerRef, player), 1000);
            }
          } catch (err) {
            console.error("Leaderboard seed error:", err);
          }
        }

        setAppReady(true);
      } catch (err) {
        console.error("Firebase connection/seeding failed, utilizing fallback local state:", err);
        setAppReady(true); // Allow continuing through fallbacks safely
      } finally {
        setSyncing(false);
      }
    }

    bootDatabase();
  }, []);

  // Live Status Change Toast Notification Engine
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const isInitialLoadRef = React.useRef(true);
  const prevStatusesRef = React.useRef<Record<string, string>>({});

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, "issues"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (isInitialLoadRef.current) {
          const statuses: Record<string, string> = {};
          snapshot.docs.forEach((doc) => {
            statuses[doc.id] = doc.data().status;
          });
          prevStatusesRef.current = statuses;
          isInitialLoadRef.current = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          const issueId = change.doc.id;
          const issueData = change.doc.data() as Issue;

          if (change.type === "added") {
            prevStatusesRef.current[issueId] = issueData.status;
          } else if (change.type === "modified") {
            const oldStatus = prevStatusesRef.current[issueId];
            const newStatus = issueData.status;

            if (oldStatus && oldStatus !== newStatus) {
              const isReporter = issueData.reportedBy === currentUser.email;
              const isVoter = issueData.votedUsers && issueData.votedUsers.includes(currentUser.email);

              if (isReporter || isVoter) {
                const toastId = `${issueId}-${Date.now()}`;
                const title = isReporter ? "Your Reported Issue Updated!" : "Community Issue Updated!";
                const description = `The issue "${issueData.title}" status has changed from ${oldStatus} to ${newStatus}.`;
                
                setToasts((prev) => [
                  ...prev,
                  {
                    id: toastId,
                    title,
                    description,
                    type: newStatus === "Resolved" ? "success" : "info",
                  },
                ]);
              }
              prevStatusesRef.current[issueId] = newStatus;
            }
          } else if (change.type === "removed") {
            delete prevStatusesRef.current[issueId];
          }
        });
      },
      (error) => {
        console.error("Error monitoring status changes:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleUserUpdate = (updatedProfile: UserProfile) => {
    setCurrentUser(updatedProfile);
  };

  // Enforce role-based access control and lock the active view tab to user role
  useEffect(() => {
    if (currentUser) {
      setActiveTab(currentUser.role === "municipality" ? "admin" : "citizen");
    }
  }, [currentUser]);

  const handleReportingSuccess = () => {
    // Jump straight to feed & clear state
    setSelectedCategory("all");
  };

  if (!appReady || authLoading) {
    return (
      <div id="loader-wrapper" className="min-h-screen bg-[#F8F9F4] flex flex-col items-center justify-center font-sans text-[#3D3D33]">
        <Loader2 className="w-12 h-12 text-[#5A5A40] animate-spin mb-4" />
        <h3 className="font-serif font-extrabold text-[#2D2D24] text-xl">CivicAI Agent</h3>
        <p className="text-xs text-[#8A8A7A] tracking-wider mt-1 font-semibold uppercase">Connecting with Firestore Clusters & Auth Authorities...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onAuthSuccess={(profile) => {
      setCurrentUser(profile);
      if (profile.role) {
        setActiveTab(profile.role === "municipality" ? "admin" : "citizen");
      }
    }} />;
  }

  return (
    <div className="min-h-screen bg-[#F8F9F4] font-sans antialiased text-[#3D3D33] flex flex-col">
      
      {/* GLOBAL ADMINISTRATIVE TOP BAR */}
      <header className="h-20 border-b border-[#D9D2C5] bg-white sticky top-0 z-50">
        <div className="w-full max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4">
          
          {/* Logo & Slogan */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#5A5A40] flex items-center justify-center shadow-md">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-serif font-bold text-[#2D2D24] leading-none">
                  CivicAI <span className="text-[#5A5A40] italic font-normal">Agent</span>
                </h1>
                <span className="text-[9px] font-bold bg-[#F2F0E9] border border-[#D9D2C5] text-[#5A5A40] px-2 py-0.5 rounded-full">v1.2 Agentic</span>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-[#8A8A7A] mt-1 font-semibold">{t("slogan")}</p>
            </div>
          </div>

          {/* Tab Navigation Switches */}
          {currentUser.role === "municipality" ? (
            <div className="hidden min-[540px]:flex bg-[#F2EFE4] px-4 py-2 rounded-xl border border-[#C8A97E]/40 font-bold text-[#C8A97E] text-xs items-center gap-1.5 shrink-0 shadow-xs select-none">
              <ShieldCheck className="w-4 h-4 text-[#C8A97E]" />
              <span>{t("municipal_dashboard")}</span>
            </div>
          ) : (
            <div className="hidden min-[540px]:flex bg-[#F2F0E9] px-4 py-2 rounded-xl border border-[#D9D2C5] font-bold text-[#5A5A40] text-xs items-center gap-1.5 shrink-0 shadow-xs select-none">
              <Users className="w-4 h-4 text-[#5A5A40]" />
              <span>{t("citizen_portal")}</span>
            </div>
          )}

          {/* Right Action Elements: Language Selector & User Scorecard */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Language Switcher Dropdown */}
            <div className="relative flex items-center bg-[#F2F0E9] px-2.5 py-1.5 rounded-full border border-[#D9D2C5] text-[#5A5A40] transition-all hover:bg-[#E7E2D5]">
              <Globe className="w-3.5 h-3.5 mr-1 text-[#5A5A40] shrink-0" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-transparent border-none text-[10px] font-mono font-bold focus:outline-none focus:ring-0 text-[#2D2D24] cursor-pointer pr-1"
                aria-label="Select Language"
              >
                <option value="en">EN</option>
                <option value="es">ES</option>
                <option value="te">తెలుగు</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>

            {/* User Scorecard Quick Widget */}
            <div className="flex items-center gap-2 sm:gap-3 bg-[#F2F0E9] px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-[#D9D2C5]">
              <div className="hidden xs:block text-right select-none">
                <span className="block text-[9.5px] font-bold text-[#8A8A7A] uppercase tracking-wider leading-none">
                  {currentUser.role === "municipality" ? "Municipality Staff" : t("citizen_rookie")}
                </span>
                <span className="block font-mono text-xs font-black text-[#5A5A40] leading-none mt-1">
                  {currentUser.role === "municipality" ? currentUser.displayName : `${currentUser.points} XP`}
                </span>
              </div>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#C8A97E] text-white font-extrabold text-xs flex items-center justify-center border border-[#D9D2C5] uppercase shadow-sm select-none">
                {currentUser.displayName ? currentUser.displayName.charAt(0) : "?"}
              </div>
              <button
                onClick={() => signOut(auth)}
                title={t("sign_out")}
                className="p-2 hover:bg-[#E7E2D5] rounded-full text-red-600 hover:text-red-700 hover:bg-rose-50 transition-colors cursor-pointer flex items-center justify-center border border-[#D9D2C5]/40"
                style={{ minWidth: "32px", minHeight: "32px" }}
              >
                <LogOut className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* SUBORDINATE STATS BAR */}
      <div className="bg-[#5A5A40] text-[#F2F0E9] py-2 border-b border-[#4A4A33] shrink-0">
        <div className="w-full max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between text-[10px] gap-2 font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isOffline ? "bg-rose-500 animate-bounce" : "bg-emerald-400 animate-pulse"}`} />
              <span>DIALING FIRESTORE CLUSTER: <strong className={isOffline ? "text-rose-300" : ""}>{isOffline ? "DISCONNECTED (OFFLINE MODE)" : "gen-lang-client-06501885"}</strong></span>
            </div>
            <span>|</span>
            <span>ACTIVE WARD: <strong>District 6 Metro Zone</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <span>METADATA PERMISSIONS: <strong>Camera, Geolocation, Microphone Active</strong></span>
          </div>
        </div>
      </div>

      {/* PRINCIPLE BODY VIEWPORT */}
      <main className="flex-1 w-full max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "citizen" ? (
          
          <div className="space-y-8">
            
            {/* WIDESCREEN TELEMETRY ROW (MAP & CHART SIDE-BY-SIDE IN BANNER WIDTH) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 xl:col-span-8">
                <IssuesMap selectedCategory={selectedCategory} />
              </div>
              <div className="lg:col-span-5 xl:col-span-4">
                <ReportFrequencyChart />
              </div>
            </div>

            {/* LOWER PORTAL GRID: INPUT FORM, REAL-TIME FEEDS, AND LEADERBOARD */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LOBBY / REPORT SECTOR - LEFT */}
              <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                <ReportIssue 
                  currentUser={currentUser} 
                  onUserUpdate={handleUserUpdate} 
                  onSuccess={handleReportingSuccess} 
                />

                <NearbyAlerts />
                
                <div className="bg-white rounded-2xl border border-[#D9D2C5] p-5 shadow-sm">
                  <h4 className="font-serif font-bold text-[#2D2D24] text-sm mb-2 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-[#5A5A40]" />
                    <span>Understanding Civic Rewards</span>
                  </h4>
                  <div className="space-y-2 text-[11px] leading-relaxed text-[#6B6B5B]">
                    <p>CivicAI is a self-driving community partnership module designed to eliminate municipal delays.</p>
                    <ul className="list-disc pl-4 space-y-1 text-[#3D3D33] font-medium">
                      <li>Lodge a certified issue: <strong className="text-[#5A5A40]">+100 Points</strong></li>
                      <li>Verify & vote on neighbor cases: <strong className="text-[#5A5A40]">+15 Points</strong></li>
                      <li>Case reaches construction resolution: <strong className="text-[#5A5A40]">+150 Points</strong></li>
                    </ul>
                    <p className="border-t border-[#D9D2C5] pt-2 font-mono text-[10px] text-[#5A5A40] font-semibold">Earn monthly exclusive badges as your score progresses.</p>
                  </div>
                </div>
              </div>

              {/* LIVE FEEDS - MIDDLE */}
              <div className="lg:col-span-5 xl:col-span-6 space-y-5">
                
                {/* Category Filter Tabs */}
                <div className="bg-white p-2.5 rounded-2xl border border-[#D9D2C5] shadow-sm flex flex-wrap gap-1 font-semibold text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      selectedCategory === "all" ? "bg-[#5A5A40] text-white shadow-md font-bold" : "hover:bg-[#F2F0E9] text-[#6B6B5B]"
                    }`}
                  >
                    {t("all_categories")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("pothole")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      selectedCategory === "pothole" ? "bg-rose-700 text-white shadow-md font-bold" : "hover:bg-[#F2F0E9] text-[#6B6B5B]"
                    }`}
                  >
                    {t("potholes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("garbage")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      selectedCategory === "garbage" ? "bg-amber-700 text-white shadow-md font-bold" : "hover:bg-[#F2F0E9] text-[#6B6B5B]"
                    }`}
                  >
                    {t("garbage")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("streetlight")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      selectedCategory === "streetlight" ? "bg-yellow-700 text-slate-900 shadow-md font-bold" : "hover:bg-[#F2F0E9] text-[#6B6B5B]"
                    }`}
                  >
                    {t("streetlight")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("leakage")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      selectedCategory === "leakage" ? "bg-[#1E40AF] text-white shadow-md font-bold" : "hover:bg-[#F2F0E9] text-[#6B6B5B]"
                    }`}
                  >
                    {t("leakage")}
                  </button>
                </div>

                {/* Real-Time Board */}
                <IssuesFeed 
                  currentUser={currentUser} 
                  onUserUpdate={handleUserUpdate} 
                  selectedCategory={selectedCategory} 
                />
              </div>

              {/* GAMIFIED LEADERBOARD - RIGHT */}
              <div className="lg:col-span-3">
                <Leaderboard currentUser={currentUser} />
              </div>

            </div>
          </div>
        ) : (
          
          /* MUNICIPAL OFFICE OPERATIONS VIEW */
          <AdminDashboard currentUser={currentUser} />
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-[#D9D2C5] py-5 font-mono text-[10px] text-[#8A8A7A] text-center shrink-0">
        <div className="w-full max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div>CivicAI Agent Corridor - Secured Full-Stack Sandbox Environment</div>
          <div className="mt-1">Powered by Google Gemini 2.5 Pro Vision Models & Firebase Cloud Systems • Natural Tones Edition</div>
        </div>
      </footer>

      {/* GLOBAL TOAST NOTIFICATIONS */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

    </div>
  );
}
