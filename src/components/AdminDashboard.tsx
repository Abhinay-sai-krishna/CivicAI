import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { Issue, UserProfile } from "../types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { ShieldCheck, ArrowRight, Loader2, Play, Trash2, CalendarCheck, CheckSquare, Sparkles, Filter, ChevronRight, BarChart3, ListOrdered, Compass, Mail, AlertCircle, CheckCircle2, Download } from "lucide-react";
import IssuesMap from "./IssuesMap";
import ConfirmationDialog from "./ConfirmationDialog";
import ResolutionTimeline from "./ResolutionTimeline";

interface AdminDashboardProps {
  currentUser: UserProfile;
}

// Custom curated Natural Tones colors for professional charts
const COLORS = ["#5A5A40", "#C8A97E", "#8A8A7A", "#B8986E", "#A37D63"];

export default function AdminDashboard({ currentUser }: AdminDashboardProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
  });

  const handleExportCSV = () => {
    // Define CSV headers
    const headers = [
      "Issue ID",
      "Title",
      "Description",
      "Category",
      "Status",
      "Severity",
      "Urgency",
      "Address",
      "Latitude",
      "Longitude",
      "Reported At",
      "Reported By",
      "Upvotes/Verifications",
      "Estimated Cost",
      "Municipality Assigned"
    ];

    // Map issues to rows
    const rows = issues.map((issue) => [
      issue.id,
      issue.title,
      issue.description,
      issue.category,
      issue.status,
      issue.severity,
      issue.urgency,
      issue.address,
      issue.lat,
      issue.lng,
      issue.reportedAt,
      issue.reportedBy,
      issue.upvotes || 0,
      issue.estimatedCost || "",
      issue.municipalityName || ""
    ]);

    // Format CSV content with proper escaping
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            const str = val === null || val === undefined ? "" : String(val);
            const escaped = str.replace(/"/g, '""');
            // Wrap in double quotes if string contains comma, quotes, or newlines
            if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
              return `"${escaped}"`;
            }
            return escaped;
          })
          .join(",")
      )
    ].join("\n");

    // Create file blob and trigger click download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `civic_issues_export_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  // Algorithm: Calculate a Predictive Priority weight score!
  // Severity: Critical = 100, High = 70, Medium = 40, Low = 10
  // Urgency: Immediate = 100, High = 70, Medium = 40, Low = 10
  // Upvotes: Each upvote adds 15 points
  const getPriorityWeight = (issue: Issue) => {
    let severityVal = 10;
    if (issue.severity === "Critical") severityVal = 100;
    else if (issue.severity === "High") severityVal = 70;
    else if (issue.severity === "Medium") severityVal = 40;

    let urgencyVal = 10;
    if (issue.urgency === "Immediate") urgencyVal = 100;
    else if (issue.urgency === "High") urgencyVal = 70;
    else if (issue.urgency === "Medium") urgencyVal = 40;

    const upvoteBonus = (issue.upvotes || 0) * 15;
    return severityVal + urgencyVal + upvoteBonus;
  };

  // Sort issues dynamically by algorithmic Priority Weight index, optionally filtered by category
  const filteredIssuesList = categoryFilter === "all"
    ? issues
    : issues.filter((issue) => issue.category === categoryFilter);

  const prioritizedIssues = [...filteredIssuesList].sort((a, b) => getPriorityWeight(b) - getPriorityWeight(a));

  // Construct charts data based on database topics
  const getCategoryStats = () => {
    const counts: { [key: string]: number } = {
      pothole: 0,
      garbage: 0,
      leakage: 0,
      streetlight: 0,
      other: 0,
    };
    issues.forEach((issue) => {
      if (counts[issue.category] !== undefined) {
        counts[issue.category]++;
      } else {
        counts.other++;
      }
    });

    return Object.keys(counts).map((key) => ({
      name: key.toUpperCase(),
      count: counts[key],
    }));
  };

  const getStatusStats = () => {
    const counts: { [key: string]: number } = {
      Reported: 0,
      Verified: 0,
      Scheduled: 0,
      "In Progress": 0,
      Resolved: 0,
    };
    issues.forEach((issue) => {
      if (counts[issue.status] !== undefined) {
        counts[issue.status]++;
      }
    });

    return Object.keys(counts).map((key) => ({
      name: key,
      value: counts[key],
    }));
  };

  // Carry out public status progress transition
  const handleTransitionStatus = async (targetStatus: Issue["status"]) => {
    if (!selectedIssue) return;
    setTransitionLoading(true);

    try {
      let resolutionData = { resolutionSummary: "", repairAdvice: "" };
      
      // If resolving the issue, call server-side Gemini to construct resolution summary & repair advice tip
      if (targetStatus === "Resolved") {
        try {
          const res = await fetch("/api/resolve-issue", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title: selectedIssue.title,
              category: selectedIssue.category,
              description: selectedIssue.description,
              address: selectedIssue.address
            })
          });
          
          if (res.ok) {
            resolutionData = await res.json();
          } else {
            console.warn("API returned error response for resolution tips");
          }
        } catch (apiErr) {
          console.error("Failed fetching resolution tips from Gemini API:", apiErr);
        }
      }

      const issueRef = doc(db, "issues", selectedIssue.id);
      const currentHistory = selectedIssue.statusHistory || [];
      const newHistoryEntry = {
        status: targetStatus,
        changedAt: new Date().toISOString(),
        changedBy: "Municipal Officer",
        comment: targetStatus === "Resolved" 
          ? `Issue resolved: ${resolutionData.resolutionSummary || "Successfully resolved by the localized municipal repair workflow."}` 
          : `Issue status progressed to ${targetStatus}.`
      };
      const updatedHistory = [...currentHistory, newHistoryEntry];

      try {
        const updatePayload: any = { 
          status: targetStatus,
          statusHistory: updatedHistory
        };
        if (targetStatus === "Resolved") {
          updatePayload.resolutionSummary = resolutionData.resolutionSummary || "Successfully resolved by the localized municipal repair workflow.";
          updatePayload.repairAdvice = resolutionData.repairAdvice || "Please notify community leaders if the issue regresses.";
        }
        await updateDoc(issueRef, updatePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `issues/${selectedIssue.id}`);
        throw err;
      }

      // Reward original reporter on successful repair milestone!
      // If we mark it Resolved: they get +150 points.
      // If we mark it In Progress: they get +50 points.
      if (targetStatus === "Resolved" || targetStatus === "In Progress") {
        const bonus = targetStatus === "Resolved" ? 150 : 50;
        const reporterEmail = selectedIssue.reportedBy;
        
        const repDocRef = doc(db, "users", reporterEmail);
        let repSnap;
        try {
          repSnap = await getDoc(repDocRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${reporterEmail}`);
          throw err;
        }
        
        if (repSnap.exists()) {
          const reporterProfile = repSnap.data() as UserProfile;
          const newPoints = (reporterProfile.points || 0) + bonus;
          
          try {
            await setDoc(repDocRef, {
              ...reporterProfile,
              points: newPoints,
              badges: targetStatus === "Resolved" && !reporterProfile.badges.includes("Civic Champion")
                ? [...reporterProfile.badges, "Civic Champion"]
                : reporterProfile.badges
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${reporterEmail}`);
            throw err;
          }
        }

        // Asynchronously trigger automated status update email notification
        try {
          fetch("/api/send-status-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              reporterEmail: reporterEmail,
              issueTitle: selectedIssue.title,
              status: targetStatus,
              municipalityName: selectedIssue.municipalityName || "District Municipal Office",
              resolutionSummary: targetStatus === "Resolved" 
                ? (resolutionData.resolutionSummary || "Successfully resolved by the localized municipal repair workflow.")
                : undefined,
              repairAdvice: targetStatus === "Resolved"
                ? (resolutionData.repairAdvice || "Please notify community leaders if the issue regresses.")
                : undefined,
              issueId: selectedIssue.id
            })
          })
          .then((res) => {
            if (res.ok) {
              return res.json().then((data) => {
                console.log("Automated status email sent successfully:", data);
                if (data.isEthereal) {
                  console.log(`[Developer SMTP Link]: ${data.etherealTestUrl}`);
                }
              });
            } else {
              res.text().then((text) => {
                console.warn("Backend responded with error for automated status email:", text);
              });
            }
          })
          .catch((emailErr) => {
            console.error("Failed to fetch automated status email endpoint:", emailErr);
          });
        } catch (emailErr) {
          console.error("Failed to trigger automated status email update:", emailErr);
        }
      }

      // Update local state selector reference
      setSelectedIssue((prev) => (prev ? { 
        ...prev, 
        status: targetStatus,
        resolutionSummary: targetStatus === "Resolved" ? (resolutionData.resolutionSummary || "Successfully resolved by the localized municipal repair workflow.") : prev.resolutionSummary,
        repairAdvice: targetStatus === "Resolved" ? (resolutionData.repairAdvice || "Please notify community leaders if the issue regresses.") : prev.repairAdvice,
        statusHistory: updatedHistory
      } : null));
      alert(`Success! Status changed to "${targetStatus}". ${targetStatus === "Resolved" ? "Gemini-powered Resolution Summary and Upkeep Advice generated & broadcasted successfully." : "Commenced automatic notifications."}`);
    } catch (err: any) {
      console.error(err);
      alert("Status transition failed");
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleBulkTransitionStatus = async (targetStatus: Issue["status"]) => {
    if (selectedIssueIds.length === 0) return;
    setTransitionLoading(true);

    try {
      let updatedCount = 0;
      
      for (const id of selectedIssueIds) {
        const issueToUpdate = issues.find((i) => i.id === id);
        if (!issueToUpdate) continue;

        let resolutionData = { resolutionSummary: "", repairAdvice: "" };

        // If resolving, we can fetch AI tips
        if (targetStatus === "Resolved") {
          try {
            const res = await fetch("/api/resolve-issue", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                title: issueToUpdate.title,
                category: issueToUpdate.category,
                description: issueToUpdate.description,
                address: issueToUpdate.address
              })
            });
            
            if (res.ok) {
              resolutionData = await res.json();
            }
          } catch (apiErr) {
            console.error("Failed fetching resolution tips for bulk issue:", id, apiErr);
          }
        }

        const issueRef = doc(db, "issues", id);
        const currentHistory = issueToUpdate.statusHistory || [];
        const newHistoryEntry = {
          status: targetStatus,
          changedAt: new Date().toISOString(),
          changedBy: "Municipal Officer",
          comment: targetStatus === "Resolved" 
            ? `Issue resolved via Bulk Action: ${resolutionData.resolutionSummary || "Successfully resolved by the bulk municipal repair workflow."}` 
            : `Issue status progressed to ${targetStatus} via Bulk Action.`
        };
        const updatedHistory = [...currentHistory, newHistoryEntry];

        const updatePayload: any = {
          status: targetStatus,
          statusHistory: updatedHistory
        };

        if (targetStatus === "Resolved") {
          updatePayload.resolutionSummary = resolutionData.resolutionSummary || "Successfully resolved by the bulk municipal repair workflow.";
          updatePayload.repairAdvice = resolutionData.repairAdvice || "Please notify community leaders if the issue regresses.";
        }

        try {
          await updateDoc(issueRef, updatePayload);
          updatedCount++;
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `issues/${id}`);
          throw err;
        }

        // Reward the original reporter
        if (targetStatus === "Resolved" || targetStatus === "In Progress") {
          const bonus = targetStatus === "Resolved" ? 150 : 50;
          const reporterEmail = issueToUpdate.reportedBy;
          
          const repDocRef = doc(db, "users", reporterEmail);
          let repSnap;
          try {
            repSnap = await getDoc(repDocRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${reporterEmail}`);
          }

          if (repSnap && repSnap.exists()) {
            const reporterProfile = repSnap.data() as UserProfile;
            const newPoints = (reporterProfile.points || 0) + bonus;
            
            try {
              await setDoc(repDocRef, {
                ...reporterProfile,
                points: newPoints,
                badges: targetStatus === "Resolved" && !reporterProfile.badges.includes("Civic Champion")
                  ? [...reporterProfile.badges, "Civic Champion"]
                  : reporterProfile.badges
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `users/${reporterEmail}`);
            }
          }

          // Trigger email notification
          try {
            fetch("/api/send-status-email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                reporterEmail: reporterEmail,
                issueTitle: issueToUpdate.title,
                status: targetStatus,
                municipalityName: issueToUpdate.municipalityName || "District Municipal Office",
                resolutionSummary: targetStatus === "Resolved" 
                  ? (resolutionData.resolutionSummary || "Successfully resolved by the bulk municipal repair workflow.")
                  : undefined,
                repairAdvice: targetStatus === "Resolved"
                  ? (resolutionData.repairAdvice || "Please notify community leaders if the issue regresses.")
                  : undefined,
                issueId: id
              })
            }).catch((e) => console.error("Email fetch fail", e));
          } catch (emailErr) {
            console.error("Bulk email trigger error:", emailErr);
          }
        }
      }

      alert(`Success! Status changed to "${targetStatus}" for ${updatedCount} selected issues.`);
      setSelectedIssueIds([]);
    } catch (err: any) {
      console.error(err);
      alert("Bulk status update failed");
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleUpdatePriority = async (newPriority: Issue["priority"]) => {
    if (!selectedIssue) return;
    setTransitionLoading(true);

    try {
      const issueRef = doc(db, "issues", selectedIssue.id);
      await updateDoc(issueRef, { priority: newPriority });

      setSelectedIssue((prev) => (prev ? { 
        ...prev, 
        priority: newPriority
      } : null));
      alert(`Success! Priority changed to "${newPriority}".`);
    } catch (err: any) {
      console.error(err);
      alert("Priority update failed");
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    setTransitionLoading(true);
    try {
      await deleteDoc(doc(db, "issues", issueId));
      setSelectedIssue(null);
      alert("This civic issue report has been permanently removed from the public database.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `issues/${issueId}`);
    } finally {
      setTransitionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[#8A8A7A]">
        <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40] mb-2" />
        <p className="text-xs font-semibold uppercase tracking-wider">Syncing Municipality Control Grid...</p>
      </div>
    );
  }

  const activeIssue = selectedIssue ? (issues.find((i) => i.id === selectedIssue.id) || selectedIssue) : null;

  return (
    <div id="admin-dashboard-container" className="space-y-6 animate-fade-in text-[#3D3D33]">
      
      {/* HEADER SECTION */}
      <div className="bg-[#5A5A40] p-6 rounded-2xl text-white shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2.5 mb-2">
            <ShieldCheck className="w-5 h-5 text-white shrink-0" />
            <span className="text-[10px] uppercase font-mono font-black tracking-widest text-white bg-white/10 border border-white/20 px-2 py-0.5 rounded-full">
              Operations Console
            </span>
          </div>
          <h2 className="text-xl font-serif font-bold tracking-tight">Municipality Control Center</h2>
          <p className="text-xs text-[#F2F0E9] max-w-lg mt-1">
            Predictive Priority Marshalling, visual case charts, and resolution dispatch. Automated complaint transcripts synced from citizen uploads.
          </p>
        </div>
        <div className="shrink-0 z-10 flex items-center">
          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full md:w-auto bg-white text-[#5A5A40] hover:bg-[#F2F0E9] transition-all px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-md border border-white/20"
            title="Download full database snapshot as comma-separated values"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV Database</span>
          </button>
        </div>
      </div>

      {/* STATISTICAL CHARTS BLOCK */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#D9D2C5] shadow-sm">
          <div className="flex items-center gap-1.5 mb-3">
            <BarChart3 className="w-4 h-4 text-[#5A5A40]" />
            <h3 className="font-serif font-bold text-xs uppercase tracking-wider text-[#2D2D24]">Reports by Category</h3>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={getCategoryStats()} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6B6B5B" }} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#6B6B5B" }} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8, borderColor: "#D9D2C5" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {getCategoryStats().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#D9D2C5] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ShieldCheck className="w-4 h-4 text-[#5A5A40]" />
              <h3 className="font-serif font-bold text-xs uppercase tracking-wider text-[#2D2D24]">Case Backlog Status</h3>
            </div>
            <div className="h-32 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={getStatusStats().filter(s => s.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {getStatusStats().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Legend indicators */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-[#6B6B5B] font-semibold border-t border-[#D9D2C5] pt-2.5">
            {getStatusStats().map((stat, idx) => (
              <div key={stat.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span>{stat.name}: {stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GEOGRAPHIC DISPATCH MATRIX (LIVE INTERACTIVE MAP) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-3 rounded-2xl border border-[#D9D2C5] shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#F2F0E9] rounded-xl border border-[#D9D2C5]/60 text-[#5A5A40]">
              <Compass className="w-5 h-5 text-[#5A5A40] animate-pulse" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-sm text-[#2D2D24] leading-tight">Live Operations Map & Dispatch Layer</h3>
              <p className="text-[10px] text-[#8A8A7A] font-mono tracking-wider">REAL-TIME GPS TELEMETRY MAP LAYER • DIRECT LINK TO FIELD STAFF COMPLAINTS</p>
            </div>
          </div>

          {/* Quick Category Filter Controls */}
          <div className="flex flex-wrap bg-[#F2F0E9] p-1 rounded-xl border border-[#D9D2C5] font-semibold text-[10px] text-slate-500 gap-1 select-none">
            {[
              { id: "all", label: "All Cases" },
              { id: "pothole", label: "Potholes" },
              { id: "garbage", label: "Garbage" },
              { id: "streetlight", label: "Lights" },
              { id: "leakage", label: "Leakages" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-extrabold uppercase tracking-wider ${
                  categoryFilter === cat.id
                    ? "bg-[#5A5A40] text-white shadow-xs"
                    : "hover:bg-[#E5E2D9] text-[#6B6B5B]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Map Layer */}
        <IssuesMap selectedCategory={categoryFilter} />
      </div>

      {/* PRIORITIZED BACKLOG GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: CRITICAL PRIORITY QUEUE */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-[#D9D2C5] shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-[#D9D2C5] pb-2.5">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-[#C8A97E]" />
              <h3 className="font-serif font-bold text-sm text-[#2D2D24]">Predictive Urgency Backlog</h3>
            </div>
            <span className="text-[10px] bg-[#F2F0E9] text-[#5A5A40] font-mono font-bold px-2 py-0.5 rounded-full border border-[#D9D2C5]/50">
              {prioritizedIssues.length} cases
            </span>
          </div>

          {/* Bulk Selection Sub-header */}
          <div className="flex items-center justify-between bg-[#FBFBFA] px-3 py-2 rounded-xl border border-[#D9D2C5]/60 mb-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prioritizedIssues.length > 0 && selectedIssueIds.length === prioritizedIssues.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIssueIds(prioritizedIssues.map((i) => i.id));
                  } else {
                    setSelectedIssueIds([]);
                  }
                }}
                className="w-4 h-4 rounded text-[#5A5A40] border-[#D9D2C5] focus:ring-[#5A5A40] cursor-pointer"
              />
              <span className="font-semibold text-[#6B6B5B]">
                {selectedIssueIds.length > 0 ? `Selected ${selectedIssueIds.length} of ${prioritizedIssues.length}` : "Select All for Bulk Action"}
              </span>
            </label>
            {selectedIssueIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIssueIds([])}
                className="text-[11px] text-red-600 hover:text-red-700 font-bold transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Bulk Action Controls */}
          {selectedIssueIds.length > 0 && (
            <div className="mb-4 p-3 bg-[#FCFAF5] border border-[#E5DFD3] rounded-xl space-y-2.5 animate-fade-in shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black text-[#5A5A40] tracking-wider">
                  Bulk Status Updates
                </span>
                <span className="text-[9px] font-mono font-bold text-[#8A8A7A]">
                  ACTION TO ALL SELECTED
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["Scheduled", "In Progress", "Resolved"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={transitionLoading}
                    onClick={() => handleBulkTransitionStatus(status)}
                    className="py-1.5 px-2 bg-[#5A5A40]/10 hover:bg-[#5A5A40]/25 text-[#5A5A40] rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer text-center"
                  >
                    Set {status}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
            {prioritizedIssues.map((issue, idx) => {
              const weightPr = getPriorityWeight(issue);
              const isSelected = selectedIssue?.id === issue.id;

              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className={`p-3 rounded-xl border transition-all text-xs cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected 
                      ? "ring-2 ring-[#5A5A40] border-[#D9D2C5] bg-[#F8F9F4]" 
                      : "border-transparent bg-[#FBFBFA] hover:bg-[#F2F0E9]/50 hover:border-[#D9D2C5]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIssueIds.includes(issue.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                          setSelectedIssueIds((prev) => [...prev, issue.id]);
                        } else {
                          setSelectedIssueIds((prev) => prev.filter((id) => id !== issue.id));
                        }
                      }}
                      className="w-4 h-4 rounded text-[#5A5A40] border-[#D9D2C5] focus:ring-[#5A5A40] cursor-pointer shrink-0"
                    />
                    <span className="font-mono text-xs font-black text-[#8A8A7A] w-5 shrink-0 text-center">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-serif font-bold text-[#2D2D24] leading-tight truncate">{issue.title}</h4>
                      <p className="text-[10.5px] text-[#6B6B5B] truncate mt-0.5">{issue.address}</p>
                      
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          issue.severity === "Critical" ? "bg-rose-100 text-rose-800" :
                          issue.severity === "High" ? "bg-amber-100 text-amber-800" : "bg-[#F2F0E9] text-[#5A5A40]"
                        }`}>
                          {issue.severity} Severity
                        </span>
                        <span className="text-[9px] font-semibold text-[#8A8A7A]">
                          {issue.upvotes} Votes
                        </span>
                        {issue.priority && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            issue.priority === "Urgent" ? "bg-red-50 text-red-700 border-red-200 animate-pulse" :
                            issue.priority === "High" ? "bg-amber-50 text-amber-750 border-amber-200" :
                            issue.priority === "Medium" ? "bg-blue-50 text-blue-750 border-blue-200" :
                            "bg-emerald-50 text-emerald-750 border-emerald-200"
                          }`}>
                            {issue.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block text-[10px] text-[#8A8A7A] font-bold uppercase">Priority Index</span>
                    <span className={`font-mono font-bold text-sm block ${
                      weightPr > 150 ? "text-rose-700 font-black" :
                      weightPr > 100 ? "text-amber-700 font-black" : "text-[#5A5A40]"
                    }`}>
                      {weightPr}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTION STATION */}
        <div className="lg:col-span-7">
          {activeIssue ? (
            <div className="bg-white p-5 rounded-2xl border border-[#D9D2C5] shadow-sm space-y-4 sticky top-4 animate-fade-in">
              <div className="border-b border-[#D9D2C5] pb-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[9px] uppercase tracking-wide font-bold bg-[#F2F0E9] text-[#5A5A40] px-2 py-0.5 rounded-full border border-[#D9D2C5]/30">
                    {activeIssue.category}
                  </span>
                  <span className="text-[10px] font-bold text-[#C8A97E] font-mono">
                    Urgency: {activeIssue.urgency}
                  </span>
                </div>
                <h3 className="font-serif font-bold text-[#2D2D24] text-sm mt-1.5 leading-tight">{activeIssue.title}</h3>
                <p className="text-[11px] text-[#6B6B5B] leading-normal mt-1">{activeIssue.description}</p>
                <p className="text-[10.5px] text-[#5A5A40] bg-[#F8F9F4] p-2.5 rounded-lg border border-[#D9D2C5] italic mt-2">
                  <strong>AI Urgency Analysis:</strong> {activeIssue.urgencyReason}
                </p>
              </div>

              {/* ESTIMATE COST / REPORTER */}
              <div className="bg-[#F8F9F4] p-3 rounded-xl border border-[#D9D2C5]/60 text-[11px] space-y-1.5 text-[#3D3D33]">
                <div className="flex justify-between">
                  <span className="text-[#8A8A7A] font-semibold font-mono">Reporter:</span>
                  <span className="text-[#2D2D24] font-bold max-w-[150px] truncate">{activeIssue.reportedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8A8A7A] font-semibold font-mono">Incident Coordinates:</span>
                  <span className="text-[#2D2D24] font-bold">{activeIssue.lat.toFixed(4)}, {activeIssue.lng.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-[#D9D2C5] pt-1.5 mt-1 text-[#5A5A40]">
                  <span className="uppercase tracking-wider text-[10px]">Estimated Repair Budget:</span>
                  <span className="font-mono text-[#5A5A40]">{activeIssue.estimatedCost}</span>
                </div>
              </div>

              {/* MUNICIPAL PRIORITY OVERRIDE FLAGGER */}
              <div className="space-y-2 bg-[#FCFAF5] p-3.5 rounded-xl border border-[#E5DFD3] shadow-xs">
                <span className="text-[10px] text-[#5A5A40] uppercase font-extrabold tracking-wider block">
                  Assign Municipal Priority Level
                </span>
                <div className="grid grid-cols-4 gap-1.5 bg-[#F2F0E9] p-1 rounded-xl border border-[#D9D2C5]">
                  {(['Low', 'Medium', 'High', 'Urgent'] as const).map((pr) => {
                    const isCurrent = activeIssue.priority === pr;
                    return (
                      <button
                        key={pr}
                        type="button"
                        onClick={() => handleUpdatePriority(pr)}
                        className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          isCurrent
                            ? pr === "Urgent" ? "bg-rose-600 text-white shadow-xs animate-pulse" :
                              pr === "High" ? "bg-amber-600 text-white shadow-xs" :
                              pr === "Medium" ? "bg-blue-600 text-white shadow-xs" :
                              "bg-emerald-600 text-white shadow-xs"
                            : "text-[#6B6B5B] hover:bg-[#E5E2D9] active:bg-[#D9D2C5]"
                        }`}
                      >
                        {pr}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TRANSITION COMMAND BOARD */}
              <div className="space-y-2">
                <span className="text-[10px] text-[#8A8A7A] uppercase font-extrabold tracking-wider block">
                  Step-by-step dispatch workflow
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={transitionLoading || activeIssue.status === "Scheduled"}
                    onClick={() => handleTransitionStatus("Scheduled")}
                    className="py-2.5 px-3 bg-[#C8A97E] hover:bg-[#B8986E] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-xs disabled:opacity-40 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Approve & Schedule</span>
                  </button>

                  <button
                    type="button"
                    disabled={transitionLoading || activeIssue.status === "In Progress"}
                    onClick={() => handleTransitionStatus("In Progress")}
                    className="py-2.5 px-3 bg-[#B8986E] hover:bg-[#A37D63] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-xs disabled:opacity-40 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Deploy Work Crew</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={transitionLoading || activeIssue.status === "Resolved"}
                  onClick={() => handleTransitionStatus("Resolved")}
                  className="w-full py-2.5 bg-[#5A5A40] hover:bg-[#4A4A33] text-white rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Declare Case RESOLVED!</span>
                </button>

                <div className="border-t border-[#D9D2C5]/40 my-2 pt-2">
                  <button
                    type="button"
                    disabled={transitionLoading}
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: "Delete Civic Issue Report?",
                        message: `Are you sure you want to permanently delete "${activeIssue.title}"? This action is highly destructive and cannot be undone.`,
                        isDestructive: true,
                        onConfirm: () => handleDeleteIssue(activeIssue.id),
                      });
                    }}
                    className="w-full py-2 bg-white hover:bg-rose-50 hover:border-rose-300 border border-[#D9D2C5] text-rose-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Delete Report</span>
                  </button>
                </div>
              </div>

              <ResolutionTimeline issue={activeIssue} />

              {activeIssue.status === "Resolved" && (activeIssue.resolutionSummary || activeIssue.repairAdvice) && (
                <div className="bg-[#FCFAF2] border border-emerald-300 rounded-xl p-3.5 space-y-2.5 mt-2 leading-relaxed text-[11px] animate-fade-in shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs font-serif font-black text-emerald-800">
                    <Sparkles className="w-3.5 h-3.5 text-[#C8A97E]" />
                    <span>Gemini Resolution Broadcast</span>
                  </div>
                  {selectedIssue.resolutionSummary && (
                    <div>
                      <span className="block text-[9.5px] font-extrabold text-[#8A8A7A] uppercase tracking-wider">Resolution Summary:</span>
                      <p className="text-[#3D3D33] italic bg-white p-2 rounded-lg border border-[#D9D2C5]/50 mt-0.5">
                        "{selectedIssue.resolutionSummary}"
                      </p>
                    </div>
                  )}
                  {selectedIssue.repairAdvice && (
                    <div>
                      <span className="block text-[9.5px] font-extrabold text-amber-805 uppercase tracking-wider">Upkeep & Maintenace Tip:</span>
                      <p className="text-[#5A5A40] font-mono text-[10px] bg-white p-2 rounded-lg border border-[#D9D2C5]/50 mt-0.5 font-semibold">
                        {selectedIssue.repairAdvice}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-[#FBFBFA] border border-[#D9D2C5] p-2.5 rounded-lg text-[10px] text-[#5A5A40] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C8A97E] shrink-0" />
                <p className="leading-normal font-medium">Resolving issues awards the original citizen with 150 points, incentivizing ongoing street health partnerships!</p>
              </div>

            </div>
          ) : (
            <div className="bg-[#F8F9F4] border border-[#D9D2C5] rounded-2xl p-8 text-center text-[#8A8A7A] flex flex-col justify-center items-center py-16 h-full">
              <ShieldCheck className="w-10 h-10 text-[#D9D2C5] mb-2" />
              <h4 className="font-serif font-bold text-[#2D2D24] text-sm">Select Backlog Case</h4>
              <p className="text-xs text-[#8A8A7A] mt-1 max-w-xs leading-normal">
                Click any reported incident card on the predictive priority queue to access workflow dispatches, budgets, and resolution triggers.
              </p>
            </div>
          )}
        </div>

      </div>

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDestructive={confirmDialog.isDestructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        confirmLabel={confirmDialog.isDestructive ? "Permanently Delete" : "Confirm"}
        cancelLabel="Discard"
      />
    </div>
  );
}
