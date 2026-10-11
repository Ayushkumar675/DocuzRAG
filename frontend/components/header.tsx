"use client";

import React from "react";

interface HeaderProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  title?: string;
  isBusy?: boolean;
  onOpenMobileMenu?: () => void;
}

export default function Header({
  theme,
  onToggleTheme,
  title = "DocuNova Workspace",
  isBusy = false,
  onOpenMobileMenu,
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 md:left-64 right-0 h-16 bg-surface-container-lowest/80 dark:bg-surface-navy-depth/85 backdrop-blur-xl border-b border-border-glass shadow-sm dark:shadow-lg z-40 flex items-center justify-between px-space-md sm:px-space-lg transition-colors duration-200">
      <div className="flex items-center gap-space-sm sm:gap-space-md">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>

        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-on-primary shadow-sm shadow-primary/30 shrink-0">
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        </div>
        <span className="font-headline-sm text-headline-sm text-on-surface dark:text-text-crisp-white tracking-tight font-semibold truncate">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-space-md">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors border border-transparent hover:border-border-glass"
        >
          <span className="material-symbols-outlined text-[20px]">
            {theme === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </button>
      </div>
    </header>
  );
}
