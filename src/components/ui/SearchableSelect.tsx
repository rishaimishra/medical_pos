"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  subLabel?: string;
  badge?: string;
  badgeColor?: string; // e.g. "bg-emerald-100 text-emerald-800"
  disabled?: boolean;
  data?: any;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | number | null | undefined;
  onChange: (value: any, option?: SearchableSelectOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  error?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search options...",
  label,
  disabled = false,
  allowClear = false,
  className = "",
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [flipAbove, setFlipAbove] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  // Check window size for mobile bottom-sheet vs desktop floating panel
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    };
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(term)) ||
        (opt.badge && opt.badge.toLowerCase().includes(term))
    );
  }, [options, searchTerm]);

  // Selected option
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value) || null;
  }, [options, value]);

  // Determine flip above/below on desktop when opened
  const calculateFlip = () => {
    if (triggerRef.current && typeof window !== "undefined") {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const dropdownHeight = 280; // Estimated max height of dropdown panel

      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setFlipAbove(true);
      } else {
        setFlipAbove(false);
      }
    }
  };

  const handleOpen = () => {
    if (disabled) return;
    calculateFlip();
    setIsOpen(true);
    setSearchTerm("");
    setHighlightedIndex(0);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm("");
    triggerRef.current?.focus();
  };

  const handleSelect = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value, option);
    handleClose();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, undefined);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredOptions[highlightedIndex];
      if (current && !current.disabled) {
        handleSelect(current);
      }
    }
  };

  // Keep highlighted item in view
  useEffect(() => {
    if (isOpen && optionsListRef.current) {
      const items = optionsListRef.current.querySelectorAll('[data-option="true"]');
      const item = items[highlightedIndex] as HTMLElement | undefined;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Outside click close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1">
          {label}
        </label>
      )}

      {/* Main Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left text-xs transition-all ${
          disabled
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            : error
            ? "bg-rose-50 border-rose-300 text-slate-800 focus:ring-2 focus:ring-rose-200"
            : isOpen
            ? "bg-white border-[#1F4E5B] ring-2 ring-[#1F4E5B]/20 text-slate-900 shadow-sm"
            : "bg-white border-slate-300 hover:border-slate-400 text-slate-800 shadow-2xs"
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedOption ? (
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <span className="font-semibold truncate text-slate-900">
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                    selectedOption.badgeColor || "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {allowClear && selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? "rotate-180 text-[#1F4E5B]" : ""
            }`}
          />
        </div>
      </button>

      {error && <p className="text-[11px] text-rose-600 mt-1 font-medium">{error}</p>}

      {/* DROPDOWN VIEW (Desktop: Floating auto flip | Mobile: Bottom-sheet with backdrop) */}
      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          {isMobile && (
            <div
              className="fixed inset-0 z-[9980] bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
              onClick={handleClose}
            />
          )}

          <div
            className={
              isMobile
                ? "fixed inset-x-0 bottom-0 z-[9985] bg-white rounded-t-3xl shadow-2xl p-4 max-h-[85vh] flex flex-col animate-slideUp"
                : `absolute ${
                    flipAbove ? "bottom-full mb-1.5" : "top-full mt-1.5"
                  } left-0 right-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[300px] animate-scaleUp`
            }
          >
            {/* Mobile Handle bar & header */}
            {isMobile && (
              <div className="flex flex-col items-center pb-3">
                <div className="w-12 h-1.5 rounded-full bg-slate-300 mb-2" />
                <div className="w-full flex items-center justify-between px-1">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {label || placeholder}
                  </h3>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Search Input Box */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full bg-white border border-slate-200 focus:border-[#1F4E5B] rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Options List */}
            <div
              ref={optionsListRef}
              className="overflow-y-auto flex-1 p-1.5 space-y-0.5 divide-y divide-slate-50 [scrollbar-width:thin]"
              role="listbox"
            >
              {filteredOptions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No matching options found.
                </div>
              ) : (
                filteredOptions.map((opt, index) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <div
                      key={String(opt.value)}
                      data-option="true"
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer select-none ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed bg-transparent"
                          : isSelected
                          ? "bg-[#EAF2F4] text-[#1F4E5B] font-bold"
                          : isHighlighted
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{opt.label}</span>
                          {opt.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                                opt.badgeColor || "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        {opt.subLabel && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">
                            {opt.subLabel}
                          </p>
                        )}
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-[#1F4E5B] shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

