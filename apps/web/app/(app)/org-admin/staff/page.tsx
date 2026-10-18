import { Can } from "@/components/features/auth/can";
import { InviteStaffModal } from "@/components/features/staff/add-staff-modal";
import { StaffTabs } from "./staff-tabs";

export const metadata = {
  title: "Staff Management | Qrew",
  description: "Manage your team members and their roles",
};

export default function StaffPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground mt-1">
            Invite and manage team members within your organization.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Can I="staff:invite">
            <InviteStaffModal />
          </Can>
        </div>
      </div>

      <StaffTabs />
    </div>
  );
}
