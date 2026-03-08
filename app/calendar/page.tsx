"use client"

import React from "react"
import AppShell from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useMemo, useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { CheckSquare, Clock, Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { useAuth } from "@/components/auth-context"
import { LoadingDots } from "@/components/ui/loading-spinner"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(d: Date) {
  const s = new Date(d)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return s
}

export default function CalendarPage() {
  const [view, setView] = useState<"Month" | "Week" | "Day">("Month")
  const { selectedGroupId } = useAuth()
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [viewDate, setViewDate] = useState(() => new Date())

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const navigatePrev = useCallback(() => {
    setViewDate(prev => {
      const d = new Date(prev)
      if (view === "Month") d.setMonth(d.getMonth() - 1)
      else if (view === "Week") d.setDate(d.getDate() - 7)
      else d.setDate(d.getDate() - 1)
      return d
    })
  }, [view])

  const navigateNext = useCallback(() => {
    setViewDate(prev => {
      const d = new Date(prev)
      if (view === "Month") d.setMonth(d.getMonth() + 1)
      else if (view === "Week") d.setDate(d.getDate() + 7)
      else d.setDate(d.getDate() + 1)
      return d
    })
  }, [view])

  const goToday = useCallback(() => setViewDate(new Date()), [])

  useEffect(() => { fetchTasks() }, [selectedGroupId])

  async function fetchTasks() {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedGroupId) params.set('groupId', selectedGroupId)
      if (showAll && isAdmin) params.set('scope', 'all')
      const qs = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`/api/tasks${qs}`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setTasks(Array.isArray(data) ? data : [])
      if (showAll) setIsAdmin(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const probe = async () => {
      try {
        const res = await fetch('/api/security/access', { credentials: 'include' })
        setIsAdmin(!!res.ok)
      } catch {
        setIsAdmin(false)
      }
    }
    probe()
  }, [])

  // Build date-keyed task index
  const byDateKey = useMemo(() => {
    const map = new Map<string, { dueCount: number; createdCount: number; totalCount: number }>()
    for (const t of tasks) {
      if (t.dueDate) {
        const d = new Date(t.dueDate)
        if (!isNaN(d.getTime())) {
          const k = dateKey(d)
          const e = map.get(k) || { dueCount: 0, createdCount: 0, totalCount: 0 }
          e.dueCount += 1
          e.totalCount += 1
          map.set(k, e)
        }
      }
      if (t.createdAt) {
        const d = new Date(t.createdAt)
        if (!isNaN(d.getTime())) {
          const k = dateKey(d)
          const e = map.get(k) || { dueCount: 0, createdCount: 0, totalCount: 0 }
          e.createdCount += 1
          e.totalCount += 1
          map.set(k, e)
        }
      }
    }
    return map
  }, [tasks])

  const ordered = useMemo(() => {
    const ranked = [...tasks]
    ranked.sort((a: any, b: any) => {
      const ar = (a.status === 'completed' || a.status === 'cancelled') ? 1 : 0
      const br = (b.status === 'completed' || b.status === 'cancelled') ? 1 : 0
      if (ar !== br) return ar - br
      const aTime = a.dueDate ? Date.parse(a.dueDate) : Date.parse(a.createdAt)
      const bTime = b.dueDate ? Date.parse(b.dueDate) : Date.parse(b.createdAt)
      return bTime - aTime
    })
    return ranked
  }, [tasks])

  async function markDone(taskId: string, next: boolean) {
    const res = await fetch('/api/tasks/complete', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ task_id: taskId, is_completed: next })
    })
    if (res.ok) fetchTasks()
  }

  function filterTasksForDate(date: Date) {
    return ordered.filter(t => {
      if (t.dueDate) {
        const d = new Date(t.dueDate)
        if (!isNaN(d.getTime()) && sameDay(d, date)) return true
      }
      if (t.createdAt) {
        const d = new Date(t.createdAt)
        if (!isNaN(d.getTime()) && sameDay(d, date)) return true
      }
      return false
    })
  }

  // Compute calendar cells for the current view
  const calendarCells = useMemo(() => {
    if (view === "Day") {
      return [{ date: new Date(year, month, viewDate.getDate()), inView: true }]
    }

    if (view === "Week") {
      const weekStart = startOfWeek(viewDate)
      const cells: { date: Date; inView: boolean }[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        cells.push({ date: d, inView: true })
      }
      return cells
    }

    // Month view
    const firstDay = new Date(year, month, 1)
    const startWeekday = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7
    const cells: { date: Date; inView: boolean }[] = []
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startWeekday + 1
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth
      cells.push({
        date: new Date(year, month, dayNum),
        inView: inMonth,
      })
    }
    return cells
  }, [view, year, month, viewDate])

  // Header title
  const headerTitle = useMemo(() => {
    if (view === "Day") {
      return viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    if (view === "Week") {
      const ws = startOfWeek(viewDate)
      const we = new Date(ws)
      we.setDate(ws.getDate() + 6)
      const sameMonth = ws.getMonth() === we.getMonth()
      if (sameMonth) {
        return `${ws.toLocaleDateString(undefined, { month: 'long' })} ${ws.getDate()} - ${we.getDate()}, ${we.getFullYear()}`
      }
      return `${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${we.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }, [view, viewDate])

  // Tasks for the right panel
  const displayedTasks = useMemo(() => {
    if (selectedDate) return filterTasksForDate(selectedDate)
    return ordered
  }, [selectedDate, ordered, tasks])

  function renderCell(cell: { date: Date; inView: boolean }, index: number) {
    const isToday = sameDay(cell.date, today)
    const isSelected = selectedDate && sameDay(cell.date, selectedDate)
    const k = dateKey(cell.date)
    const info = byDateKey.get(k)
    const hasTasks = info && info.totalCount > 0

    const dayLabel = view === "Day"
      ? cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : cell.date.getDate()

    return (
      <div
        key={index}
        className={[
          "group rounded-md border p-1 text-xs transition",
          view === "Day" ? "min-h-[200px] p-4" : "aspect-square",
          cell.inView ? "cursor-pointer hover:bg-neutral-900" : "opacity-40",
          isSelected
            ? "border-teal-500/60 bg-teal-500/10"
            : isToday
              ? "border-teal-500/30 bg-teal-950/30"
              : "border-neutral-800 bg-black",
          !cell.inView && "bg-neutral-950 text-neutral-700",
        ].filter(Boolean).join(" ")}
        onClick={() => cell.inView && setSelectedDate(prev => prev && sameDay(prev, cell.date) ? null : cell.date)}
      >
        <span
          className={[
            "inline-block rounded-sm px-1",
            isToday ? "bg-teal-500 text-black font-semibold" : "bg-neutral-900",
            !cell.inView && "bg-transparent",
          ].filter(Boolean).join(" ")}
        >
          {cell.inView ? dayLabel : ''}
        </span>

        {view === "Day" && hasTasks && (
          <div className="mt-3 space-y-1">
            {filterTasksForDate(cell.date).slice(0, 8).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-neutral-300 text-xs">
                <div className={`h-1.5 w-1.5 rounded-full ${t.dueDate ? 'bg-green-500/70' : 'bg-blue-500/70'}`} />
                <span className="truncate">{t.title}</span>
                <Badge variant="outline" className="text-[9px] ml-auto">{t.status}</Badge>
              </div>
            ))}
          </div>
        )}

        {view !== "Day" && hasTasks && (
          <div className="mt-1 flex justify-center gap-0.5">
            {info.dueCount > 0 && (
              <div
                className="rounded-full bg-green-500/70 h-1.5 w-1.5"
                title={`${info.dueCount} task(s) due`}
              />
            )}
            {info.createdCount > 0 && (
              <div
                className="rounded-full bg-blue-500/70 h-1.5 w-1.5"
                title={`${info.createdCount} task(s) created`}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-lg border border-neutral-800 bg-gradient-to-br from-neutral-950 to-neutral-900 shadow-lg">
          <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
                <Calendar className="w-5 h-5 text-teal-400" />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={navigatePrev} className="h-7 w-7 p-0 text-neutral-400 hover:text-white hover:bg-neutral-800">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-lg font-semibold text-white min-w-[180px] text-center">
                  {headerTitle}
                </h1>
                <Button variant="ghost" size="sm" onClick={navigateNext} className="h-7 w-7 p-0 text-neutral-400 hover:text-white hover:bg-neutral-800">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToday} className="ml-1 border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800 bg-transparent">
                  Today
                </Button>
              </div>
            </div>
            <div className="inline-flex gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAll(s => !s); fetchTasks() }}
                  className={showAll ? "border-cyan-600/40 bg-cyan-900/20 text-cyan-200" : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"}
                  title="Toggle view all users' tasks"
                >
                  {showAll ? 'All Tasks' : 'My Tasks'}
                </Button>
              )}
              {(["Month", "Week", "Day"] as const).map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  onClick={() => setView(v)}
                  className={
                    view === v
                      ? "border-teal-500/40 bg-teal-500/10 text-teal-100"
                      : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"
                  }
                >
                  {v}
                </Button>
              ))}
            </div>
          </header>
          <div className="p-4">
            {/* Day header row */}
            {view !== "Day" && (
              <div className="grid grid-cols-7 gap-2 text-center text-xs text-neutral-400">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="py-2">{d}</div>
                ))}
              </div>
            )}
            {/* Calendar cells */}
            <div className={`mt-2 grid gap-2 ${view === "Day" ? "grid-cols-1" : "grid-cols-7"}`}>
              {calendarCells.map((cell, i) => renderCell(cell, i))}
            </div>
            {/* Dot legend */}
            <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500/70" /> Due date
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500/70" /> Created date
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-500" /> Today
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-gradient-to-br from-neutral-950 to-neutral-900 shadow-lg">
          <header className="border-b border-neutral-800 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <CheckSquare className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {selectedDate ? `Tasks on ${selectedDate.toLocaleDateString()}` : 'Upcoming Tasks'}
                  </h2>
                  <p className="text-sm text-neutral-400">
                    {selectedDate ? `${displayedTasks.length} task(s) on this date` : 'Track your progress and deadlines'}
                  </p>
                </div>
              </div>
              {selectedDate && (
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(null)} className="border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800 bg-transparent">
                  Clear
                </Button>
              )}
            </div>
          </header>
          <div className="p-4 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center space-y-2">
                  <LoadingDots />
                  <p className="text-xs text-neutral-500">Loading tasks...</p>
                </div>
              </div>
            )}
            {!loading && displayedTasks.map((t) => (
              <Card key={t.id} className="border-neutral-800 bg-black transition data-[done=true]:opacity-50" data-done={t.status === 'completed'}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{t.title}</span>
                    <Badge variant="outline" className="text-[10px]">{t.groupName || 'Group'}</Badge>
                  </CardTitle>
                  {t.status === 'completed' ? (
                    <CheckSquare className="h-4 w-4 text-teal-400" />
                  ) : (
                    <Clock className="h-4 w-4 text-cyan-400" />
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-neutral-400">
                  <div className="flex flex-col gap-1">
                    {t.dueDate && (
                      <span className="text-green-400 font-semibold">Due: {new Date(t.dueDate).toLocaleDateString()}</span>
                    )}
                    <span className="text-blue-400">Created: {new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-neutral-800 text-[11px] text-neutral-300 hover:bg-neutral-900 bg-transparent"
                    onClick={() => markDone(t.id, t.status !== 'completed')}
                  >
                    {t.status === 'completed' ? 'Mark pending' : 'Mark done'}
                  </Button>
                </CardContent>
              </Card>
            ))}
            {!loading && displayedTasks.length === 0 && (
              <p className="py-8 text-center text-xs text-neutral-500">
                {selectedDate ? 'No tasks on this date.' : 'Nothing upcoming.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
