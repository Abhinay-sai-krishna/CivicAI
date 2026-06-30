import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Bell, CheckCircle2, AlertCircle } from "lucide-react";

export interface ToastMessage {
  id: string;
  title: string;
  description: string;
  type: "info" | "success" | "warning";
}

interface ToastNotificationProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 6000); // 6 seconds auto dismiss
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const config = {
    success: {
      bg: "bg-white border-emerald-500",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
      titleColor: "text-[#2D2D24]",
    },
    warning: {
      bg: "bg-white border-amber-500",
      icon: <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
      titleColor: "text-[#2D2D24]",
    },
    info: {
      bg: "bg-white border-[#5A5A40]",
      icon: <Bell className="w-4 h-4 text-[#5A5A40] shrink-0 mt-0.5" />,
      titleColor: "text-[#2D2D24]",
    },
  };

  const current = config[toast.type] || config.info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
      whileHover={{ scale: 1.02 }}
      className={`max-w-sm w-full shadow-lg rounded-xl border-l-4 p-4 ${current.bg} border-y border-r border-[#D9D2C5] flex gap-3 relative overflow-hidden`}
    >
      {current.icon}
      <div className="flex-1 min-w-0 pr-4">
        <h5 className={`font-serif font-bold text-xs ${current.titleColor} leading-tight`}>
          {toast.title}
        </h5>
        <p className="text-[10px] text-[#6B6B5B] mt-1 leading-relaxed">
          {toast.description}
        </p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[#8A8A7A] hover:text-[#2D2D24] p-0.5 rounded-full hover:bg-[#F2F0E9] transition-all shrink-0 cursor-pointer self-start"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      id="global-toast-container"
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-[340px] px-4 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastNotification toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
