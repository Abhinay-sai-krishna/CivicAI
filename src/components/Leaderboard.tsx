import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { UserProfile } from "../types";
import { Trophy, Medal, Award, Sparkles, Star, Users, Flame } from "lucide-react";
import { INITIAL_LEADERBOARD } from "../data/mockPoints";

interface LeaderboardProps {
  currentUser: UserProfile;
}

export default function Leaderboard({ currentUser }: LeaderboardProps) {
  const [board, setBoard] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("points", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as UserProfile);
      });

      // If Firestore is empty (e.g. fresh environment), merge our active mock users
      if (list.length === 0) {
        setBoard(INITIAL_LEADERBOARD);
      } else {
        // Enforce active user presence in list
        const exists = list.some(u => u.email === currentUser.email);
        if (!exists) {
          list.push(currentUser);
        }
        setBoard(list.sort((a,b) => b.points - a.points));
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "users");
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Determine user rank index
  const curRank = board.findIndex(u => u.email === currentUser.email) + 1;

  // Compute next badge tier details
  const getNextTierDetails = (points: number) => {
    const tiers = [
      { name: "Citizen Rookie", min: 0, max: 100 },
      { name: "Active Citizen", min: 100, max: 300 },
      { name: "Local Inspector", min: 300, max: 600 },
      { name: "Civic Champion", min: 600, max: 1000 },
      { name: "Neighborhood Hero", min: 1000, max: 2000 },
      { name: "Grand Civic Master", min: 2000, max: 5000 }
    ];

    let currentTierIdx = tiers.findIndex(t => points >= t.min && points < t.max);
    if (currentTierIdx === -1) {
      if (points >= 5000) {
        return {
          currentTierName: "Grand Civic Master",
          nextTierName: "Legendary Archon",
          minPoints: 5000,
          maxPoints: 10000,
          pointsNeeded: Math.max(0, 10000 - points),
          percentage: 100
        };
      }
      currentTierIdx = 0;
    }

    const currentTier = tiers[currentTierIdx];
    const nextTier = tiers[currentTierIdx + 1] || { name: "Legendary Archon", min: currentTier.max, max: currentTier.max * 2 };

    const minPoints = currentTier.min;
    const maxPoints = currentTier.max;
    const pointsNeeded = Math.max(0, maxPoints - points);
    const percentage = Math.min(100, Math.max(0, ((points - minPoints) / (maxPoints - minPoints)) * 100));

    return {
      currentTierName: currentTier.name,
      nextTierName: nextTier.name,
      minPoints,
      maxPoints,
      pointsNeeded,
      percentage
    };
  };

  const tierDetails = getNextTierDetails(currentUser.points);

  return (
    <div id="leaderboard-section-container" className="bg-white rounded-2xl border border-[#D9D2C5] p-5 shadow-sm animate-fade-in text-[#3D3D33]">
      
      {/* PROFILE SCORECARD HERO */}
      <div className="bg-[#F8F9F4] rounded-xl p-4 border border-[#D9D2C5] mb-5 text-[#3D3D33]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[#5A5A40] text-white flex items-center justify-center font-black text-sm border-2 border-white shadow-md uppercase">
            {currentUser.displayName.charAt(0)}
          </div>
          <div>
            <h3 className="font-serif font-bold text-sm text-[#2D2D24] leading-tight">{currentUser.displayName}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-semibold text-[#5A5A40]">
              <Star className="w-3.5 h-3.5 fill-current text-[#C8A97E]" />
              <span>Rank #{curRank || "--"} in Ward 6</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-4 text-center">
          <div className="bg-white p-2 rounded-lg border border-[#D9D2C5]/70 shadow-xs">
            <span className="text-[9px] text-[#8A8A7A] font-bold uppercase tracking-wide">Points</span>
            <span className="block font-mono font-black text-sm text-[#5A5A40]">{currentUser.points} XP</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-[#D9D2C5]/70 shadow-xs">
            <span className="text-[9px] text-[#8A8A7A] font-bold uppercase tracking-wide">Reported</span>
            <span className="block font-sans font-extrabold text-sm text-[#3D3D33]">{currentUser.reportsCount} Cases</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-[#D9D2C5]/70 shadow-xs">
            <span className="text-[9px] text-[#8A8A7A] font-bold uppercase tracking-wide">Verified</span>
            <span className="block font-sans font-extrabold text-sm text-[#3D3D33]">{currentUser.votesCount} Votes</span>
          </div>
        </div>

        {/* PROGRESS TO NEXT BADGE TIER */}
        <div className="mt-4 bg-white p-3 rounded-lg border border-[#D9D2C5]/70 shadow-3xs space-y-2">
          <div className="flex justify-between items-center text-[9.5px]">
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#C8A97E]" />
              <span className="font-bold text-[#2D2D24]">Next Badge Milestone</span>
            </div>
            <span className="font-mono text-[9px] text-[#6B6B5B]">
              {currentUser.points} / {tierDetails.maxPoints} XP
            </span>
          </div>

          {/* Progress Bar Container */}
          <div className="relative w-full h-2.5 bg-[#F2F0E9] rounded-full overflow-hidden border border-[#D9D2C5]/30 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-[#C8A97E] to-[#5A5A40] rounded-full transition-all duration-700 ease-out"
              style={{ width: `${tierDetails.percentage}%` }}
            />
          </div>

          {/* Remaining Points Indicator */}
          <div className="flex justify-between items-center text-[9.5px] leading-tight pt-0.5">
            <span className="text-[#8A8A7A] font-medium">
              Current: <strong className="text-[#5A5A40] font-bold">{tierDetails.currentTierName}</strong>
            </span>
            {tierDetails.pointsNeeded > 0 ? (
              <span className="text-[#5A5A40] font-black text-right">
                Need <span className="text-[#C8A97E]">{tierDetails.pointsNeeded} XP</span> for <strong className="text-[#2D2D24] uppercase font-mono tracking-tight text-[8px] bg-[#F2F0E9] border border-[#D9D2C5]/60 px-1 rounded">{tierDetails.nextTierName}</strong>
              </span>
            ) : (
              <span className="text-emerald-700 font-extrabold flex items-center gap-0.5 animate-pulse">
                🏆 Max Tier Reached!
              </span>
            )}
          </div>
        </div>

        {/* RECOGNITION BADGES DECK */}
        <div className="mt-3">
          <span className="text-[9px] text-[#5A5A40] font-bold uppercase tracking-wider block mb-1">Earned Civic Badges ({currentUser.badges?.length || 0})</span>
          <div className="flex flex-wrap gap-1">
            {currentUser.badges?.map((badge) => (
              <span
                key={badge}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#F2F0E9] text-[#5A5A40] border border-[#D9D2C5]/60 flex items-center gap-1 shrink-0"
              >
                <Award className="w-2.5 h-2.5 text-[#C8A97E]" />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* LEADERBOARD STANDINGS */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between border-b border-[#D9D2C5] pb-2">
          <h4 className="font-serif font-bold text-xs text-[#2D2D24] uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-[#C8A97E] fill-[#F2F0E9]" />
            <span>Community Hero Standings</span>
          </h4>
          <span className="text-[9px] font-mono font-bold text-[#8A8A7A]">Monthly</span>
        </div>

        {loading ? (
          <div className="text-center py-4 text-xs font-semibold text-[#8A8A7A]">Loading standings...</div>
        ) : (
          <div className="space-y-1.5">
            {board.slice(0, 5).map((user, index) => {
              const isCurrentUser = user.email === currentUser.email;
              const place = index + 1;

              return (
                <div
                  key={user.email}
                  className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
                    isCurrentUser 
                      ? "bg-[#FBFBFA] border-[#D9D2C5] ring-1 ring-[#D9D2C5]/30" 
                      : "border-transparent hover:bg-[#F2F0E9]/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-5 shrink-0 flex justify-center text-xs">
                      {place === 1 ? (
                        <Star className="w-4 h-4 text-[#C8A97E] fill-[#C8A97E]" />
                      ) : place === 2 ? (
                        <Medal className="w-4 h-4 text-slate-400 fill-slate-300" />
                      ) : place === 3 ? (
                        <Medal className="w-4 h-4 text-amber-700 fill-amber-600" />
                      ) : (
                        <span className="font-mono text-[#8A8A7A] font-bold">{place}</span>
                      )}
                    </div>
                    
                    <div className="w-7 h-7 rounded-full bg-[#F2F0E9] text-[#5A5A40] border border-[#D9D2C5]/40 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                      {user.displayName.charAt(0)}
                    </div>

                    <div className="min-w-0">
                      <h5 className={`text-xs font-bold truncate leading-tight ${isCurrentUser ? "text-[#2D2D24]" : "text-[#3D3D33]"}`}>
                        {user.displayName}
                      </h5>
                      <span className="text-[10px] text-[#8A8A7A] flex items-center gap-0.5">
                        <Flame className="w-3 h-3 text-[#C8A97E]" />
                        {user.reportsCount} cases reported
                      </span>
                    </div>
                  </div>

                  <span className="font-mono text-xs font-black text-[#5A5A40] shrink-0">
                    {user.points} XP
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
