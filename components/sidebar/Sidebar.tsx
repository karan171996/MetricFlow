"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
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

const navSections = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/" },
      { icon: BarChart2, label: "Performance", href: "/performance" },
    ],
  },
  {
    label: "Tools",
    items: TOOL_IDS.map((id) => ({ icon: TOOLS[id].icon, label: TOOLS[id].label, href: `/tools/${id}` })),
  },
];

export function AppSidebar() {

  const { isMobile } = useSidebar()
  const pathname = usePathname()

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} className="w-[70px] border-r border-[#2d3748] bg-[#131518] text-white sticky top-0 h-screen overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <SidebarHeader className="flex items-center justify-center py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3ee0a1] text-black">
          <Logo className="h-7 w-7" />
        </div>
      </SidebarHeader>

      <SidebarContent className={isMobile ? "p-4" : "flex flex-col items-center justify-start gap-4 pt-6"}>
        {navSections.map((section, i) => (
          <div key={section.label} className={isMobile ? "w-full" : "flex w-full flex-col items-center gap-3"}>
            {i > 0 && <div className={isMobile ? "my-3 h-px bg-[#2d3748]" : "h-px w-8 bg-[#2d3748]"} />}
            <span className={isMobile
              ? "mb-2 block px-3 text-xs font-medium uppercase tracking-wider text-gray-500"
              : "text-[9px] font-medium uppercase tracking-wider text-gray-500"}>
              {section.label}
            </span>
            <SidebarMenu className={isMobile ? "gap-2" : "flex flex-col items-center gap-4"}>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<NextLink href={item.href} />}
                    isActive={pathname === item.href}
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
