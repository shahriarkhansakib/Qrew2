"use client";

import { ThemeSelector } from "@/components/features/settings/appearance/theme-selector";
import { Card, CardContent } from "@/components/ui/card";

export function AppearanceView() {
  return (
    <div className="flex flex-col gap-8 text-foreground w-full min-w-0 px-4 md:px-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Appearance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your application preferences and display settings.
        </p>
      </div>
      <Card className="bg-card/40 backdrop-blur-sm border-border/50 shadow-sm overflow-hidden min-w-0">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border/50 p-4 sm:p-5 bg-card/50">
            <div className="space-y-1">
              <label className="text-base font-medium">Interface Theme</label>
              <p className="text-sm text-muted-foreground">
                Select your preferred UI theme or sync with your system.
              </p>
            </div>
            <ThemeSelector />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
