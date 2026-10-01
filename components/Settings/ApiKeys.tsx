import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Key } from "lucide-react";

export function ApiKeys() {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <Key className="h-5 w-5 text-gray-400" />
          API Keys
        </CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Your New Relic and Sentry keys are stored in .env.local on this machine and are never shown here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/setup" className={buttonVariants({ variant: "outline" })}>Manage keys</Link>
      </CardContent>
    </Card>
  );
}
