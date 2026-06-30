import React, { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { Issue } from "../types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Activity, TrendingUp, Calendar, AlertCircle, Loader2 } from "lucide-react";

interface ChartDataPoint {
  dateLabel: string;
  ymd: string;
  count: number;
  potholes: number;
  garbage: number;
  streetlight: number;
  leakage: number;
  other: number;
  resolvedCount: number;
  totalResolutionTimeHrs: number;
  avgResolutionTimeHrs: number;
}

export default function ReportFrequencyChart() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  // 1. Subscribe to Live Firestore Issues Data
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

  // 2. Compute the last 7 days aggregates dynamically when issues list or system date changes
  useEffect(() => {
    if (loading) return;

    // Helper: Form YYYY-MM-DD
    const toYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const r = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${r}`;
    };

    // Helper: Form beautiful localized label (e.g., "Jun 24")
    const toLabel = (d: Date) => {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    // Generate list of the past 7 days (including today)
    const baseDays: ChartDataPoint[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() - i);
      baseDays.push({
        dateLabel: toLabel(targetDate),
        ymd: toYMD(targetDate),
        count: 0,
        potholes: 0,
        garbage: 0,
        streetlight: 0,
        leakage: 0,
        other: 0,
        resolvedCount: 0,
        totalResolutionTimeHrs: 0,
        avgResolutionTimeHrs: 0,
      });
    }

    // Populate data based on real Firestore issues
    issues.forEach((issue) => {
      if (issue.reportedAt) {
        try {
          const issueDate = new Date(issue.reportedAt);
          const issueYMD = toYMD(issueDate);
          
          const matchedPoint = baseDays.find((day) => day.ymd === issueYMD);
          if (matchedPoint) {
            matchedPoint.count += 1;
            
            // Categorized count breakdowns for tooltip richness
            if (issue.category === "pothole") matchedPoint.potholes += 1;
            else if (issue.category === "garbage") matchedPoint.garbage += 1;
            else if (issue.category === "streetlight") matchedPoint.streetlight += 1;
            else if (issue.category === "leakage") matchedPoint.leakage += 1;
            else matchedPoint.other += 1;
          }
        } catch (err) {
          console.error("Failed to parse issue reportedAt timestamp", err);
        }
      }

      // Compute resolution metrics for issues resolved on each day
      if (issue.status === "Resolved") {
        try {
          const resolvedEntry = issue.statusHistory?.find((h) => h.status === "Resolved");
          let resolvedDate: Date;
          let diffHrs = 24; // fallback standard 24 hours for resolved issues without custom logs

          if (resolvedEntry) {
            resolvedDate = new Date(resolvedEntry.changedAt);
            if (issue.reportedAt) {
              const diffMs = resolvedDate.getTime() - new Date(issue.reportedAt).getTime();
              diffHrs = Math.max(0, diffMs / (1000 * 60 * 60));
            }
          } else if (issue.reportedAt) {
            resolvedDate = new Date(issue.reportedAt);
          } else {
            return;
          }

          const resolvedYMD = toYMD(resolvedDate);
          const matchedPoint = baseDays.find((day) => day.ymd === resolvedYMD);
          if (matchedPoint) {
            matchedPoint.resolvedCount += 1;
            matchedPoint.totalResolutionTimeHrs += diffHrs;
          }
        } catch (err) {
          console.error("Failed to compute resolution speed", err);
        }
      }
    });

    // Calculate daily averages
    baseDays.forEach((day) => {
      if (day.resolvedCount > 0) {
        day.avgResolutionTimeHrs = parseFloat((day.totalResolutionTimeHrs / day.resolvedCount).toFixed(1));
      } else {
        day.avgResolutionTimeHrs = 0;
      }
    });

    setChartData(baseDays);
  }, [issues, loading]);

  // Compute key highlights for statistical visual widgets
  const total7Days = chartData.reduce((acc, curr) => acc + curr.count, 0);
  const peakDayObj = [...chartData].sort((a, b) => b.count - a.count)[0];
  const peakCount = peakDayObj ? peakDayObj.count : 0;
  const peakLabel = peakDayObj && peakDayObj.count > 0 ? peakDayObj.dateLabel : "N/A";
  const dailyAverage = (total7Days / 7).toFixed(1);

  // Compute overall average resolution speed across all resolved cases
  const resolvedIssues = issues.filter((issue) => issue.status === "Resolved");
  let overallAvgResolutionTimeHrs = 0;
  if (resolvedIssues.length > 0) {
    const totalHrs = resolvedIssues.reduce((acc, issue) => {
      const resolvedEntry = issue.statusHistory?.find((h) => h.status === "Resolved");
      let diffHrs = 24;
      if (resolvedEntry && issue.reportedAt) {
        const diffMs = new Date(resolvedEntry.changedAt).getTime() - new Date(issue.reportedAt).getTime();
        diffHrs = Math.max(0, diffMs / (1000 * 60 * 60));
      }
      return acc + diffHrs;
    }, 0);
    overallAvgResolutionTimeHrs = parseFloat((totalHrs / resolvedIssues.length).toFixed(1));
  }

  return (
    <div 
      id="report-frequency-chart-container" 
      className="bg-white rounded-2xl border border-[#D9D2C5] p-5 shadow-sm relative overflow-hidden flex flex-col"
    >
      {/* CARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#D9D2C5] pb-2.5 mb-4 gap-2">
        <div>
          <h4 className="font-serif font-bold text-xs text-[#2D2D24] uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#5A5A40]" />
            <span>Community Report Velocity</span>
          </h4>
          <p className="text-[10px] text-[#8A8A7A] mt-0.5 font-mono">
            Daily frequency of registered public safety reports
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-[9px] font-mono font-semibold">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#5A5A40]" />
              <span className="text-[#5A5A40]">Reports</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
              <span className="text-emerald-700">Resolution (Hrs)</span>
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold bg-[#F2F0E9] border border-[#D9D2C5] text-[#5A5A40] px-2 py-0.5 rounded-full flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#5A5A40]" />
            <span>Last 7 Days</span>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-[180px] flex flex-col items-center justify-center text-[#8A8A7A]">
          <Loader2 className="w-6 h-6 text-[#5A5A40] animate-spin mb-2" />
          <p className="text-[10px] font-mono font-bold uppercase tracking-wider">
            Compiling report frequency index...
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* STATS WIDGETS SECTION */}
          <div className="grid grid-cols-4 gap-2 bg-[#FBFBFA] p-2.5 rounded-xl border border-[#D9D2C5]/80">
            <div className="text-left">
              <span className="block text-[8px] font-mono font-bold text-[#8A8A7A] uppercase tracking-wider">
                Total Issues (7d)
              </span>
              <span className="block text-sm font-black text-[#5A5A40] font-mono leading-none mt-1">
                {total7Days}
              </span>
            </div>
            
            <div className="text-left border-l border-[#D9D2C5] pl-2">
              <span className="block text-[8px] font-mono font-bold text-[#8A8A7A] uppercase tracking-wider">
                Daily Average
              </span>
              <span className="block text-sm font-black text-[#5A5A40] font-mono leading-none mt-1">
                {dailyAverage}
              </span>
            </div>

            <div className="text-left border-l border-[#D9D2C5] pl-2">
              <span className="block text-[8px] font-mono font-bold text-emerald-800 uppercase tracking-wider">
                Avg Resolution
              </span>
              <span className="block text-sm font-black text-emerald-700 font-mono leading-none mt-1">
                {overallAvgResolutionTimeHrs > 0 ? `${overallAvgResolutionTimeHrs}h` : "N/A"}
              </span>
            </div>
            
            <div className="text-left border-l border-[#D9D2C5] pl-2">
              <span className="block text-[8px] font-mono font-bold text-[#8A8A7A] uppercase tracking-wider">
                Peak Velocity
              </span>
              <span className="block text-[9px] font-black text-rose-800 leading-none mt-1.5 truncate">
                {peakCount > 0 ? `${peakCount} (${peakLabel})` : "0 reports"}
              </span>
            </div>
          </div>

          {/* RECHARTS CHART PORT */}
          <div className="h-[180px] md:h-[240px] lg:h-[300px] xl:h-[360px] w-full mt-2 relative select-none antialiased">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: -20, left: -25, bottom: 0 }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="#EBEAE4" 
                  vertical={false} 
                />
                
                <XAxis 
                  dataKey="dateLabel" 
                  stroke="#8A8A7A" 
                  fontSize={9} 
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: "#D9D2C5", strokeWidth: 1 }}
                  dy={6}
                />
                
                <YAxis 
                  yAxisId="left"
                  stroke="#8A8A7A" 
                  fontSize={9} 
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: "#D9D2C5", strokeWidth: 1 }}
                  allowDecimals={false}
                  dx={-4}
                />

                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="#10B981" 
                  fontSize={9} 
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: "#D9D2C5", strokeWidth: 1 }}
                  allowDecimals={true}
                  dx={4}
                />
                
                <Tooltip 
                  cursor={{ stroke: "#D9D2C5", strokeWidth: 1, strokeDasharray: "2 2" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ChartDataPoint;
                      return (
                        <div className="bg-[#2D2D24] text-[#F2F0E9] px-3 py-2.5 rounded-xl border border-[#3D3D33] shadow-lg text-[10px] space-y-1.5 font-sans leading-normal">
                          <p className="font-serif font-black border-b border-white/10 pb-1 text-white text-[11px]">
                            {data.dateLabel} Summary
                          </p>
                          <div className="space-y-1">
                            <p className="flex justify-between items-center gap-4">
                              <span className="text-white/60">Total reports:</span>
                              <strong className="text-white font-mono text-xs">{data.count}</strong>
                            </p>
                            <p className="flex justify-between items-center gap-4 border-t border-white/5 pt-1">
                              <span className="text-emerald-400">Resolved reports:</span>
                              <strong className="text-emerald-300 font-mono text-xs">{data.resolvedCount}</strong>
                            </p>
                            <p className="flex justify-between items-center gap-4">
                              <span className="text-emerald-400">Avg resolution time:</span>
                              <strong className="text-emerald-300 font-mono text-xs">
                                {data.avgResolutionTimeHrs > 0 ? `${data.avgResolutionTimeHrs}h` : "N/A"}
                              </strong>
                            </p>
                            {data.count > 0 && (
                              <div className="pt-1 border-t border-white/5 space-y-0.5 text-[9px] text-white/80">
                                {data.potholes > 0 && <p>🚗 Potholes: {data.potholes}</p>}
                                {data.garbage > 0 && <p>🗑️ Garbage: {data.garbage}</p>}
                                {data.streetlight > 0 && <p>💡 Streetlights: {data.streetlight}</p>}
                                {data.leakage > 0 && <p>💧 Leakages: {data.leakage}</p>}
                                {data.other > 0 && <p>📍 Others: {data.other}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="count"
                  stroke="#5A5A40"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 1.5, fill: "#FFF", stroke: "#5A5A40" }}
                  activeDot={{ r: 6, strokeWidth: 1.5, fill: "#C8A97E", stroke: "#5A5A40" }}
                  animationDuration={1000}
                />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgResolutionTimeHrs"
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3.5, strokeWidth: 1.5, fill: "#FFF", stroke: "#10B981" }}
                  activeDot={{ r: 5, strokeWidth: 1.5, fill: "#34D399", stroke: "#10B981" }}
                  animationDuration={1000}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          {/* FOOTER COMMENTARY */}
          <div className="flex items-center gap-1.5 text-[9.5px] leading-normal text-[#6B6B5B] bg-[#FCFAF2] p-2 rounded-lg border border-dashed border-[#D9D2C5]">
            <TrendingUp className="w-3.5 h-3.5 text-[#C8A97E] shrink-0" />
            <span>
              Real-time synchronization active. Lodging new reports immediately adjusts reporting velocity.
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
