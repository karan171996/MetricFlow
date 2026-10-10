"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Plus,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/Logo";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar";
import { TOOLS, TOOL_IDS } from "@/lib/tools";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnectedTools } from "@/lib/useConnectedTools";

/** Tools section: only connected tools, then "Add a tool" while any tool is missing. `null` = still loading (no items, so nothing pops in and out). */
function navSections(connected: ReturnType<typeof useConnectedTools>) {
  const toolItems = (connected ?? []).map((id) => ({ icon: TOOLS[id].icon, label: TOOLS[id].label, href: `/tools/${id}` }));
  const addTool = connected && connected.length < TOOL_IDS.length ? [{ icon: Plus, label: "Add a tool", href: "/setup" }] : [];
  return [
    {
      label: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", href: "/" },
        { icon: BarChart2, label: "Performance", href: "/performance" },
      ],
    },
    { label: "Tools", items: [...toolItems, ...addTool] },
  ];
}

export function AppSidebar() {

  const { isMobile } = useSidebar()
  const pathname = usePathname()
  const connected = useConnectedTools()

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} className="w-[70px] border-r border-[#2d3748] bg-[#131518] text-white sticky top-0 h-screen overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <SidebarHeader className="flex items-center justify-center py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3ee0a1] text-black">
          <Logo className="h-7 w-7" />
        </div>
      </SidebarHeader>

      <SidebarContent className={isMobile ? "p-4" : "flex flex-col items-center justify-start gap-4 pt-6"}>
        {navSections(connected).map((section, i) => (
          <div key={section.label} className={isMobile ? "w-full" : "flex w-full flex-col items-center gap-3"}>
            {i > 0 && <div className={isMobile ? "my-3 h-px bg-[#2d3748]" : "h-px w-8 bg-[#2d3748]"} />}
            <span className={isMobile
              ? "mb-2 block px-3 text-xs font-medium uppercase tracking-wider text-dash-muted"
              : "text-[11px] font-medium uppercase tracking-wider text-dash-muted"}>
              {section.label}
            </span>
            <SidebarMenu className={isMobile ? "gap-2" : "flex flex-col items-center gap-4"}>
              {section.label === "Tools" && !connected && <Skeleton className="h-10 w-10 bg-[#2d3748]" />}
              {section.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<NextLink href={item.href} />}
                    isActive={pathname === item.href}
                    aria-label={item.label}
                    aria-current={pathname === item.href ? "page" : undefined}
                    tooltip={item.label}
                    className={isMobile
                      ? "w-full justify-start gap-4 p-3 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white text-base"
                      : "h-10 w-10 justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"}
                  >
                    <item.icon className="!h-5 !w-5" />
                    {isMobile && <span>{item.label}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className={isMobile ? "p-4" : "flex flex-col items-center gap-4 pb-4"}>
        <SidebarMenu className={isMobile ? "gap-2" : "flex flex-col items-center gap-4"}>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<NextLink href="/settings" />}
              isActive={pathname === "/settings"}
              aria-label="Settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              tooltip="Settings"
              className={isMobile
                ? "w-full justify-start gap-4 p-3 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white text-base"
                : "h-10 w-10 justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"}
            >
              <Settings className="!h-5 !w-5" />
              {isMobile && <span>Settings</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
