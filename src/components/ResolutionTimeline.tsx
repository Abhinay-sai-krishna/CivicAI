import React from "react";
import { Issue, StatusHistoryEntry } from "../types";
import { 
  CheckCircle2, 
  Clock, 
  User, 
  ShieldAlert, 
  Wrench, 
  CalendarClock, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";
import { motion } from "motion/react";

interface ResolutionTimelineProps {
  issue: Issue;
}

const STAGES: { 
  status: 'Reported' | 'Verified' | 'Scheduled' | 'In Progress' | 'Resolved'; 
  label: string; 
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}[] = [
  { 
    status: 'Reported', 
    label: 'Reported', 
    description: 'Complaint submitted & verified via Gemini AI',
    icon: ShieldAlert,
    colorClass: 'bg-amber-600'
  },
  { 
    status: 'Verified', 
    label: 'Verified', 
    description: 'Community endorsement or administrative validation',
    icon: CheckCircle2,
    colorClass: 'bg-[#5A5A40]'
  },
  { 
    status: 'Scheduled', 
    label: 'Scheduled', 
    description: 'Repair estimation & inspector dispatch',
    icon: CalendarClock,
    colorClass: 'bg-[#C8A97E]'
  },
  { 
    status: 'In Progress', 
    label: 'In Progress', 
    description: 'Municipal engineering team on-site',
    icon: Wrench,
    colorClass: 'bg-[#B8986E]'
  },
  { 
    status: 'Resolved', 
    label: 'Resolved', 
    description: 'Final repairs verified & citizen closed',
    icon: CheckCircle2,
    colorClass: 'bg-emerald-600'
  }
];

const formatDuration = (startStr?: string, endStr?: string) => {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diffMs = end - start;
  if (diffMs <= 0) return "Instant";
  
  const diffHrs = diffMs / (1000 * 60 * 60);
  if (diffHrs < 1) {
    const mins = Math.round(diffMs / (1000 * 60));
    return `${mins}m`;
  }
  if (diffHrs < 24) {
    const hrs = Math.floor(diffHrs);
    const mins = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  const days = Math.floor(diffHrs / 24);
  const remainingHrs = Math.round(diffHrs % 24);
  return remainingHrs > 0 ? `${days}d ${remainingHrs}h` : `${days}d`;
};

export default function ResolutionTimeline({ issue }: ResolutionTimelineProps) {
  // Find current stage index
  const currentStageIndex = STAGES.findIndex(s => s.status === issue.status);

  // Reconstruct history with default values if history entries are missing
  const reconstructedHistory: { 
    status: Issue['status'];
    changedAt: string;
    changedBy: string;
    comment: string;
    isCompleted: boolean;
    durationFromPrevious?: string | null;
  }[] = STAGES.map((stage, idx) => {
    const isCompleted = idx <= currentStageIndex;
    
    // Find matching entry from firestore
    const explicitEntry = issue.statusHistory?.find(h => h.status === stage.status);
    
    let changedAt = "";
    let changedBy = "";
    let comment = "";

    if (stage.status === 'Reported') {
      changedAt = issue.reportedAt;
      changedBy = issue.reportedBy || "Citizen";
      comment = explicitEntry?.comment || "Civic report registered successfully in the system.";
    } else if (explicitEntry) {
      changedAt = explicitEntry.changedAt;
      changedBy = explicitEntry.changedBy;
      comment = explicitEntry.comment || `Issue updated to ${stage.status}.`;
    } else if (isCompleted) {
      // Fallback transition times if explicit log is missing
      changedAt = issue.reportedAt; // Fallback
      changedBy = "Municipality Agent";
      comment = `System transitioned case state to ${stage.status}.`;
    }

    return {
      status: stage.status,
      changedAt,
      changedBy,
      comment,
      isCompleted,
    };
  });

  // Calculate chronological duration step-gaps
  reconstructedHistory.forEach((item, idx) => {
    if (idx > 0 && item.isCompleted && reconstructedHistory[idx - 1].isCompleted) {
      item.durationFromPrevious = formatDuration(
        reconstructedHistory[idx - 1].changedAt, 
        item.changedAt
      );
    }
  });

  return (
    <div className="bg-[#FBFBFA] rounded-xl p-4 border border-[#D9D2C5]/80 space-y-4">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-[#D9D2C5]/50 pb-2">
        <h5 className="font-serif font-extrabold text-[#2D2D24] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#5A5A40]" />
          <span>Resolution Lifecycle Audit</span>
        </h5>
        <span className="text-[8px] font-mono text-amber-900 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
          State-Transition Audit Trail
        </span>
      </div>

      {/* STEP-TRACKER BAR FLOW CHART */}
      <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center py-4 px-2 bg-white rounded-xl border border-[#D9D2C5]/40 shadow-3xs overflow-hidden gap-y-4">
        {/* Background connector line for desktop */}
        <div className="absolute hidden md:block left-[10%] right-[10%] top-[34px] h-[3px] bg-[#E5E2D9] -z-0" />
        
        {STAGES.map((stage, idx) => {
          const historyItem = reconstructedHistory[idx];
          const isCompleted = historyItem?.isCompleted;
          const isCurrent = issue.status === stage.status;
          const StageIcon = stage.icon;

          return (
            <div key={stage.status} className="flex md:flex-col items-center z-10 w-full md:w-1/5 relative gap-x-3 md:gap-x-0">
              {/* Animated Progress Connector Line on Mobile */}
              {idx > 0 && (
                <div className="absolute md:hidden left-5 -top-5 bottom-5 w-[2px] bg-[#E5E2D9]" />
              )}
              
              {/* Badge Icon */}
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs border transition-all ${
                  isCurrent 
                    ? "bg-amber-500 border-amber-600 text-white ring-4 ring-amber-100" 
                    : isCompleted
                      ? `${stage.colorClass} border-transparent text-white`
                      : "bg-[#F2F0E9] border-[#D9D2C5] text-[#8A8A7A]"
                }`}
              >
                <StageIcon className="w-5 h-5" />
              </motion.div>

              {/* Text Meta info */}
              <div className="text-left md:text-center mt-0 md:mt-2.5 flex-1">
                <p className={`text-[10px] font-black leading-tight ${isCurrent ? "text-amber-800" : isCompleted ? "text-[#2D2D24]" : "text-[#8A8A7A]"}`}>
                  {stage.label}
                </p>
                {isCompleted && historyItem.changedAt && (
                  <p className="text-[8px] text-[#6B6B5B] font-mono mt-0.5 leading-none">
                    {new Date(historyItem.changedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                )}
                {!isCompleted && (
                  <p className="text-[8px] text-[#8A8A7A] font-mono mt-0.5 leading-none">
                    Pending
                  </p>
                )}
              </div>

              {/* Connecting Duration Arrow for desktop */}
              {idx < STAGES.length - 1 && reconstructedHistory[idx + 1]?.isCompleted && (
                <div className="hidden md:flex absolute top-1 left-[70%] right-[-30%] items-center justify-center z-20">
                  {reconstructedHistory[idx + 1].durationFromPrevious && (
                    <span className="text-[8px] font-mono font-bold bg-[#FBFBFA] border border-[#D9D2C5] text-[#5A5A40] px-1.5 py-0.2 rounded-full shadow-3xs flex items-center gap-0.5 max-w-[54px] truncate">
                      ⏱️ {reconstructedHistory[idx + 1].durationFromPrevious}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CHRONOLOGICAL HISTORICAL TIMELINE CARD LIST */}
      <div className="relative pl-3.5 border-l-2 border-[#D9D2C5] space-y-4 ml-2.5 pt-1.5 select-text">
        {reconstructedHistory.filter(h => h.isCompleted).map((entry, index) => {
          const isCurrent = entry.status === issue.status && issue.status !== "Resolved";
          const matchedStage = STAGES.find(s => s.status === entry.status);
          const StageIcon = matchedStage?.icon || AlertCircle;

          return (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              key={entry.status} 
              className="relative"
            >
              {/* Pulse Dot Indicator */}
              <div className={`absolute -left-[23.5px] top-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                isCurrent 
                  ? "bg-amber-500 border-white ring-2 ring-amber-300 animate-pulse text-white" 
                  : entry.status === "Resolved"
                    ? "bg-emerald-600 border-white text-white"
                    : "bg-[#5A5A40] border-white text-white"
              }`}>
                <StageIcon className="w-2 h-2" />
              </div>

              {/* Audit Entry Panel */}
              <div className={`rounded-xl border p-3 space-y-1.5 transition-all shadow-3xs ${
                isCurrent 
                  ? "bg-amber-50/50 border-amber-200/80" 
                  : entry.status === "Resolved"
                    ? "bg-emerald-50/20 border-emerald-200/50"
                    : "bg-white border-[#D9D2C5]/70"
              }`}>
                
                {/* Entry title line */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isCurrent
                        ? "bg-amber-100 text-amber-900 border-amber-300/60"
                        : entry.status === "Resolved"
                          ? "bg-emerald-100 text-emerald-900 border-emerald-300/60"
                          : "bg-[#F2F0E9] text-[#2D2D24] border-[#D9D2C5]"
                    }`}>
                      {entry.status}
                    </span>
                    <span className="text-[9px] text-[#6B6B5B] flex items-center gap-1">
                      <User className="w-3 h-3 text-[#8A8A7A]" />
                      <span>by <strong className="font-semibold text-[#5A5A40]">{entry.changedBy}</strong></span>
                    </span>
                  </div>

                  {/* Transition Speed Metric */}
                  {entry.durationFromPrevious && (
                    <span className="text-[8.5px] font-mono font-bold bg-[#FCFAF2] border border-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>Transition took {entry.durationFromPrevious}</span>
                    </span>
                  )}
                </div>

                {/* Complaint comments/remarks */}
                <div className="text-[10px] text-[#6B6B5B] leading-relaxed italic bg-[#FBFBFA] border border-[#D9D2C5]/30 p-2.5 rounded-lg select-text font-serif">
                  "{entry.comment}"
                </div>

                {/* State Timestamp metadata footer */}
                <div className="text-[8px] text-[#8A8A7A] font-mono flex items-center justify-between pt-0.5">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3 text-[#8A8A7A]" />
                    <span>Logged: <strong className="text-[#5A5A40]">{new Date(entry.changedAt).toLocaleString()}</strong></span>
                  </span>
                  
                  {isCurrent && (
                    <span className="text-[8px] font-bold text-amber-700 animate-pulse font-sans">
                      Active Processing Phase
                    </span>
                  )}
                </div>

              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
