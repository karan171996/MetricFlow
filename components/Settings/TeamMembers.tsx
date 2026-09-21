"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus } from "lucide-react";

const teamMembers = [
  { name: "Alice Freeman", email: "alice@company.com", role: "Admin", status: "Active" },
  { name: "Bob Smith", email: "bob@company.com", role: "Developer", status: "Active" },
  { name: "Charlie Davis", email: "charlie@company.com", role: "Viewer", status: "Invited" },
];

export function TeamMembers() {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" />
            Team Members
          </CardTitle>
          <CardDescription className="text-sm text-gray-400 mt-1">
            Manage who has access to your performance dashboard.
          </CardDescription>
        </div>
        <Button className="bg-[#3ee0a1] text-black hover:bg-[#3ee0a1]/80 flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Invite
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-[#2d3748] overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0f1419]">
              <TableRow className="border-[#2d3748] hover:bg-transparent">
                <TableHead className="text-gray-400">Name</TableHead>
                <TableHead className="text-gray-400">Email</TableHead>
                <TableHead className="text-gray-400">Role</TableHead>
                <TableHead className="text-right text-gray-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamMembers.map((member) => (
                <TableRow key={member.email} className="border-[#2d3748] hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium text-white">{member.name}</TableCell>
                  <TableCell className="text-gray-400">{member.email}</TableCell>
                  <TableCell className="text-gray-400">{member.role}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={`
                        ${member.status === 'Active' ? 'border-[#3ee0a1] text-[#3ee0a1] bg-[#3ee0a1]/10' : ''}
                        ${member.status === 'Invited' ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10' : ''}
                      `}
                    >
                      {member.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
