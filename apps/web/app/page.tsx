"use client";

import { motion } from "framer-motion";
import { CheckCircle2, FileText, Moon, MoveRight, Receipt, Sun, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackgroundEffects } from "@/components/layout/background-effects";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QrewLogo } from "@/components/ui/logo";
import { ScrollArea } from "@/components/ui/scroll-area";

import { authClient } from "@/lib/auth-client";

export default function LandingPage() {
  const [isDark, setIsDark] = useState(true);
  const [titleNumber, setTitleNumber] = useState(0);

  const titles = useMemo(
    () => ["automated", "transparent", "efficient", "unified", "effortless"],
    [],
  );

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    // Log out the user if they visit the landing page
    authClient.getSession().then(({ data }) => {
      if (data?.session) {
        authClient.signOut();
      }
    });
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber((prev) => (prev === titles.length - 1 ? 0 : prev + 1));
    }, 2500);
    return () => clearTimeout(timeoutId);
  }, [titles]);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.toggle("dark");
    setIsDark(root.classList.contains("dark"));
  };

  return (
    <main className="h-screen w-full overflow-hidden bg-background">
      <BackgroundEffects />

      <ScrollArea className="h-full w-full">
        <div className="min-h-screen flex flex-col relative z-10">
          {/* Top Navigation */}
          <header className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between border-b border-border/50 bg-background/50 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-2 font-extrabold text-2xl tracking-tight text-foreground">
              <QrewLogo className="h-8 w-8" />
              Qrew
            </div>
            <nav className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="text-muted-foreground rounded-full focus-visible:ring-0 focus-visible:outline-none border-0"
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Link href="/sign-in">
                <Button variant="ghost" className="hidden sm:inline-flex rounded-full">
                  Sign In
                </Button>
              </Link>
            </nav>
          </header>

          <section className="flex-1 flex flex-col w-full pb-32">
            {/* HERO SECTION */}
            <div className="container mx-auto px-4 pt-24 lg:pt-32 flex flex-col items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 rounded-full px-4 border border-border/50 mb-8 bg-background/80 backdrop-blur-md shadow-sm"
                >
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Purpose-built for BD Enterprises
                </Button>
              </motion.div>

              <h1 className="text-5xl md:text-7xl max-w-4xl tracking-tighter text-center font-bold text-foreground">
                <span className="block mb-2">Office management, made</span>
                <span className="relative flex w-full justify-center overflow-hidden text-center h-[1.2em] text-primary">
                  {titles.map((title, index) => (
                    <motion.span
                      key={index}
                      className="absolute font-semibold"
                      initial={{ opacity: 0, y: 50, filter: "blur(4px)" }}
                      animate={
                        titleNumber === index
                          ? { y: 0, opacity: 1, filter: "blur(0px)" }
                          : { y: titleNumber > index ? -50 : 50, opacity: 0, filter: "blur(4px)" }
                      }
                      transition={{ type: "spring", stiffness: 60, damping: 15 }}
                    >
                      {title}
                    </motion.span>
                  ))}
                </span>
              </h1>

              <p className="text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground max-w-2xl text-center mt-6">
                Replace scattered spreadsheets with a centralized dashboard. Track file statuses,
                manage staff accounts, and auto-generate invoices instantly from recorded costs.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mt-10 w-full sm:w-auto">
                <Link href="/sign-in" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-12 px-8 rounded-full bg-background/80 backdrop-blur-md shadow-sm border-border/50 hover:bg-muted"
                  >
                    Sign In to Portal
                  </Button>
                </Link>
                <Link href="/sign-up" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full h-12 px-8 gap-2 rounded-full shadow-lg shadow-primary/20"
                  >
                    Get Started <MoveRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* FEATURES SECTION */}
            <div className="container mx-auto px-4 mt-32 relative z-10">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  Everything your office needs
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Designed specifically to handle complex file workflows, client profiles, and exact
                  financial tracking.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                <Card className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <FileText className="h-8 w-8 text-primary mb-2" />
                    <CardTitle>File Status Management</CardTitle>
                    <CardDescription>
                      Track every job and shipment end-to-end. Instantly know which desk a file is
                      on and its current operational state.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <Wallet className="h-8 w-8 text-primary mb-2" />
                    <CardTitle>Per-File Financial Tracking</CardTitle>
                    <CardDescription>
                      Log precise expenditures, advances, and costs directly against specific files
                      to prevent revenue leakage.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <Receipt className="h-8 w-8 text-primary mb-2" />
                    <CardTitle>Automated Invoicing</CardTitle>
                    <CardDescription>
                      Stop manually compiling bills. Generate PDF invoices automatically based on
                      the exact costs recorded in the file ledger.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <Users className="h-8 w-8 text-primary mb-2" />
                    <CardTitle>Staff & Customer Profiles</CardTitle>
                    <CardDescription>
                      Maintain a centralized directory. Assign files to specific staff members and
                      maintain clear ledgers for every customer.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* PRICING SECTION (Localized to BDT) */}
            <div className="container mx-auto px-4 mt-32 mb-16 relative z-10">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  Transparent Local Pricing
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Scalable infrastructure priced for the Bangladeshi market.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <Card className="bg-background/80 backdrop-blur-md border-border/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-2xl">Single Office</CardTitle>
                    <CardDescription>Perfect for growing agencies</CardDescription>
                    <div className="mt-4 text-4xl font-bold">
                      ৳ 3,000<span className="text-lg text-muted-foreground font-normal">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Up to 5 Staff Accounts
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Unlimited Active Files
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Automated Invoicing Engine
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Standard Support
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link href="/sign-up" className="w-full">
                      <Button className="w-full rounded-full" variant="outline">
                        Start Free Trial
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="bg-card/90 backdrop-blur-xl border-primary shadow-2xl shadow-primary/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-bl-lg">
                    ENTERPRISE
                  </div>
                  <CardHeader>
                    <CardTitle className="text-2xl">Corporate</CardTitle>
                    <CardDescription>For high-volume operations</CardDescription>
                    <div className="mt-4 text-4xl font-bold">
                      ৳ 8,000<span className="text-lg text-muted-foreground font-normal">/mo</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Unlimited Staff Accounts
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Advanced Profit/Loss
                      Analytics
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Multi-branch tracking
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Priority 24/7 Telephone
                      Support
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link href="/sign-up" className="w-full">
                      <Button className="w-full rounded-full shadow-lg shadow-primary/20">
                        Upgrade to Corporate
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </main>
  );
}
