"use client";

import React from "react";
import { cn } from "cn"; // standard class merging in this project

interface ProgressScoreProps {
  value: number;
  max?: number;
  variant?: "circular" | "linear";
  label?: string;
  className?: string;
}

export function ProgressScore({
  value,
  max = 100,
  variant = "circular",
  label,
  className,
}: ProgressScoreProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  // Determine color based on percentage
  let strokeClass = "stroke-red-500";
  let bgClass = "bg-red-500";
  
  if (percentage >= 70) {
    strokeClass = "stroke-[#10b981]"; // Green for good
    bgClass = "bg-[#10b981]";
  } else if (percentage >= 40) {
    strokeClass = "stroke-[#f59e0b]"; // Yellow for warning
    bgClass = "bg-[#f59e0b]";
  }

  if (variant === "linear") {
    return (
      <div className={cn("flex w-full items-center gap-3", className)}>
        {label && <span className="text-sm font-medium text-gray-300 min-w-[60px]">{label}</span>}
        <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-[#2d3748]">
          <div
            className={cn("h-full rounded-full transition-all duration-500", bgClass)}
            style={{ width: `${percentage}%` }}
          />
          {/* Threshold indicators overlay */}
          <div className="absolute top-0 left-[40%] h-full w-[2px] bg-[#1a202c]/50" />
          <div className="absolute top-0 left-[70%] h-full w-[2px] bg-[#1a202c]/50" />
        </div>
        <span className="text-sm font-bold text-white min-w-[40px] text-right">
          {Math.round(percentage)}%
        </span>
      </div>
    );
  }

  // Circular variant (Donut style)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)}>
      <div className="relative flex items-center justify-center">
        <svg className="h-28 w-28 -rotate-90 transform" viewBox="0 0 100 100">
          {/* Background ring */}
          <circle
            className="stroke-[#2d3748]"
            strokeWidth="8"
            fill="transparent"
            r={radius}
            cx="50"
            cy="50"
          />
          {/* Progress ring */}
          <circle
            className={cn("transition-all duration-1000 ease-in-out", strokeClass)}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            fill="transparent"
            r={radius}
            cx="50"
            cy="50"
          />
        </svg>
        {/* Center content */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-bold text-white leading-none tracking-tighter">{value}</span>
        </div>
      </div>
      {label && <span className="mt-2 text-sm font-medium text-gray-400">{label}</span>}
    </div>
  );
}
