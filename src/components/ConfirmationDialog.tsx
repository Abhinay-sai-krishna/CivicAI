import React from "react";
import { AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmationDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-[#2D2D24]/40 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
            className="relative bg-white border border-[#D9D2C5] rounded-2xl shadow-2xl p-6 max-w-sm w-full z-10 text-[#3D3D33] overflow-hidden"
          >
            {/* Top decorative badge */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${isDestructive ? "bg-rose-500" : "bg-amber-500"}`} />

            <div className="flex gap-4 items-start mt-2">
              <div className={`p-3 rounded-xl shrink-0 ${isDestructive ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-amber-50 text-amber-600 border border-amber-100"}`}>
                {isDestructive ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-serif font-extrabold text-sm text-[#2D2D24] tracking-tight">
                  {title}
                </h3>
                <p className="text-xs text-[#6B6B5B] leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 mt-6 border-t border-[#D9D2C5]/50 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-white hover:bg-[#F2F0E9] border border-[#D9D2C5] text-xs font-bold text-[#5A5A40] rounded-xl transition-all cursor-pointer shadow-3xs"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onCancel(); // Auto dismiss on click
                }}
                className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                  isDestructive
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
                }`}
              >
                {isDestructive ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>{confirmLabel}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
