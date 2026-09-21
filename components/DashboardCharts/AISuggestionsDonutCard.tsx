"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, AlertTriangle, Zap } from "lucide-react";

const suggestions = [
  {
    page: "Homepage",
    icon: <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />,
    type: "warning",
    suggestion: "LCP is 2.4s — compress hero image to improve load time.",
    badge: "LCP",
    badgeColor: "border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10",
  },
  {
    page: "Blog",
    icon: <TrendingUp className="h-4 w-4 text-[#3ee0a1]" />,
    type: "positive",
    suggestion: "Traffic up 18% this week. Consider adding a CTA to drive conversions.",
    badge: "Traffic",
    badgeColor: "border-[#3ee0a1] text-[#3ee0a1] bg-[#3ee0a1]/10",
  },
  {
    page: "Checkout",
    icon: <AlertTriangle className="h-4 w-4 text-[#ef4444]" />,
    type: "critical",
    suggestion: "Error rate spiked to 4.2%. Investigate checkout API responses.",
    badge: "Critical",
    badgeColor: "border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10",
  },
  {
    page: "Pricing",
    icon: <Zap className="h-4 w-4 text-[#06b6d4]" />,
    type: "optimize",
    suggestion: "TTFB is excellent at 95ms. Enable prefetch links for next pages.",
    badge: "TTFB",
    badgeColor: "border-[#06b6d4] text-[#06b6d4] bg-[#06b6d4]/10",
  },
  {
    page: "Documentation",
    icon: <TrendingUp className="h-4 w-4 text-[#8b5cf6]" />,
    type: "positive",
    suggestion: "High scroll depth detected. Add anchor links to improve navigation.",
    badge: "UX",
    badgeColor: "border-[#8b5cf6] text-[#8b5cf6] bg-[#8b5cf6]/10",
  },
];

export function AISuggestionsDonutCard() {
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
          {suggestions.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 hover:border-[#3d4f63] transition-colors"
            >
              <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-300">{item.page}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${item.badgeColor}`}>
                    {item.badge}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{item.suggestion}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
