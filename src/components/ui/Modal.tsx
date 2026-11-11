"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "full";
  showCloseButton?: boolean;
  closeOnOutsideClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  headerIcon?: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  closeOnOutsideClick = true,
  closeOnEsc = true,
  className = "",
  headerIcon,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  const sizeClasses: Record<string, string> = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-3xl",
    "2xl": "max-w-4xl",
    "4xl": "max-w-5xl",
    full: "max-w-7xl",
  };

  return (
    <div
      className="fixed inset-0 z-[9900] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={() => {
        if (closeOnOutsideClick) onClose();
      }}
    >
      <div
        className={`w-full ${sizeClasses[size] || sizeClasses.md} bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto transition-all animate-scaleUp ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              {headerIcon && <div className="shrink-0">{headerIcon}</div>}
              <div className="min-w-0">
                {title && (
                  <h3 className="text-base font-extrabold text-slate-900 truncate">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="p-6 overflow-y-auto max-h-[calc(88vh-80px)]">{children}</div>
      </div>
    </div>
  );
}

