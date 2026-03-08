// components/ui/appshell.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import LeftSidebar from "@/components/left-sidebar";
import RightRail from "@/components/right-rail";
import Topbar from "@/components/topbar";
import { InfoButton } from "@/components/info-button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-context";

function ShellInner({ children }: { children: React.ReactNode }) {
    const [loggingOut, setLoggingOut] = useState(false);
    const [unread, setUnread] = useState(0);
    const [mobileOpen, setMobileOpen] = useState(false);
    const closeBtnRef = useRef<HTMLButtonElement | null>(null);

    const { logout, loggedIn } = useAuth();

    useEffect(() => {
        if (!loggedIn) return;
        fetch('/api/notifications', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data?.data?.length) setUnread(data.data.length);
            })
            .catch(() => { });
    }, [loggedIn]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setMobileOpen(false);
        }
        if (mobileOpen) {
            setTimeout(() => closeBtnRef.current?.focus(), 0);
            document.addEventListener("keydown", onKey);
        }
        return () => document.removeEventListener("keydown", onKey);
    }, [mobileOpen]);

    return (
        <div className="min-h-dvh bg-black text-neutral-100">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-neutral-950 focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
                Skip to content
            </a>

            <Topbar isOpen={mobileOpen} onOpenMenu={() => setMobileOpen(true)} />

            <div className="px-4 lg:px-6">
                <div className={cn("flex min-h-0 gap-4 lg:gap-6", loggingOut && "pointer-events-none")}>
                    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-neutral-800 lg:block">
                        <LeftSidebar
                            unread={unread}
                            onLogout={async () => {
                                setLoggingOut(true);
                                await new Promise((r) => setTimeout(r, 700));
                                await logout();
                                setLoggingOut(false);
                            }}
                        />
                    </aside>

                    <main id="main-content" className="flex-1 min-h-0 overflow-hidden py-4 lg:py-6">
                        <div className="animate-in fade-in duration-300">{children}</div>
                    </main>

                    <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 border-l border-neutral-800 xl:block">
                        <RightRail onClearAll={() => setUnread(0)} />
                    </aside>
                </div>
            </div>

            <div
                id="mobile-nav"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-nav-title"
                className={cn("fixed inset-0 z-40 lg:hidden", mobileOpen ? "block" : "hidden")}
            >
                <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
                <div
                    className={cn(
                        "absolute left-0 top-0 h-full w-72 transform border-r border-neutral-800 bg-black shadow-xl transition-transform duration-300",
                        mobileOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                >
                    <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                        <h2 id="mobile-nav-title" className="text-sm font-semibold">
                            Navigation
                        </h2>
                        <button
                            ref={closeBtnRef}
                            type="button"
                            onClick={() => setMobileOpen(false)}
                            className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                            aria-label="Close menu"
                        >
                            Close
                        </button>
                    </div>
                    <div className="h-[calc(100%-48px)] overflow-y-auto scrollbar-hide">
                        <LeftSidebar
                            unread={unread}
                            onLogout={async () => {
                                setMobileOpen(false);
                                setLoggingOut(true);
                                await new Promise((r) => setTimeout(r, 700));
                                await logout();
                                setLoggingOut(false);
                            }}
                        />
                    </div>
                </div>
            </div>

            <div
                aria-hidden={!loggingOut}
                className={cn(
                    "pointer-events-none fixed inset-0 z-50 opacity-0 transition-opacity duration-500",
                    loggingOut && "pointer-events-auto bg-black/80 opacity-100"
                )}
            >
                <div className="flex h-full items-center justify-center">
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-5 py-3 text-sm text-neutral-300 shadow">
                        Logging out…
                    </div>
                </div>
            </div>

            {/* Info Button */}
            <InfoButton />
        </div>
    );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    // IMPORTANT: DO NOT wrap with a second AuthProvider here.
    // The app-level AuthProvider should live in app/layout.tsx only.
    return <ShellInner>{children}</ShellInner>;
}
