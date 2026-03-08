"use client"

import { useEffect, useState } from "react"
import { CreditCard, AlertCircle, Clock } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-context"

function DigitalClock() {
    const [time, setTime] = useState("")
    const [date, setDate] = useState("")

    useEffect(() => {
        const timerId = setInterval(() => {
            const now = new Date()
            setTime(now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }))
            setDate(now.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Kolkata" }))
        }, 1000)
        return () => clearInterval(timerId)
    }, [])

    if (!time) {
        return (
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4 shadow">
                <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-cyan-400" />
                    <div className="h-5 w-20 animate-pulse rounded-md bg-neutral-800" />
                </div>
                <div className="mt-1 h-4 w-28 animate-pulse rounded-md bg-neutral-800" />
            </div>
        )
    }

    return (
        <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4 shadow">
            <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                <div className="text-sm font-semibold tracking-wide text-neutral-100">{time}</div>
            </div>
            <div className="mt-1 text-xs text-neutral-400">{date}</div>
        </div>
    )
}

function InfoSection() {
    const [counts, setCounts] = useState<{ groups: number; tasks: number; notes: number } | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [groupsRes, tasksRes, notesRes] = await Promise.all([
                    fetch('/api/security/access', { credentials: 'include' }),
                    fetch('/api/tasks', { credentials: 'include' }),
                    fetch('/api/notes', { credentials: 'include' })
                ])

                const groups = groupsRes.ok ? await groupsRes.json() : { data: [] }
                const tasks = tasksRes.ok ? await tasksRes.json() : []
                const notes = notesRes.ok ? await notesRes.json() : []

                setCounts({
                    groups: Array.isArray(groups.data) ? groups.data.length : 0,
                    tasks: Array.isArray(tasks) ? tasks.length : 0,
                    notes: Array.isArray(notes) ? notes.length : 0
                })
            } catch (error) {
                console.error('Error fetching counts:', error)
                setCounts({ groups: 0, tasks: 0, notes: 0 })
            } finally {
                setLoading(false)
            }
        }

        fetchCounts()
    }, [])

    if (loading) {
        return (
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4 shadow">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded bg-teal-400/20" />
                    <div className="h-4 w-20 animate-pulse rounded-md bg-neutral-800" />
                </div>
                <div className="mt-2 space-y-1">
                    <div className="h-3 w-16 animate-pulse rounded-md bg-neutral-800" />
                    <div className="h-3 w-16 animate-pulse rounded-md bg-neutral-800" />
                    <div className="h-3 w-16 animate-pulse rounded-md bg-neutral-800" />
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4 shadow">
            <div className="flex items-center gap-3 mb-3">
                <div className="h-5 w-5 rounded bg-teal-400/20 flex items-center justify-center">
                    <span className="text-xs text-teal-400 font-bold">i</span>
                </div>
                <div className="text-sm font-medium text-neutral-200">Overview</div>
            </div>
            <div className="space-y-1 text-xs text-neutral-400">
                <div className="flex justify-between">
                    <span>Groups:</span>
                    <span className="text-teal-400 font-medium">{counts?.groups || 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Tasks:</span>
                    <span className="text-blue-400 font-medium">{counts?.tasks || 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Notes:</span>
                    <span className="text-purple-400 font-medium">{counts?.notes || 0}</span>
                </div>
            </div>
        </div>
    )
}

type Note = { id: string; icon: string; title: string; desc: string; ts: string; href?: string }

export default function RightRail({ onClearAll }: { onClearAll?: () => void }) {
    const [notes, setNotes] = useState<Note[]>([])
    const [loading, setLoading] = useState(false)
    const { loggedIn } = useAuth()

    useEffect(() => {
        if (!loggedIn) return
        async function fetchNotifs() {
            setLoading(true)
            try {
                const res = await fetch('/api/notifications', { credentials: 'include' })
                if (res.ok) {
                    const json = await res.json()
                    setNotes(json.data || [])
                }
            } catch (e) {
                console.error("fetch notifs error", e)
            } finally {
                setLoading(false)
            }
        }
        fetchNotifs()
    }, [loggedIn])

    function clearAll() {
        setNotes([])
        onClearAll?.()
    }

    return (
        <div className="flex h-full flex-col">
            <div className="px-4 py-4">
                <div className="grid grid-cols-1 gap-3">
                    <DigitalClock />
                    <InfoSection />
                </div>
            </div>

            <Separator className="bg-neutral-800" />

            <div className="flex h-0 min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-4 py-3">
                    <h2 className="text-sm font-semibold tracking-wide">NOTIFICATIONS</h2>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-neutral-800 text-xs text-neutral-300 hover:bg-neutral-900 bg-transparent"
                        onClick={clearAll}
                    >
                        CLEAR ALL
                    </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-500px)] px-4">
                    <ul className="space-y-2">
                        {notes.map((n) => (
                            <li
                                key={n.id}
                                className="group rounded-md border border-neutral-800 bg-neutral-950 p-3 transition hover:bg-neutral-900"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {n.icon === "payment" ? (
                                            <CreditCard className="h-4 w-4 text-teal-400" aria-hidden="true" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium"><a href={n.href}>{n.title}</a></p>
                                            <Badge variant="outline" className="border-neutral-800 text-[10px] text-neutral-400">
                                                {n.ts}
                                            </Badge>
                                        </div>
                                        <p className="mt-1 text-xs text-neutral-400">{n.desc}</p>
                                    </div>
                                </div>
                            </li>
                        ))}
                        {loading && <p className="text-center text-xs text-neutral-500 py-4">Loading...</p>}
                    </ul>
                    {notes.length > 0 ? (
                        <div className="mt-3 text-right">
                            <a href="#" className="text-xs text-teal-400 hover:underline">
                                SHOW ALL
                            </a>
                        </div>
                    ) : (
                        <p className="mt-6 text-center text-xs text-neutral-500">All caught up.</p>
                    )}
                </ScrollArea>
            </div>
        </div>
    )
}