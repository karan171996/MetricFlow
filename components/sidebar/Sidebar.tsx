"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Settings,
  Hexagon,
} from "lucide-react";

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


const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  // { icon: Layers, label: "Layers", href: "#" },
  // { icon: Bell, label: "Notifications", href: "#" },
  // { icon: Box, label: "Projects", href: "#" },
  { icon: BarChart2, label: "Performance", href: "/performance" },
  // { icon: Link, label: "Connections", href: "#" },
  // { icon: Mail, label: "Messages", href: "#" },
  // { icon: Users, label: "Team", href: "#" },
];

export function AppSidebar() {

  const { isMobile } = useSidebar()
  const pathname = usePathname()

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} className="w-[70px] border-r border-[#2d3748] bg-[#131518] text-white sticky top-0 h-screen overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <SidebarHeader className="flex items-center justify-center py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3ee0a1] text-black">
          <Hexagon className="h-6 w-6 fill-current" />
        </div>
      </SidebarHeader>

      <SidebarContent className={isMobile ? "p-4" : "flex flex-col items-center justify-start gap-4 pt-6"}>
        <SidebarMenu className={isMobile ? "gap-2" : "flex flex-col items-center gap-4"}>
          {navItems.map((item, index) => (
            <SidebarMenuItem key={index}>
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
