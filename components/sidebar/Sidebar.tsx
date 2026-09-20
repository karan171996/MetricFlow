"use client";

import {
  LayoutDashboard,
  Layers,
  Bell,
  Box,
  BarChart2,
  Link,
  Mail,
  Users,
  Settings,
  LogOut,
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
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Layers, label: "Layers" },
  { icon: Bell, label: "Notifications" },
  { icon: Box, label: "Projects" },
  { icon: BarChart2, label: "Analytics" },
  { icon: Link, label: "Connections" },
  { icon: Mail, label: "Messages" },
  { icon: Users, label: "Team" },
];

export function AppSidebar() {

  const { isMobile } = useSidebar()

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} className="w-[70px] border-r bg-[#131518] text-white">
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
              tooltip="Settings" 
              className={isMobile 
                ? "w-full justify-start gap-4 p-3 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white text-base"
                : "h-10 w-10 justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"}
            >
              <Settings className="!h-5 !w-5" />
              {isMobile && <span>Settings</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Log out" 
              className={isMobile 
                ? "w-full justify-start gap-4 p-3 rounded-lg text-red-400 hover:bg-red-400/10 hover:text-red-400 text-base"
                : "h-10 w-10 justify-center rounded-lg text-red-400 hover:bg-red-400/10 hover:text-red-400"}
            >
              <LogOut className="!h-5 !w-5" />
              {isMobile && <span>Log out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Profile" 
              className={isMobile 
                ? "w-full justify-start gap-4 p-3 rounded-lg hover:bg-white/10 text-base mt-2"
                : "h-10 w-10 justify-center p-0 overflow-hidden rounded-full border border-gray-700 mt-2"}
            >
              {isMobile ? (
                <>
                  <div className="h-8 w-8 overflow-hidden rounded-full border border-gray-700">
                    <img src="https://i.pravatar.cc/150?img=11" alt="Avatar" className="h-full w-full object-cover" />
                  </div>
                  <span className="text-white">Profile</span>
                </>
              ) : (
                <img src="https://i.pravatar.cc/150?img=11" alt="Avatar" className="h-full w-full object-cover" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
