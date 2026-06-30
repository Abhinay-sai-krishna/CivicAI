import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, addDoc, getDocs } from "firebase/firestore";
import { Issue, UserProfile, Comment } from "../types";
import { ThumbsUp, MapPin, Calendar, Clock, DollarSign, MessageSquare, ChevronDown, Check, Send, Sparkles, Share2, Clipboard, ArrowRight, Search, X, Cog, CheckCircle2, CalendarClock, BadgeCheck, AlertCircle, Building2, Camera, Trash2, Megaphone, Users, AlertTriangle, History, Linkedin, Twitter } from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";
import ResolutionTimeline from "./ResolutionTimeline";

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

const getSeverityConfig = (severity: string) => {
  const s = (severity || "").toLowerCase();
  if (s.includes("critical")) {
    return {
      borderColor: "border-l-rose-500 border-rose-100 bg-[#FFFDFD]",
      badgeBg: "bg-rose-50 border-rose-200 text-rose-700",
      dotBg: "bg-rose-600 animate-pulse",
      label: "Critical Urgency"
    };
  } else if (s.includes("high")) {
    return {
      borderColor: "border-l-orange-500 border-orange-100 bg-[#FFFEFA]",
      badgeBg: "bg-orange-50 border-orange-200 text-orange-700",
      dotBg: "bg-orange-500",
      label: "High Severity"
    };
  } else if (s.includes("medium") || s.includes("moderate")) {
    return {
      borderColor: "border-l-amber-500 border-amber-100 bg-[#FFFFFB]",
      badgeBg: "bg-amber-50 border-amber-200 text-amber-805",
      dotBg: "bg-amber-500",
      label: "Moderate Severity"
    };
  } else {
    return {
      borderColor: "border-l-emerald-500 border-emerald-100 bg-[#FCFDFB]",
      badgeBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
      dotBg: "bg-emerald-500",
      label: "Low Severity"
    };
  }
};

interface IssuesFeedProps {
  currentUser: UserProfile;
  onUserUpdate: (updatedProfile: UserProfile) => void;
  selectedCategory: string;
}

