"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-context"
import { useSearchParams, useRouter } from "next/navigation"
import AppShell from "@/components/app-shell"
import SecurityPanel from "@/components/security-panel"
import SettingsPanel from "@/components/settings-panel"
import GroupGate from "@/components/groups/group-gate"
import { ChatView } from "@/components/chat/chat-view"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

export default function Page() {
  
  const { loggedIn, loading, selectedGroupId } = useAuth()
  const search = useSearchParams()
  const router = useRouter()
  const view = search.get("view")

  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  
  if (!isClient || loading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <LoadingSpinner size="lg" />
            <p className="text-neutral-500">Loading...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  
  const renderContent = () => {
    
    if (view === "security") return <SecurityPanel />;
    if (view === "settings") return <SettingsPanel />;


    if (loggedIn && selectedGroupId) return <ChatView />;

    
    if (loggedIn && !selectedGroupId) return <GroupGate />;

    
    return (
      <div className="relative flex h-[calc(100vh-120px)] flex-col place-items-center justify-center">
        <div className="rounded-md border border-neutral-800 bg-neutral-950 p-8 text-center shadow max-w-md w-full mx-4">
          <div className="mb-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-teal-500/20 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Welcome to CREDENCE</h1>
            <p className="text-sm text-neutral-400">Secure, collaborative, intelligent</p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => router.push('/sign-in')}
              className="w-full inline-flex items-center justify-center rounded-md bg-teal-500 px-6 py-3 text-base font-semibold text-black transition hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Sign In / Sign Up
            </button>

          </div>
        </div>
      </div>
    );
  };

  return <AppShell>{renderContent()}</AppShell>
}

