"use client";

import React from "react";
import { Box } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { explain3d, isLimit } from "@/lib/use3d";
import { setUse3dChoice, use3dEnabled } from "@/lib/use3dEnabled";

/** Settings switch for optional 3D views. Off by default; the 2D view stays the accessible default. */
export function ThreeDPrefs() {
  const { userChoice, reason } = use3dEnabled();
  const blocked = isLimit(reason);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Box className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Display
        </CardTitle>
        <CardDescription>Optional views. Nothing changes unless you switch them on.</CardDescription>
      </CardHeader>
      <CardContent className="max-w-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="three-d-views" className="text-sm">3D views</Label>
            <p id="three-d-views-help" className="text-xs text-muted-foreground" data-reason={reason ?? ""}>
              {explain3d(reason)}
            </p>
          </div>
          <Switch
            id="three-d-views"
            aria-label="3D views"
            aria-describedby="three-d-views-help"
            checked={userChoice && !blocked}
            disabled={blocked}
            onCheckedChange={(v) => setUse3dChoice(v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
