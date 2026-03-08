"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Database, Calendar, FileText, Shield, Settings, Bell, LogOut, CheckSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useAuth } from "@/components/auth-context"

const NAV = [
  { href: "/", icon: Database, label: "Overview" },
  { href: "/calendar", icon: Calendar, label: "Calendar" },
  { href: "/notes", icon: FileText, label: "Notes" },
  { href: "/tasks", icon: CheckSquare, label: "Tasks" },
  { href: "/?view=security", icon: Shield, label: "Security" },
  { href: "/?view=settings", icon: Settings, label: "Settings" },
]

export default function LeftSidebar({
  unread = 0,
  onLogout,
}: {
  unread?: number
  onLogout?: () => void
}) {
  const pathname = usePathname()
  const search = useSearchParams()
  const view = search.get("view")
  const { user, loggedIn, userRole } = useAuth()

  const [items, setItems] = useState<{ id: string; title: string; desc: string; href: string; ts: string }[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch from the API
  useEffect(() => {
    if (!loggedIn) return
    async function fetchNotifs() {
      setLoading(true)
      try {
        const res = await fetch('/api/notifications', { credentials: 'include' })
        if (res.ok) {
          const json = await res.json()
          setItems(json.data || [])
        }
      } catch (e) {
        console.error("fetch notifs error", e)
      } finally {
        setLoading(false)
      }
    }
    fetchNotifs()
  }, [loggedIn])

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="relative h-2 w-2 rounded-full bg-teal-500">
            <span className="absolute inset-0 animate-pulse rounded-full bg-teal-500/40" />
          </div>
          <span className="text-sm font-semibold tracking-wide">CREDENCE</span>
        </div>
      </div>
      <Separator className="bg-neutral-800" />

      {/* Nav */}
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const isViewLink = item.href.startsWith("/?view=")
            const targetView = isViewLink ? item.href.split("view=")[1] : null
            const active = isViewLink ? pathname === "/" && view === targetView : pathname === item.href

            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-neutral-900 text-neutral-100 shadow-[inset_2px_0_0_0_theme(colors.teal.500)]"
                      : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition",
                      active ? "text-teal-400" : "text-neutral-400 group-hover:text-teal-400",
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-pretty">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <Separator className="bg-neutral-800" />

      {/* Profile + Quick actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        {loggedIn ? (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {user?.name ? user.name.substring(0, 2).toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user?.name || 'User'}
              </p>
              <p className="truncate text-xs text-neutral-400">
                {userRole || 'No role'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>?</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-400">Not signed in</p>
              <p className="truncate text-xs text-neutral-500">Sign in to continue</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {loggedIn && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  aria-label={`Notifications (${unread} unread)`}
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] leading-none text-black">
                      {unread}
                    </span>
                  )}
                </button>
              </PopoverTrigger>

              <PopoverContent
                side="top"
                align="end"
                sideOffset={8}
                className="w-80 p-0 bg-neutral-950 border-neutral-800"
              >
                <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
                  <p className="text-xs font-medium text-neutral-200">Notifications</p>
                  <button
                    className="text-xs text-neutral-400 hover:text-neutral-200"
                    onClick={() => setItems([])}
                    aria-label="Clear all notifications"
                  >
                    Clear all
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto scrollbar-hide">
                  {loading && <div className="px-3 py-8 text-center text-sm text-neutral-400">Loading...</div>}
                  {!loading && items.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-neutral-400">You're all caught up.</div>
                  ) : (
                    <ul className="divide-y divide-neutral-900">
                      {!loading && items.map((n) => (
                        <li key={n.id} className="group">
                          <Link
                            href={n.href}
                            className="flex items-start gap-3 px-3 py-3 transition hover:bg-neutral-900/60"
                          >
                            <span
                              className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-500"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-semibold text-neutral-100">{n.title}</p>
                                <span className="text-[10px] text-neutral-500">{n.ts}</span>
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-xs text-neutral-300">{n.desc}</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {loggedIn && (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
