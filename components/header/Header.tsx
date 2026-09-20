"use client";

import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Hexagon } from "lucide-react";

export function Header() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-gray-800 bg-[#0f1419] px-4 md:px-6">
      {/* Title & Subtitle */}
      <div className="hidden md:block flex flex-col gap-0.5">
        <h1 className="text-base md:text-lg font-semibold text-white tracking-tight line-clamp-1">
          Content performance
        </h1>
        <p className="hidden sm:block text-xs text-gray-400">
          2,840 keywords tracked &middot; 184 articles &middot; avg position 8.4
        </p>
      </div>

      <button 
        onClick={toggleSidebar}
        className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg bg-[#3ee0a1] text-black hover:bg-[#3ee0a1]/90 transition-colors"
      >
        <Hexagon className="h-6 w-6 fill-current" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search Bar & Notification Bell */}
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-40 md:w-64 bg-[#1a202c] border-none text-sm text-gray-200 placeholder:text-gray-500 pl-10 focus-visible:ring-1 focus-visible:ring-gray-600 rounded-full h-9"
          />
        </div>

        {/* Mobile Search Icon Only */}
        <button className="sm:hidden relative flex h-9 w-9 items-center justify-center rounded-full bg-[#1a202c] text-gray-400 hover:text-white transition-colors">
          <Search className="h-4 w-4" />
        </button>

        <button className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#1a202c] text-gray-400 hover:text-white transition-colors">
          <Bell className="h-5 w-5" />
          {/* Notification Dot */}
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0f1419]" />
        </button>
      </div>
    </header>
  );
}
