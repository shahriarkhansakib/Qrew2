"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  Building2,
  DollarSign,
  FileText,
  FolderOpen,
  Layers,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Can } from "@/components/features/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/constants";
import DashboardGenericLoading from "./loading";

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<"6m" | "ytd" | "30d">("6m");
  const [chartMetric, setChartMetric] = useState<"both" | "revenue" | "expenses">("both");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/dashboard-stats`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json();
    },
  });

  if (isLoading) {
    return <DashboardGenericLoading />;
  }

  const getInvoiceStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return "bg-primary/15 text-primary border-primary/20";
      case "issued":
      case "open":
        return "bg-blue-500/15 text-blue-500 border-blue-500/20";
      case "frozen":
        return "bg-cyan-500/15 text-cyan-500 border-cyan-500/20";
      case "draft":
        return "bg-accent/15 text-accent-foreground border-amber-500/20";
      case "void":
      case "disputed":
        return "bg-destructive/15 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getProjectStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-blue-500/15 text-blue-500 border-blue-500/20";
      case "completed":
        return "bg-primary/15 text-primary border-primary/20";
      case "archived":
        return "bg-muted text-muted-foreground border-border";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const monthlyChartData = stats?.monthlyData || [
    { name: "Jan", revenue: 0, expenses: 0 },
    { name: "Feb", revenue: 0, expenses: 0 },
    { name: "Mar", revenue: 0, expenses: 0 },
    { name: "Apr", revenue: 0, expenses: 0 },
    { name: "May", revenue: 0, expenses: 0 },
    { name: "Jun", revenue: 0, expenses: 0 },
  ];

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Executive Command Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">Workspace Overview</h2>
            <Badge
              variant="outline"
              className="gap-1 bg-primary/10 text-primary border-primary/30 font-normal"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Live Telemetry
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time analytics, operational performance & financial metrics.
          </p>
        </div>

        {/* Header Control Toolbar & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selector */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-1 text-xs">
            <button
              onClick={() => setTimeframe("6m")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                timeframe === "6m"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              6 Months
            </button>
            <button
              onClick={() => setTimeframe("ytd")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                timeframe === "ytd"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              YTD
            </button>
            <button
              onClick={() => setTimeframe("30d")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                timeframe === "30d"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              This Month
            </button>
          </div>

          {/* Quick Actions Guarded by PBAC */}
          <Can I="invoice:create">
            <Link href="/dashboard/invoices">
              <Button size="sm" className="gap-1.5 shadow-sm">
                <Plus className="h-4 w-4" />
                Issue Invoice
              </Button>
            </Link>
          </Can>

          <Can I="file:create">
            <Link href="/dashboard/projects">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-border/60 bg-background/60 hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                New File
              </Button>
            </Link>
          </Can>

          <Can I="client:create">
            <Link href="/dashboard/clients">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-border/60 bg-background/60 hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </Link>
          </Can>
        </div>
      </div>

      {/* Metric Cards Grid (Wrapped in PBAC Guards) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Revenue (Finance Scoped) */}
        <Can
          I="invoice:view"
          fallback={
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Active Files</CardTitle>
                <FolderOpen className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.activeFiles || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Operational projects assigned to workspace
                </p>
              </CardContent>
            </Card>
          }
        >
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${Number(stats?.totalRevenue || 0).toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`inline-flex items-center text-xs font-semibold ${
                    (stats?.revenueGrowth || 0) >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {(stats?.revenueGrowth || 0) >= 0 ? (
                    <TrendingUp className="mr-0.5 h-3 w-3" />
                  ) : (
                    <TrendingDown className="mr-0.5 h-3 w-3" />
                  )}
                  {Math.abs(stats?.revenueGrowth || 0)}%
                </span>
                <span className="text-xs text-muted-foreground">vs last month</span>
              </div>
            </CardContent>
          </Card>
        </Can>

        {/* Metric 2: Expenses (Finance Scoped) */}
        <Can
          I="finance:view_expenses"
          fallback={
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Workspace Staff</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalStaff || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Active team members</p>
              </CardContent>
            </Card>
          }
        >
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <div className="rounded-md bg-accent/10 p-1.5 text-accent-foreground">
                <DollarSign className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${Number(stats?.totalExpenses || 0).toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`inline-flex items-center text-xs font-semibold ${
                    (stats?.expenseGrowth || 0) <= 0 ? "text-primary" : "text-accent-foreground"
                  }`}
                >
                  {stats?.expenseGrowth > 0 ? "+" : ""}
                  {stats?.expenseGrowth || 0}%
                </span>
                <span className="text-xs text-muted-foreground">vs last month</span>
              </div>
            </CardContent>
          </Card>
        </Can>

        {/* Metric 3: Active Files (File View Scoped) */}
        <Can
          I="file:view"
          fallback={
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Registered Clients</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Client accounts in system</p>
              </CardContent>
            </Card>
          }
        >
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Files</CardTitle>
              <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-500">
                <FolderOpen className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeFiles || 0}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Files currently in workflow
              </p>
            </CardContent>
          </Card>
        </Can>

        {/* Metric 4: Pending Invoices (Invoice Scoped) */}
        <Can
          I="invoice:view"
          fallback={
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Total workspace clients</p>
              </CardContent>
            </Card>
          }
        >
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
              <div className="rounded-md bg-indigo-500/10 p-1.5 text-indigo-500">
                <Receipt className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingInvoices || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting payment •{" "}
                <span className="text-accent-foreground font-medium">
                  {stats?.draftInvoices || 0} drafts
                </span>
              </p>
            </CardContent>
          </Card>
        </Can>
      </div>

      {/* Main Content Area: Financial Analytics & Recent Invoices */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Chart Column (4 cols) */}
        <Can
          I="invoice:view"
          fallback={
            <Card className="col-span-4 border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Operational File Summary
                </CardTitle>
                <CardDescription>Status and progress of active workspace files</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <h4 className="text-base font-semibold">Workspace Projects Active</h4>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  You currently have {stats?.activeFiles || 0} active files in progress across your
                  workspace.
                </p>
                <Link href="/dashboard/projects" className="mt-4">
                  <Button size="sm" variant="outline" className="gap-1">
                    View All Files <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          }
        >
          <Card className="col-span-4 border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Financial Performance Trend
                </CardTitle>
                <CardDescription>
                  Monthly revenue vs operational expenses comparison
                </CardDescription>
              </div>

              {/* Chart Metric Toggle */}
              <div className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs">
                <button
                  onClick={() => setChartMetric("both")}
                  className={`rounded px-2 py-0.5 font-medium transition-all ${
                    chartMetric === "both"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Both
                </button>
                <button
                  onClick={() => setChartMetric("revenue")}
                  className={`rounded px-2 py-0.5 font-medium transition-all ${
                    chartMetric === "revenue"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Revenue
                </button>
                <button
                  onClick={() => setChartMetric("expenses")}
                  className={`rounded px-2 py-0.5 font-medium transition-all ${
                    chartMetric === "expenses"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Expenses
                </button>
              </div>
            </CardHeader>
            <CardContent className="pl-2 pt-4">
              <div className="h-[310px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={monthlyChartData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      cursor={{
                        stroke: "hsl(var(--muted-foreground))",
                        strokeWidth: 1,
                        strokeDasharray: "3 3",
                      }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                      }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: any) => [`$${Number(value).toLocaleString()}`, undefined]}
                    />
                    {(chartMetric === "both" || chartMetric === "revenue") && (
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    )}
                    {(chartMetric === "both" || chartMetric === "expenses") && (
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Expenses"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorExpenses)"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </Can>

        {/* Recent Invoices Column (3 cols) */}
        <Can
          I="invoice:view"
          fallback={
            <Card className="col-span-3 border-border/50 bg-card/40 backdrop-blur-sm flex flex-col">
              <CardHeader>
                <CardTitle>Registered Clients</CardTitle>
                <CardDescription>
                  Overview of clients connected to this organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center text-center py-8">
                <Users className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-2xl font-bold">{stats?.totalClients || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Total active client accounts</p>
                <Link href="/dashboard/clients" className="mt-4">
                  <Button size="sm" variant="outline">
                    Client Directory
                  </Button>
                </Link>
              </CardContent>
            </Card>
          }
        >
          <Card className="col-span-3 border-border/50 bg-card/40 backdrop-blur-sm flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Recent Invoices</CardTitle>
                <CardDescription className="text-xs">
                  Latest billing documents generated.
                </CardDescription>
              </div>
              <Link href="/dashboard/invoices">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  View All <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1 px-4">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="h-8 text-xs font-semibold">Document</TableHead>
                    <TableHead className="h-8 text-xs font-semibold">Amount</TableHead>
                    <TableHead className="h-8 text-xs font-semibold text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!stats?.recentInvoices || stats?.recentInvoices?.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="h-28 text-center text-muted-foreground text-xs"
                      >
                        No recent invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats?.recentInvoices?.map((inv: any) => (
                      <TableRow
                        key={inv.id}
                        className="hover:bg-muted/40 transition-colors border-border/40"
                      >
                        <TableCell className="py-2.5">
                          <div className="font-medium text-sm">{inv.documentNumber}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[110px]">
                            {inv.issuedToClientName || "Client"}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 font-semibold text-sm">
                          ${Number(inv.grandTotalAmount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Badge
                            variant="outline"
                            className={`capitalize text-[10px] py-0.5 px-2 font-normal border ${getInvoiceStatusColor(inv.status)}`}
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Can>
      </div>

      {/* Bottom Section: Recent Files (Projects) */}
      <Can I="file:view">
        <div className="grid gap-4 grid-cols-1">
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  Recent Operational Files (Projects)
                </CardTitle>
                <CardDescription>
                  Files and projects currently active or recently updated.
                </CardDescription>
              </div>
              <Link href="/dashboard/projects">
                <Button size="sm" variant="outline" className="gap-1 text-xs">
                  All Files <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">File Name</TableHead>
                    <TableHead className="font-semibold">Date Created</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!stats?.recentFiles || stats?.recentFiles?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No recent operational files found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats?.recentFiles?.map((file: any) => (
                      <TableRow key={file.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{file.name}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {file.createdAt ? format(new Date(file.createdAt), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize font-normal border ${getProjectStatusColor(file.status)}`}
                          >
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href="/dashboard/projects">
                            <Button size="xs" variant="ghost" className="gap-1 text-xs">
                              Open <ArrowUpRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Can>
    </div>
  );
}
