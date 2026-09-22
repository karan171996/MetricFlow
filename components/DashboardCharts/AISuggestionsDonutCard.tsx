"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import type { AISuggestion, AISuggestionType } from "@/types";

const TYPE_STYLE: Record<AISuggestionType, { icon: ReactNode; badgeColor: string }> = {
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />,
    badgeColor: "border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10",
  },
  critical: {
    icon: <AlertTriangle className="h-4 w-4 text-[#ef4444]" />,
    badgeColor: "border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10",
  },
  positive: {
    icon: <TrendingUp className="h-4 w-4 text-[#3ee0a1]" />,
    badgeColor: "border-[#3ee0a1] text-[#3ee0a1] bg-[#3ee0a1]/10",
  },
  optimize: {
    icon: <Zap className="h-4 w-4 text-[#06b6d4]" />,
    badgeColor: "border-[#06b6d4] text-[#06b6d4] bg-[#06b6d4]/10",
  },
};

interface AISuggestionsDonutCardProps {
  suggestions: AISuggestion[];
}

export function AISuggestionsDonutCard({ suggestions }: AISuggestionsDonutCardProps) {
  return (
    <Card className="w-full rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="p-6 pb-3">
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#3ee0a1]" />
          AI Suggestions
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">Insights generated for all tracked pages</p>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <ul className="flex flex-col gap-3">
          {suggestions.length === 0 && (
            <p className="text-xs text-gray-500">No suggestions yet — check back after the next analysis run.</p>
          )}
          {suggestions.map((item, i) => {
            const style = TYPE_STYLE[item.type];
            return (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 hover:border-[#3d4f63] transition-colors"
              >
                <div className="mt-0.5 flex-shrink-0">{style.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-300">{item.page}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${style.badgeColor}`}>
                      {item.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{item.suggestion}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
