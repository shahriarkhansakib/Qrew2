"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Can } from "@/components/features/auth/can";
import { InvitationsDataTable } from "@/components/features/staff/invitations-data-table";
import { StaffDataTable } from "@/components/features/staff/staff-data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function StaffTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "active";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

  // Fetch pending invites just for the badge count (React Query automatically dedupes this!)
  const { data: invitations = [] } = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/invites`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.invitations || [];
    },
  });

  const inviteCount = invitations.length;

  const handleTabChange = (value: string) => {
    router.push(`?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6 inline-flex w-fit items-center gap-2 bg-transparent h-auto p-0">
        <TabsTrigger
          value="active"
          className="flex-none w-auto rounded-md data-[state=active]:bg-muted px-4 py-1.5 transition-colors hover:bg-muted/50 data-[state=active]:shadow-none data-[state=active]:text-foreground text-muted-foreground font-medium text-sm"
        >
          Active Staff
        </TabsTrigger>

        <Can I="staff:provision" fallback={<></>}>
          <TabsTrigger
            value="pending"
            className="flex-none w-auto rounded-md data-[state=active]:bg-muted px-4 py-1.5 transition-colors hover:bg-muted/50 data-[state=active]:shadow-none data-[state=active]:text-foreground text-muted-foreground font-medium text-sm flex items-center gap-2"
          >
            Pending Invitations
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                inviteCount > 0
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-muted-foreground/20 text-muted-foreground"
              }`}
            >
              {inviteCount}
            </span>
          </TabsTrigger>
        </Can>
      </TabsList>

      <TabsContent value="active" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StaffDataTable isReadOnly={false} />
        </div>
      </TabsContent>

      <Can I="staff:provision" fallback={<></>}>
        <TabsContent
          value="pending"
          className="mt-0 focus-visible:outline-none focus-visible:ring-0"
        >
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <InvitationsDataTable />
          </div>
        </TabsContent>
      </Can>
    </Tabs>
  );
}
