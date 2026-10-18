export default function OrgAdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Office Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your office settings and high-level metrics here.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            title: "Staff Management",
            description: "Provision accounts, manage team access, and view balances.",
            href: "/org-admin/staff",
          },
          {
            title: "Roles & Permissions",
            description: "Create custom roles and assign granular PBAC permissions.",
            href: "/org-admin/roles",
          },
          {
            title: "Customize Fields",
            description: "Configure system fields, custom field schemas, and project workflows.",
            href: "/org-admin/customize-fields",
          },
          {
            title: "Invoice Templates",
            description: "Design calculation formulas, row rates, and billing structures.",
            href: "/org-admin/invoice-templates",
          },
        ].map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="group flex flex-col gap-2 rounded-lg border border-border/50 bg-card/30 p-5 transition-colors hover:bg-muted/50 hover:border-border"
          >
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {card.title}
            </h3>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