export default function IssuesFeed({ currentUser, onUserUpdate, selectedCategory }: IssuesFeedProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<{ [issueId: string]: Comment[] }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [verificationModes, setVerificationModes] = useState<{ [issueId: string]: boolean }>({});
  const [verificationPhotos, setVerificationPhotos] = useState<{ [issueId: string]: string | null }>({});
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<{ [issueId: string]: boolean }>({});
  const [selectedRepsMap, setSelectedRepsMap] = useState<{ [issueId: string]: string[] }>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
  });
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Load issues list from Firestore with live sub
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

  // Check for deep-linked issue ID to load comments and focus it
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const issueIdParam = params.get("issueId");
    if (issueIdParam) {
      setExpandedIssue(issueIdParam);
      loadCommentsFor(issueIdParam);
      
      setTimeout(() => {
        const element = document.getElementById(`issue-card-${issueIdParam}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }, [loading]);

  // Set up live comments triggers for any open issue expansions
  const loadCommentsFor = async (issueId: string) => {
    const comRef = collection(db, "issues", issueId, "comments");
    try {
      const q = query(comRef, orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);
      const list: Comment[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Comment);
      });
      setComments(prev => ({ ...prev, [issueId]: list }));
    } catch (err) {
      console.error("Failed loading discussion thread comments", err);
      handleFirestoreError(err, OperationType.GET, `issues/${issueId}/comments`);
    }
  };

  const handleToggleExpand = (issueId: string) => {
    if (expandedIssue === issueId) {
      setExpandedIssue(null);
    } else {
      setExpandedIssue(issueId);
      loadCommentsFor(issueId);
    }
  };

  // Actual backend upvoting logic
  const executeUpvote = async (issue: Issue) => {
    try {
      const issueRef = doc(db, "issues", issue.id);
      const updatedVotedUsers = [...(issue.votedUsers || []), currentUser.email];
      const newUpvoteCount = (issue.upvotes || 0) + 1;
      
      // Auto upgrade status to "Verified" if upvotes >= 3 and currently 'Reported'
      let newStatus = issue.status;
      const currentHistory = issue.statusHistory || [];
      let updatedHistory = [...currentHistory];

      if (issue.status === "Reported" && newUpvoteCount >= 3) {
        newStatus = "Verified";
        updatedHistory.push({
          status: "Verified",
          changedAt: new Date().toISOString(),
          changedBy: "Community Crowd Action",
          comment: `Issue successfully promoted to Verified state after reaching ${newUpvoteCount} citizen upvotes & verifications.`
        });
      }

      try {
        const updatePayload: any = {
          upvotes: newUpvoteCount,
          votedUsers: updatedVotedUsers,
          status: newStatus
        };
        if (newStatus !== issue.status) {
          updatePayload.statusHistory = updatedHistory;
        }
        await updateDoc(issueRef, updatePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `issues/${issue.id}`);
        throw err;
      }

      // Award Points to the Active Voter (+15 points)
      const userRef = doc(db, "users", currentUser.email);
      const updatedProfile: UserProfile = {
        ...currentUser,
        points: currentUser.points + 15,
        votesCount: currentUser.votesCount + 1,
        badges: currentUser.votesCount + 1 >= 10 && !currentUser.badges.includes("Alpha Voter")
          ? [...currentUser.badges, "Alpha Voter"]
          : currentUser.badges
      };
      
      try {
        await setDoc(userRef, updatedProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.email}`);
        throw err;
      }
      
      onUserUpdate(updatedProfile);

      alert(`Community verified! You earned +15 Citizen XP. Issue score and status updated.`);
    } catch (err: any) {
      console.error(err);
      alert(`Upvote failed: ${err.message || String(err)}`);
    }
  };

  // Upvote/Verification trigger (Asks for confirmation)
  const handleVerifyUpvote = async (issue: Issue) => {
    if (issue.votedUsers && issue.votedUsers.includes(currentUser.email)) {
      alert("You have already verified and upvoted this community report");
      return;
    }

    const isCritical = issue.severity === "Critical" || issue.urgency === "Immediate";
    setConfirmDialog({
      isOpen: true,
      title: isCritical ? "Verify & Endorse Critical Incident?" : "Confirm Public Verification?",
      message: isCritical 
        ? `You are about to cast a CRITICAL verification on "${issue.title}". This will immediately prioritize it and flag it for urgent dispatch by municipal field staff. Do you want to proceed?`
        : `Are you sure you want to verify and upvote "${issue.title}"? Your public verification endorses this report and earns you +15 XP.`,
      isDestructive: false,
      onConfirm: () => executeUpvote(issue)
    });
  };

  // Escalate to high level representative (MLA / Collector / Commissioner)
  const handleRepresentativeEscalation = async (issue: Issue, selectedReps: string[]) => {
    if (selectedReps.length === 0) {
      alert("Please select at least one representative to escalate to.");
      return;
    }

    try {
      const issueRef = doc(db, "issues", issue.id);
      const currentReps = issue.escalatedRepresentatives || [];
      const updatedReps = Array.from(new Set([...currentReps, ...selectedReps]));
      
      // Boost priority upvotes by +15 per new representative escalated
      const newRepsCount = updatedReps.length - currentReps.length;
      const boostAmount = newRepsCount * 15;
      const newUpvoteCount = (issue.upvotes || 0) + boostAmount;

      try {
        await updateDoc(issueRef, {
          isEscalatedToRepresentatives: true,
          escalatedRepresentatives: updatedReps,
          upvotes: newUpvoteCount
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `issues/${issue.id}`);
        throw err;
      }

      // Add a system escalation comment to the comment thread
      const commentColl = collection(db, "issues", issue.id, "comments");
      const repListText = selectedReps.join(", ");
      const cData = {
        userId: "system-escalation",
        userName: "🚨 CIVICAI ESCALATION BOT",
        text: `Escalated directly to the office of: [${repListText}]. Public campaign initiated to bypass unresponsive municipal channels. Priority score boosted (+${boostAmount} priority points).`,
        createdAt: new Date().toISOString(),
        isVerification: false
      };

      try {
        await addDoc(commentColl, cData);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `issues/${issue.id}/comments`);
        throw err;
      }

      // Award points to the user triggering the escalation (+30 XP)
      const userRef = doc(db, "users", currentUser.email);
      const updatedProfile: UserProfile = {
        ...currentUser,
        points: currentUser.points + 30,
        votesCount: currentUser.votesCount + 1,
        badges: currentUser.votesCount + 1 >= 10 && !currentUser.badges.includes("Alpha Voter")
          ? [...currentUser.badges, "Alpha Voter"]
          : currentUser.badges
      };
      
      try {
        await setDoc(userRef, updatedProfile);
        onUserUpdate(updatedProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.email}`);
        throw err;
      }

      alert(`🚨 Issue escalated successfully to [${repListText}]! System escalation log posted. You earned +30 Citizen XP!`);
      loadCommentsFor(issue.id);
    } catch (err: any) {
      console.error(err);
      alert(`Escalation failed: ${err.message || String(err)}`);
    }
  };

  // Share campaign on social media platforms to force attention
  const handleSocialEscalationShare = async (issue: Issue, platform: 'twitter' | 'linkedin' | 'native' | 'whatsapp') => {
    try {
      const issueRef = doc(db, "issues", issue.id);
      const currentShares = issue.socialSharesCount || 0;
      
      try {
        await updateDoc(issueRef, {
          socialSharesCount: currentShares + 1,
          upvotes: (issue.upvotes || 0) + 5 // Boost upvote score by +5 for social amplification!
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `issues/${issue.id}`);
        throw err;
      }

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
        text: `Public Campaign shared on ${platformNames[platform]} by a citizen. Amplifying visibility to force municipal resolution!`,
        createdAt: new Date().toISOString(),
        isVerification: false
      };

      try {
        await addDoc(commentColl, cData);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `issues/${issue.id}/comments`);
        throw err;
      }

      // Award points to the citizen (+15 XP)
      const userRef = doc(db, "users", currentUser.email);
      const updatedProfile: UserProfile = {
        ...currentUser,
        points: currentUser.points + 15,
        votesCount: currentUser.votesCount + 1,
        badges: currentUser.votesCount + 1 >= 10 && !currentUser.badges.includes("Alpha Voter")
          ? [...currentUser.badges, "Alpha Voter"]
          : currentUser.badges
      };
      
      try {
        await setDoc(userRef, updatedProfile);
        onUserUpdate(updatedProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.email}`);
        throw err;
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
            // Fallback copy to clipboard
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
      loadCommentsFor(issue.id);
    } catch (err: any) {
      console.error(err);
      alert(`Social share failed: ${err.message || String(err)}`);
    }
  };

  // Posting custom comment on specific issue
  const handlePostComment = async (issueId: string) => {
    if (!newComment.trim()) return;

    try {
      const isVerif = !!verificationModes[issueId];
      const verifPhoto = verificationPhotos[issueId] || "";

      const commentColl = collection(db, "issues", issueId, "comments");
      const cData = {
        userId: currentUser.email,
        userName: currentUser.displayName,
        text: newComment,
        createdAt: new Date().toISOString(),
        isVerification: isVerif,
        verificationPhoto: verifPhoto
      };

      try {
        await addDoc(commentColl, cData);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `issues/${issueId}/comments`);
        throw err;
      }

      // If posting as a Crowd Verification, boost the issue's priority score and update user points
      if (isVerif) {
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
          const issueRef = doc(db, "issues", issueId);
          const isAlreadyVoted = issue.votedUsers && issue.votedUsers.includes(currentUser.email);
          const updatedVotedUsers = isAlreadyVoted 
            ? (issue.votedUsers || []) 
            : [...(issue.votedUsers || []), currentUser.email];
          
          const newUpvoteCount = (issue.upvotes || 0) + 2;
          let newStatus = issue.status;
          const currentHistory = issue.statusHistory || [];
          let updatedHistory = [...currentHistory];

          if (issue.status === "Reported") {
            newStatus = "Verified";
            updatedHistory.push({
              status: "Verified",
              changedAt: new Date().toISOString(),
              changedBy: "Community Crowd Verification",
              comment: `Promoted to Verified state via dynamic citizen visual evidence. Verification report published.`
            });
          }

          try {
            const updatePayload: any = {
              upvotes: newUpvoteCount,
              votedUsers: updatedVotedUsers,
              status: newStatus
            };
            if (newStatus !== issue.status) {
              updatePayload.statusHistory = updatedHistory;
            }
            await updateDoc(issueRef, updatePayload);
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `issues/${issueId}`);
            throw err;
          }
        }

        // Award +25 points to the Crowd Verifier for valuable proof
        const userRef = doc(db, "users", currentUser.email);
        const updatedProfile: UserProfile = {
          ...currentUser,
          points: currentUser.points + 25,
          votesCount: currentUser.votesCount + 1,
          badges: currentUser.votesCount + 1 >= 10 && !currentUser.badges.includes("Alpha Voter")
            ? [...currentUser.badges, "Alpha Voter"]
            : currentUser.badges
        };
        
        try {
          await setDoc(userRef, updatedProfile);
          onUserUpdate(updatedProfile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.email}`);
          throw err;
        }

        alert("Crowd verification posted successfully! Photographic/written proof has boosted the issue priority score (+30 priority weight). You earned +25 Citizen XP!");
      }
      
      setNewComment("");
      setVerificationModes(prev => ({ ...prev, [issueId]: false }));
      setVerificationPhotos(prev => ({ ...prev, [issueId]: null }));
      loadCommentsFor(issueId);
    } catch (err: any) {
      console.error(err);
      alert("Comment failed to save");
    }
  };

  const handleUploadVerificationPhoto = (issueId: string, file: File) => {
    setIsProcessingPhoto(prev => ({ ...prev, [issueId]: true }));
    const reader = new FileReader();
    reader.onloadend = () => {
      setVerificationPhotos(prev => ({ ...prev, [issueId]: reader.result as string }));
      setIsProcessingPhoto(prev => ({ ...prev, [issueId]: false }));
    };
    reader.onerror = () => {
      setIsProcessingPhoto(prev => ({ ...prev, [issueId]: false }));
      alert("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (issue: Issue) => {
    const shareTitle = `CivicAI: ${issue.title}`;
    const shareText = `Please check out and vote on this civic report: "${issue.title}" located at ${issue.address}! Together we can coordinate street repair dispatches.`;
    const shareUrl = `${window.location.origin}${window.location.pathname}?issueId=${issue.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        console.log("navigator.share failed, using clipboard copy", err);
      }
    }

    // Fallback: Copy link
    copyToClipboard(shareUrl, issue.id);
  };

  // Filter local state based on active category and keyword search query
  const filteredIssues = issues.filter(issue => {
    const matchesCategory = selectedCategory === "all" || issue.category === selectedCategory;
    const matchesSearch = searchQuery.trim() === "" ||
      (issue.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (issue.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (issue.address || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[#8A8A7A]">
        <Clock className="w-8 h-8 animate-spin text-[#5A5A40] mb-2" />
        <p className="text-xs font-semibold uppercase tracking-wider">Broadcasting Community Updates Feed...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-[#3D3D33]">
      {/* KEYWORD SEARCH BAR */}
      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-[#8A8A7A]" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search issues by title, description or location..."
          className="w-full pl-10 pr-10 py-3 bg-white border border-[#D9D2C5] rounded-xl text-xs placeholder-[#8A8A7A] text-[#2D2D24] focus:outline-none focus:ring-1 focus:ring-[#5A5A40] focus:border-[#5A5A40] shadow-inner transition-all duration-200"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8A8A7A] hover:text-[#2D2D24]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {filteredIssues.length === 0 ? (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl border border-[#D9D2C5] p-8 text-center text-[#6B6B5B] shadow-sm"
          >
            <MapPin className="w-10 h-10 mx-auto text-[#D9D2C5] mb-2.5" />
            <h3 className="font-serif font-bold text-[#2D2D24] text-sm">
              {searchQuery ? "No Matching Results Found" : "No Active Reports Found"}
            </h3>
            <p className="text-xs text-[#8A8A7A] mt-1">
              {searchQuery 
                ? `No issues matched your search query for "${searchQuery}". Try editing your keywords.`
                : "Select a different category tab, or initiate a new community report!"}
            </p>
          </motion.div>
        ) : (
          filteredIssues.map((issue) => {
            const hasVoted = issue.votedUsers && issue.votedUsers.includes(currentUser.email);
            const isExpanded = expandedIssue === issue.id;
            const sev = getSeverityConfig(issue.severity);

            return (
              <motion.div 
                layout
                key={issue.id}
                id={`issue-card-${issue.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                whileHover={{ scale: 1.015, y: -2, boxShadow: "0 12px 24px -10px rgba(0, 0, 0, 0.12), 0 8px 16px -8px rgba(0, 0, 0, 0.08)" }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className={`rounded-2xl border-y border-r border-[#D9D2C5] border-l-4 p-5 shadow-sm transition-all duration-300 relative ${sev.borderColor} ${
                  issue.status === "Resolved" ? "bg-[#F8F9F4] opacity-80 border-l-slate-400" : ""
                }`}
              >
              {/* HEADING ACCENTS */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full ${
                    issue.category === "pothole" ? "bg-rose-50 text-rose-700 border border-rose-100" :
                    issue.category === "garbage" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                    issue.category === "leakage" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                    issue.category === "streetlight" ? "bg-yellow-50 text-yellow-800 border border-yellow-200" :
                    "bg-[#F2F0E9] text-[#5A5A40] border border-[#D9D2C5]/80"
                  }`}>
                    {issue.category}
                  </span>

                  <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-bold ml-1 flex items-center gap-1.5 border ${
                    issue.status === "Resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" :
                    issue.status === "In Progress" ? "bg-amber-50 text-amber-700 border-amber-200/60" :
                    issue.status === "Scheduled" ? "bg-sky-50 text-sky-700 border-sky-200/60" :
                    issue.status === "Verified" ? "bg-[#F2F0E9] text-[#5A5A40] border-[#D9D2C5]/60" :
                    "bg-slate-50 text-slate-700 border-slate-200"
                  }`}>
                    {issue.status === "Resolved" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    {issue.status === "In Progress" && <Cog className="w-3.5 h-3.5 text-amber-600 animate-spin" style={{ animationDuration: "3s" }} />}
                    {issue.status === "Scheduled" && <CalendarClock className="w-3.5 h-3.5 text-sky-600" />}
                    {issue.status === "Verified" && <BadgeCheck className="w-3.5 h-3.5 text-[#5A5A40]" />}
                    {issue.status !== "Resolved" && issue.status !== "In Progress" && issue.status !== "Scheduled" && issue.status !== "Verified" && <AlertCircle className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{issue.status}</span>
                  </span>

                  {/* Urgency Badge */}
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ml-1 flex items-center gap-1.5 border ${
                    issue.status === "Resolved" ? "bg-slate-100 text-slate-550 border-slate-205" : sev.badgeBg
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${issue.status === "Resolved" ? "bg-slate-400" : sev.dotBg}`} />
                    <span>{issue.status === "Resolved" ? "Resolved Urgency" : sev.label}</span>
                  </span>

                  {/* Priority Badge */}
                  {issue.priority && (
                    <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-bold ml-1 flex items-center gap-1.5 border ${
                      issue.priority === "Urgent" ? "bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-extrabold" :
                      issue.priority === "High" ? "bg-amber-100 text-amber-800 border-amber-300 font-extrabold" :
                      issue.priority === "Medium" ? "bg-blue-100 text-blue-800 border-blue-300 font-extrabold" :
                      "bg-emerald-100 text-emerald-850 border-emerald-300 font-extrabold"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        issue.priority === "Urgent" ? "bg-rose-600" :
                        issue.priority === "High" ? "bg-amber-600" :
                        issue.priority === "Medium" ? "bg-blue-600" :
                        "bg-emerald-600"
                      }`} />
                      <span>{issue.priority} Priority</span>
                    </span>
                  )}
                </div>

                <div className="text-[10px] font-mono text-[#8A8A7A] flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[#D9D2C5]" />
                  <span>{new Date(issue.reportedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* BODY LAYOUT */}
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div 
                  onClick={() => setLightboxImage({ url: issue.imageUrl, title: issue.title })}
                  className="w-full md:w-1/3 shrink-0 rounded-xl overflow-hidden bg-[#FBFBFA] border border-[#D9D2C5] max-h-40 md:max-h-none cursor-pointer hover:scale-[1.01] hover:opacity-95 transition-all duration-300"
                >
                  <img src={issue.imageUrl} alt={issue.title} className="w-full h-full min-h-32 object-cover" />
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-serif font-bold text-[#2D2D24] text-base mb-1 hover:text-[#5A5A40] transition-colors leading-snug">{issue.title}</h3>
                    <p className="text-xs text-[#6B6B5B] line-clamp-3 mb-2.5 leading-relaxed">{issue.description}</p>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B6B5B] mb-3 font-semibold pb-1.5 border-b border-dashed border-[#D9D2C5]">
                      <div className="flex items-center gap-1 text-[#3D3D33]">
                        <MapPin className="w-3.5 h-3.5 text-[#C8A97E] shrink-0" />
                        <span className="truncate max-w-xs">{issue.address}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {issue.estimatedCost?.includes("₹") ? (
                          <span className="text-xs font-bold text-[#5A5A40] shrink-0">₹</span>
                        ) : (
                          <DollarSign className="w-3.5 h-3.5 text-[#5A5A40]" />
                        )}
                        <span className="font-mono text-[#5A5A40]">{issue.estimatedCost}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleVerifyUpvote(issue)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                        hasVoted 
                          ? "bg-[#5A5A40] border-[#5A5A40] text-white shadow-sm" 
                          : "bg-white hover:bg-[#F2F0E9] border-[#D9D2C5] text-[#5A5A40]"
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 shrink-0" />
                      <span>{issue.upvotes || 0} Citizens Verified</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleExpand(issue.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F2F0E9] text-[#5A5A40] hover:bg-[#E5E2D9] border border-[#D9D2C5] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Review Details</span>
                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShare(issue)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        copiedId === issue.id 
                          ? "bg-[#5A5A40] border-[#5A5A40] text-white shadow-xs" 
                          : "bg-white hover:bg-[#F2F0E9] border-[#D9D2C5] text-[#5A5A40]"
                      }`}
                      title="Share this report with others"
                    >
                      {copiedId === issue.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white animate-bounce" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5 text-[#C8A97E]" />
                          <span>Share</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* EXPANDABLE VERIFICATION & DISCUSSION DRAWER */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[#D9D2C5] mt-4 pt-4 space-y-4 text-xs">
                  
                  {/* GEMINI RESOLUTION SUMMARY & ADVICE CARD */}
                  {issue.status === "Resolved" && (issue.resolutionSummary || issue.repairAdvice) && (
                    <div className="bg-[#FCFAF2] border border-emerald-300 rounded-xl p-4 space-y-3 relative overflow-hidden shadow-xs">
                      <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 w-16 h-16 bg-emerald-500/5 rounded-full pointer-events-none" />
                      
                      <div className="flex items-center gap-2 border-b border-dashed border-emerald-200 pb-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                          ✓
                        </div>
                        <h4 className="font-serif font-black text-[#2D2D24] text-xs">Official Resolution & Care Protocol</h4>
                        <span className="text-[8.5px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded ml-auto">
                          Verified Gemini Advice
                        </span>
                      </div>

                      <div className="space-y-2.5 select-text">
                        {issue.resolutionSummary && (
                          <div className="text-[11px] leading-relaxed text-[#3D3D33]">
                            <span className="block text-[10px] text-[#8A8A7A] font-extrabold uppercase tracking-wide">Resolution Summary:</span>
                            <p className="font-medium bg-emerald-50/10 p-2.5 rounded-lg border border-emerald-100/30 italic mt-0.5 font-serif">
                              "{issue.resolutionSummary}"
                            </p>
                          </div>
                        )}

                        {issue.repairAdvice && (
                          <div className="text-[11px] leading-relaxed text-[#3D3D33] border-t border-[#D9D2C5]/40 pt-2 flex flex-col">
                            <span className="text-[10px] text-amber-800 font-extrabold uppercase tracking-wide flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#C8A97E]" />
                              <span>Maintenance advice for citizens:</span>
                            </span>
                            <p className="font-mono text-[#5A5A40] mt-0.5 text-[10px] pl-1 font-semibold leading-relaxed">
                              {issue.repairAdvice}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MILESTONE MAP / STATUS VISUAL COMPONENT */}
                  <ResolutionTimeline issue={issue} />

                  {/* AI INSIGHT CARD */}
                  <div className="bg-[#F8F9F4] border border-[#D9D2C5] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#5A5A40] uppercase mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#C8A97E] shrink-0" />
                      <span>Gemini Auto-Mitigation Blueprint</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1.5">
                      <div>
                        <span className="block text-[10px] text-[#8A8A7A] font-bold">URGENCY CLASS:</span>
                        <p className="text-[#2D2D24] font-black flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#5A5A40]" />
                          {issue.urgency || "High"}
                        </p>
                        <p className="text-[#6B6B5B] leading-relaxed mt-1 text-[10.5px]">{issue.urgencyReason}</p>

                        {(issue.municipalityName || issue.estimatedResolutionTime) && (
                          <div className="mt-3 space-y-2 border-t border-[#D9D2C5]/50 pt-2.5">
                            {issue.municipalityName && (
                              <div className="flex gap-1.5 items-start text-[10.5px]">
                                <Building2 className="w-3.5 h-3.5 text-[#5A5A40] shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-[9px] text-[#8A8A7A] uppercase font-bold block">Assigned Municipal Office</span>
                                  <p className="font-bold text-[#2D2D24] leading-tight text-[11px]">{issue.municipalityName}</p>
                                  {issue.municipalityAddress && (
                                    <p className="text-[9.5px] text-[#6B6B5B] mt-0.5 leading-snug">{issue.municipalityAddress}</p>
                                  )}
                                </div>
                              </div>
                            )}
                            {issue.estimatedResolutionTime && (
                              <div className="flex gap-1.5 items-center text-[10.5px]">
                                <Clock className="w-3.5 h-3.5 text-[#C8A97E] shrink-0" />
                                <div>
                                  <span className="text-[9px] text-[#8A8A7A] uppercase font-bold block">Est. Resolution Time</span>
                                  <p className="font-bold text-[#2D2D24]">{issue.estimatedResolutionTime}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="border-t md:border-t-0 md:border-l border-[#D9D2C5] pt-2.5 md:pt-0 md:pl-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-[#8A8A7A] font-bold">COMPLAINT DOCS DRAFT</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(issue.complaintText || "", issue.id)}
                            className="px-2 py-0.5 rounded bg-white hover:bg-[#F2F0E9] border border-[#D9D2C5] text-[10px] hover:text-[#5A5A40] transition text-[#6B6B5B] font-semibold cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <Clipboard className="w-2.5 h-2.5" />
                            <span>{copiedId === issue.id ? "Copied" : "Copy Document"}</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-[#6B6B5B] font-mono italic mt-1 line-clamp-4 overflow-y-auto max-h-24 leading-normal bg-white p-2 rounded border border-[#D9D2C5] font-medium whitespace-pre-wrap">
                          {issue.complaintText || "No document loaded"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* REAL-TIME COMMUNICATOR OUTBOX LOGS */}
                  <div className="bg-[#F8F9F4] rounded-xl p-3 border border-[#D9D2C5]">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-serif font-bold text-[#2D2D24] uppercase tracking-wider text-[10px]">Virtual Automated Dispatches</h4>
                      <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <span className="w-1 h-1 bg-emerald-500 rounded-full" /> Live
                      </span>
                    </div>

                    <div className="space-y-1 font-mono text-[10px] text-[#6B6B5B]">
                      <div className="flex justify-between items-center py-0.5 border-b border-dashed border-[#D9D2C5]">
                        <span>LODGE EMAIL ALERT (Public Works Dept):</span>
                        <span className="font-medium text-[#2D2D24] bg-white px-1.5 rounded truncate max-w-xs">{`Sent [OK] → reports_${issue.category}@municipality.gov`}</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span>WHATSAPP INCIDENT TICKET:</span>
                        <span className="font-medium text-[#2D2D24] bg-white px-1.5 rounded">{`Broadcast [OK] → Ward Warden (+1 800 - LINE)`}</span>
                      </div>
                    </div>
                  </div>

                  {/* REPRESENTATIVE ESCALATION & PUBLIC PRESSURE CAMPAIGN */}
                  <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-4.5 space-y-3 relative overflow-hidden shadow-xs">
                    <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-20 h-20 bg-amber-500/5 rounded-full pointer-events-none" />
                    
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-dashed border-amber-200 pb-2">
                      <Megaphone className="w-4 h-4 text-amber-700 animate-pulse" />
                      <h4 className="font-serif font-black text-[#2D2D24] text-xs">Representative Escalation & Public Pressure</h4>
                      <span className="text-[8.5px] font-mono font-bold bg-amber-100/80 text-amber-900 px-1.5 py-0.5 rounded ml-auto">
                        {issue.isEscalatedToRepresentatives ? "🔥 Escalated Mode" : "⚡ Ready to Escalate"}
                      </span>
                    </div>

                    <p className="text-[10.5px] text-[#6B6B5B] leading-relaxed">
                      If municipal officers are slow or unresponsive, mobilize public coordination! Share the verified complaint draft to social media platforms or dispatch direct alerts to high-level district leaders to enforce immediate resolution.
                    </p>

                    {/* CAMPAIGN STATS ROW */}
                    <div className="grid grid-cols-2 gap-2 bg-white/70 p-2.5 rounded-lg border border-amber-200/30 text-[10px]">
                      <div>
                        <span className="text-[#8A8A7A] font-semibold block uppercase tracking-wider text-[8px]">Social Amplification</span>
                        <span className="font-mono font-bold text-[#3D3D33] flex items-center gap-1 mt-0.5">
                          <Users className="w-3.5 h-3.5 text-amber-600" />
                          <span>{issue.socialSharesCount || 0} Shares / Retweets</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A8A7A] font-semibold block uppercase tracking-wider text-[8px]">Leader Escalation Status</span>
                        <span className="font-mono font-bold text-[#3D3D33] flex items-center gap-1 mt-0.5 truncate">
                          <AlertTriangle className={`w-3.5 h-3.5 ${issue.isEscalatedToRepresentatives ? "text-rose-600 animate-bounce" : "text-slate-400"}`} />
                          <span className="truncate">
                            {issue.escalatedRepresentatives && issue.escalatedRepresentatives.length > 0 
                              ? issue.escalatedRepresentatives.join(", ") 
                              : "No leaders escalated yet"}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1 border-t border-amber-200/20">
                      {/* COLUMN 1: SOCIAL SHARING MOBILIZATION */}
                      <div className="space-y-2">
                        <span className="block text-[9px] text-[#8A8A7A] font-extrabold uppercase tracking-wide">
                          1. Social Media Pressure Campaign
                        </span>
                        
                        <div className="flex flex-col gap-1.5">
                          {isOverdue(issue) && (
                            <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-[10px] text-rose-800 leading-normal flex gap-1.5 items-start mb-1 shadow-3xs">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                              <div>
                                <span className="block font-black text-rose-950 uppercase tracking-tight">Overdue Resolution Ticket Breach!</span>
                                <p className="font-medium text-[10px] leading-relaxed mt-0.5">
                                  This ticket has been active longer than its estimated timeline of <span className="font-extrabold">{issue.estimatedResolutionTime || "72 Hours"}</span>. Mobilize immediate public interest on Twitter or LinkedIn using the Web Share hub to pressure officials!
                                </p>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSocialEscalationShare(issue, 'twitter')}
                            className="w-full py-1.5 px-3 bg-slate-900 hover:bg-black text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                          >
                            <Twitter className="w-3.5 h-3.5 text-white shrink-0" />
                            <span>Share on Twitter / X</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSocialEscalationShare(issue, 'linkedin')}
                            className="w-full py-1.5 px-3 bg-[#0077B5] hover:bg-[#00669c] text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                          >
                            <Linkedin className="w-3.5 h-3.5 text-white shrink-0" />
                            <span>Share on LinkedIn</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSocialEscalationShare(issue, 'native')}
                            className="w-full py-1.5 px-3 bg-[#5A5A40] hover:bg-[#4a4a33] text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                          >
                            <Share2 className="w-3.5 h-3.5 text-white shrink-0" />
                            <span>⚡ Web Share API (OS Hub)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSocialEscalationShare(issue, 'whatsapp')}
                            className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                          >
                            <svg className="w-3.5 h-3.5 fill-current text-white shrink-0" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.455 5.716 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            <span>Share to WhatsApp Groups</span>
                          </button>
                        </div>
                      </div>

                      {/* COLUMN 2: DIRECT OFFICIAL ESCALATION */}
                      <div className="space-y-2">
                        <span className="block text-[9px] text-[#8A8A7A] font-extrabold uppercase tracking-wide">
                          2. VIP Representative Escalation Dispatch
                        </span>

                        <div className="space-y-1.5">
                          {["District Collector", "Constituency MLA", "Municipal Commissioner"].map((rep) => {
                            const isSelected = (selectedRepsMap[issue.id] || []).includes(rep);
                            return (
                              <label key={rep} className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const current = selectedRepsMap[issue.id] || [];
                                    const updated = current.includes(rep)
                                      ? current.filter(r => r !== rep)
                                      : [...current, rep];
                                    setSelectedRepsMap(prev => ({ ...prev, [issue.id]: updated }));
                                  }}
                                  className="w-3.5 h-3.5 text-[#5A5A40] border-[#D9D2C5] rounded focus:ring-[#5A5A40]"
                                />
                                <span className="text-[10px] font-bold text-[#3D3D33]">{rep}</span>
                              </label>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => handleRepresentativeEscalation(issue, selectedRepsMap[issue.id] || [])}
                            className="mt-1 w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer shadow-3xs"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-white" />
                            <span>Trigger Direct VIP Escalation</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COMMUNITY CONVERSATION SECTION */}
                  <div>
                    <h4 className="font-serif font-bold text-[#2D2D24] uppercase tracking-wider text-[10px] mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#8A8A7A]" />
                      <span>Discussion Thread ({comments[issue.id]?.length || 0})</span>
                    </h4>

                    {/* COMMENTS LIST */}
                    <div className="space-y-2 mb-3 max-h-40 overflow-y-auto pr-1">
                      {(!comments[issue.id] || comments[issue.id].length === 0) ? (
                        <p className="text-[10.5px] italic text-[#8A8A7A] font-medium pl-1">No community comments left yet. Start the coordination below!</p>
                      ) : (
                        comments[issue.id].map((c) => {
                          const isVerif = c.isVerification;
                          return (
                            <div 
                              key={c.id} 
                              className={`p-2.5 rounded-xl border text-[10.5px] transition-all duration-200 ${
                                isVerif 
                                  ? "bg-amber-50/60 border-amber-200/80 shadow-xs" 
                                  : "bg-[#F8F9F4] border-[#D9D2C5]"
                              }`}
                            >
                              <div className="flex justify-between items-center text-[#8A8A7A] font-semibold mb-1">
                                <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                                  <span className="text-[#3D3D33] truncate">{c.userName}</span>
                                  {isVerif && (
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[8px] font-mono font-bold flex items-center gap-0.5 shrink-0 animate-pulse">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                      VERIFIED
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[9px]">{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="text-[#6B6B5B] leading-normal font-medium whitespace-pre-wrap">{c.text}</p>
                              {c.verificationPhoto && (
                                <div 
                                  onClick={() => setLightboxImage({ url: c.verificationPhoto!, title: `Verification Proof by ${c.userName}` })}
                                  className="mt-2 rounded-lg overflow-hidden border border-[#D9D2C5]/50 bg-white max-w-sm cursor-pointer hover:scale-[1.01] hover:opacity-95 transition-all duration-300"
                                >
                                  <img 
                                    src={c.verificationPhoto} 
                                    alt="Verification Proof" 
                                    className="w-full h-auto max-h-36 object-cover" 
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* CROWD VERIFICATION CONTROLS */}
                    <div className="mb-2.5 flex flex-col gap-1.5 bg-[#F2F0E9]/30 p-2 rounded-xl border border-[#D9D2C5]/60">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={!!verificationModes[issue.id]}
                          onChange={(e) => setVerificationModes(prev => ({ ...prev, [issue.id]: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#5A5A40] border-[#D9D2C5] rounded focus:ring-[#5A5A40]"
                        />
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-[10.5px] font-bold text-[#3D3D33]">Mark as Crowd Verification</span>
                        </div>
                      </label>

                      {verificationModes[issue.id] && (
                        <div className="mt-1.5 pl-5 space-y-1.5 border-l-2 border-amber-200">
                          <p className="text-[9.5px] text-[#6B6B5B] leading-snug">
                            ⭐ Crowd verification increases the issue priority score by <span className="font-bold text-[#2D2D24]">+2 upvotes (+30 priority points)</span> and awards you <span className="font-bold text-[#2D2D24]">+25 Citizen XP</span>.
                          </p>
                          
                          <div>
                            <input 
                              type="file" 
                              id={`file-upload-${issue.id}`}
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadVerificationPhoto(issue.id, e.target.files[0]);
                                }
                              }} 
                            />
                            <label 
                              htmlFor={`file-upload-${issue.id}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-[#5A5A40]/30 hover:border-[#5A5A40] rounded-lg text-[10px] font-bold text-[#5A5A40] bg-white hover:bg-white/80 transition-all cursor-pointer shadow-2xs"
                            >
                              <Camera className="w-3.5 h-3.5 text-[#5A5A40]" />
                              {isProcessingPhoto[issue.id] ? "Processing Photo..." : "Attach Verification Photo Proof"}
                            </label>

                            {verificationPhotos[issue.id] && (
                              <div className="relative mt-1.5 rounded-lg overflow-hidden border border-[#D9D2C5] bg-white p-1 max-w-xs flex items-center justify-between gap-2 shadow-3xs">
                                <img 
                                  onClick={() => setLightboxImage({ url: verificationPhotos[issue.id]!, title: "Verification Photo Proof Attachment" })}
                                  src={verificationPhotos[issue.id]!} 
                                  alt="Uploaded Verification Preview" 
                                  className="w-12 h-12 object-cover rounded-md border border-[#D9D2C5] cursor-pointer hover:opacity-90 transition-opacity" 
                                />
                                <span className="text-[9px] font-mono text-[#8A8A7A] truncate flex-1 pl-1">Photo attached successfully</span>
                                <button
                                  type="button"
                                  onClick={() => setVerificationPhotos(prev => ({ ...prev, [issue.id]: null }))}
                                  className="p-1 hover:bg-rose-50 text-rose-600 rounded transition-colors cursor-pointer"
                                  title="Remove photo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ADD COMMENT INPUT */}
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={verificationModes[issue.id] ? "Provide detailed crowd verification details..." : "Share local updates or query repair progress..."}
                        className="flex-1 text-xs border border-[#D9D2C5] rounded-lg bg-white px-2.5 text-[#3D3D33] focus:border-[#5A5A40] focus:outline-none"
                        onKeyDown={(e) => e.key === "Enter" && handlePostComment(issue.id)}
                      />
                      <button
                        type="button"
                        onClick={() => handlePostComment(issue.id)}
                        className="px-3 bg-[#5A5A40] hover:bg-[#4A4A33] text-white rounded-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          );
        })
      )}
      </AnimatePresence>

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDestructive={confirmDialog.isDestructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        confirmLabel={confirmDialog.title.includes("Critical") ? "Confirm Endorsement" : "Verify Report"}
        cancelLabel="Discard"
      />

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
