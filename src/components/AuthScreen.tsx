import React, { useState } from "react";
import { auth, db } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { UserProfile } from "../types";
import { 
  Landmark, 
  Users, 
  Mail, 
  Lock, 
  User, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Info, 
  HelpCircle, 
  Sparkles,
  ArrowRight
} from "lucide-react";

interface AuthScreenProps {
  onAuthSuccess: (profile: UserProfile) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"citizen" | "municipality">("citizen");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfigGuide, setShowConfigGuide] = useState(false);

  // Synchronize UserProfile record in Firestore
  const syncUserProfile = async (userEmail: string, name: string, selectedRole: "citizen" | "municipality") => {
    const userRef = doc(db, "users", userEmail);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    } else {
      const newProfile: UserProfile = {
        email: userEmail,
        displayName: name || userEmail.split("@")[0],
        points: selectedRole === "citizen" ? 100 : 0, // Starts with 100 XP for citizens, municipality starts with 0 activity
        reportsCount: 0,
        votesCount: 0,
        badges: selectedRole === "citizen" ? ["Citizen Rookie"] : ["Officer Badge"],
        role: selectedRole
      };
      await setDoc(userRef, newProfile);
      return newProfile;
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password || (isSignUp && !displayName)) {
      setError("Please fill out all the mandatory fields.");
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // Create user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const profile = await syncUserProfile(userCredential.user.email || email, displayName, role);
        onAuthSuccess(profile);
      } else {
        // Sign in
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userEmail = userCredential.user.email || email;
        
        // Fetch profile
        const userRef = doc(db, "users", userEmail);
        const userSnap = await getDoc(userRef);
        let profile: UserProfile;
        
        if (userSnap.exists()) {
          profile = userSnap.data() as UserProfile;
        } else {
          // If auth was successful but user document was somehow lost or cleared
          profile = await syncUserProfile(userEmail, userCredential.user.displayName || userEmail.split("@")[0], "citizen");
        }
        onAuthSuccess(profile);
      }
    } catch (err: any) {
      console.error("Authentication failed:", err);
      if (err.code === "auth/auth-domain-config-required" || err.code === "auth/operation-not-allowed") {
        setError("Email/Password Sign-In helper provider is not yet enabled in your Firebase console. Please use Google Sign-In or follow the configuration instructions below.");
        setShowConfigGuide(true);
      } else {
        setError(err.message || "An unexpected validation exception occurred during authentication.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userEmail = user.email || "";
      const profile = await syncUserProfile(userEmail, user.displayName || "", role);
      onAuthSuccess(profile);
    } catch (err: any) {
      console.error("Google popup login failed:", err);
      setError("Google Sign-In was cancelled or failed to resolve. Make sure Popups are allowed in your browser tab.");
    } finally {
      setLoading(false);
    }
  };

  const handleSandboxBypass = async () => {
    setError(null);
    setLoading(true);
    try {
      const isMuni = role === "municipality";
      const sampleEmail = isMuni ? "muni.officer@sandbox.local" : "citizen.guest@sandbox.local";
      const sampleName = isMuni ? "Officer Miller" : "Sandbox Citizen";
      const profile = await syncUserProfile(sampleEmail, sampleName, role);
      onAuthSuccess(profile);
    } catch (err: any) {
       console.warn("Firestore syncing failed during guest bypass. Launching virtual session profile instead.", err);
       // Guaranteed client-side virtual fallback if network or FireStore is locked
       onAuthSuccess({
         email: role === "municipality" ? "muni.officer@sandbox.local" : "citizen.guest@sandbox.local",
         displayName: role === "municipality" ? "Officer Miller" : "Sandbox Citizen",
         points: role === "citizen" ? 140 : 0,
         reportsCount: 1,
         votesCount: 3,
         badges: role === "citizen" ? ["Sandbox Hero"] : ["Lead Patrol Officer"],
         role: role
       });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9F4] font-sans text-[#3D3D33] flex flex-col items-center justify-center p-4">
      
      {/* Title block */}
      <div className="mb-6 text-center select-none">
        <div className="w-12 h-12 rounded-2xl bg-[#5A5A40] flex items-center justify-center shadow-lg mx-auto mb-3">
          <Landmark className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-3xl font-serif font-black text-[#2D2D24] tracking-tight">
          CivicAI <span className="text-[#5A5A40] italic font-normal">Agent</span>
        </h1>
        <p className="text-xs uppercase tracking-widest text-[#8A8A7A] mt-1 font-bold">Hyperlocal Citizen Hub & Ops</p>
      </div>

      {/* Main card */}
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#D9D2C5] p-6 sm:p-8 shadow-xl transition-all duration-300 relative overflow-hidden">
        
        {/* Decorative corner element */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#F2F0E9] rounded-bl-full -z-0 opacity-40 pointer-events-none" />

        {/* Account Mode selector tabs */}
        <div className="mb-6 bg-[#F2F0E9] p-1.5 rounded-2xl border border-[#D9D2C5] flex font-semibold relative z-10">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
            }}
            className={`flex-1 py-2.5 text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              !isSignUp 
                ? "bg-white text-[#2D2D24] shadow-md font-bold border border-[#D9D2C5]/50" 
                : "text-[#6B6B5B] hover:text-[#2D2D24]"
            }`}
          >
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
            }}
            className={`flex-1 py-2.5 text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              isSignUp 
                ? "bg-white text-[#2D2D24] shadow-md font-bold border border-[#D9D2C5]/50" 
                : "text-[#6B6B5B] hover:text-[#2D2D24]"
            }`}
          >
            <span>Create Account</span>
          </button>
        </div>

        {/* Portal Portal-Type Visual Header */}
        <div className="bg-[#FCFAF2] border border-[#EBE5D8] rounded-2xl p-4 mb-6 relative z-10 flex items-center gap-3">
          <div className={`p-2 rounded-xl text-white shadow-xs ${role === "citizen" ? "bg-[#5A5A40]" : "bg-[#C8A97E]"}`}>
            {role === "citizen" ? <Users className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A7A]">Target Application Portal</h4>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "citizen" | "municipality")}
              className="w-full bg-transparent border-0 text-xs font-bold text-[#2D2D24] focus:outline-hidden p-0 mt-0.5 cursor-pointer"
            >
              <option value="citizen">Citizen Portal (Report, vote & earn XP)</option>
              <option value="municipality">Municipality Operations (Verify, schedule & resolve issues)</option>
            </select>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs flex gap-2 items-start relative z-10 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-semibold">
              {error}
              {showConfigGuide && (
                <button 
                  type="button"
                  onClick={() => setShowConfigGuide(!showConfigGuide)}
                  className="block mt-1 text-[10px] text-orange-850 underline hover:no-underline font-bold"
                >
                  {showConfigGuide ? "Hide Firebase settings guide" : "Show Firebase settings guide"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Guide block if auth fails due to missing provider in Firebase console */}
        {showConfigGuide && (
          <div className="mb-5 p-4 rounded-xl bg-[#F2F0E9] border border-[#D9D2C5] text-[#3D3D33] text-[11px] space-y-2 relative z-10">
            <h5 className="font-bold flex items-center gap-1.5 text-xs text-[#5A5A40]">
              <HelpCircle className="w-3.5 h-3.5 text-[#5A5A40]" />
              <span>How to Enable Email/Password Auth:</span>
            </h5>
            <ol className="list-decimal pl-4 space-y-1 leading-relaxed text-[#5A5A40]">
              <li>Open your project in the <a href={`https://console.firebase.google.com/`} target="_blank" rel="noopener noreferrer" className="underline font-bold">Firebase Console</a></li>
              <li>Navigate to <strong>Authentication</strong> &gt; <strong>Sign-in method</strong> tab</li>
              <li>Click <strong>Add new provider</strong> and select <strong>Email/Password</strong></li>
              <li>Toggle it to <strong>Enabled</strong> and hit Save</li>
            </ol>
            <p className="text-[10px] text-[#8A8A7A] italic">Or alternatively, use Google Sign-In below which is fully pre-configured.</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4 relative z-10">
          {isSignUp && (
            <div>
              <label className="block text-[11px] font-bold text-[#8A8A7A] uppercase tracking-wider mb-1.5">Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-[#8A8A7A]">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Abhinay Sai Krishna"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#FDFDFB] border border-[#D9D2C5] focus:border-[#5A5A40] h-11 px-10 rounded-xl text-sm outline-hidden font-medium transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-[#8A8A7A] uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-[#8A8A7A]">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                placeholder="e.g. name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#FDFDFB] border border-[#D9D2C5] focus:border-[#5A5A40] h-11 px-10 rounded-xl text-sm outline-hidden font-medium transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#8A8A7A] uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-[#8A8A7A]">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#FDFDFB] border border-[#D9D2C5] focus:border-[#5A5A40] h-11 px-10 rounded-xl text-sm outline-hidden font-medium transition-all"
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5A5A40] hover:bg-[#4A4A33] disabled:bg-[#8A8A7A] text-white h-12 rounded-xl text-xs font-bold transition-all shadow-md mt-6 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Authenticating with Secure Server...</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? "Create Secure Account" : "Access Selected Portal"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 z-10 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#D9D2C5]" />
          </div>
          <span className="relative px-3 bg-white text-[10px] font-mono text-[#8A8A7A] uppercase">Or Authenticate With</span>
        </div>

        {/* Google sign in */}
        <div className="space-y-2 mt-2 select-none">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-[#F2F0E9] hover:bg-[#E7E2D5] disabled:opacity-50 text-[#5A5A40] h-11 rounded-xl text-xs font-bold border border-[#D9D2C5] transition-all flex items-center justify-center gap-3 cursor-pointer z-10 relative"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12V14.4h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.23z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Unified Google Account</span>
          </button>

          <button
            type="button"
            onClick={handleSandboxBypass}
            disabled={loading}
            className="w-full bg-[#FCFAF2] hover:bg-[#F2EFE4] disabled:opacity-50 text-[#C8A97E] h-11 rounded-xl text-xs font-black border-2 border-dashed border-[#C8A97E]/60 hover:border-[#C8A97E] transition-all flex items-center justify-center gap-2 cursor-pointer z-10 relative shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-[#C8A97E]" />
            <span>Instant sandbox Bypass Demo</span>
          </button>
        </div>

        {/* Bulletins under the card */}
        <div className="mt-6 flex items-center gap-2 bg-[#FCFAF2] p-3 rounded-xl border border-[#EBE5D8] select-none text-[10px] leading-tight text-[#8A8A7A]">
          <Info className="w-3.5 h-3.5 text-[#5A5A40] shrink-0" />
          <p>
            This sandbox environment is secured by TLS and integrated with Firestore rule guards. Standard citizens may participate immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
