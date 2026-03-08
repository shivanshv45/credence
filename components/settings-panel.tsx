"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"

export default function SettingsPanel() {
  const { user } = useAuth()

  const [fullName, setFullName] = useState("")
  const [bio, setBio] = useState("")
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user?.name) setFullName(user.name)
  }, [user?.name])

  const initials = (fullName || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const onSave = () => {
    setSaving(true)
    setTimeout(() => setSaving(false), 700)
  }

  return (
    <section
      aria-labelledby="settings-title"
      className="relative flex h-[calc(100vh-120px)] flex-col rounded-md border border-neutral-800 bg-neutral-950/50"
    >
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 id="settings-title" className="text-pretty text-sm font-semibold">
          Settings
        </h1>
        <div className="text-xs text-neutral-400">Profile & notifications</div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto scrollbar-hide p-4">
        <Card className="bg-black/50 border-teal-900/40">
          <CardHeader>
            <CardTitle className="text-teal-300">User Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-6">
              <div className="flex items-center">
                <Avatar className="h-16 w-16 ring-2 ring-teal-700/50">
                  <AvatarFallback className="bg-neutral-900 text-neutral-200">{initials}</AvatarFallback>
                </Avatar>
              </div>
              <div className="grid w-full gap-4">
                <div className="grid gap-2">
                  <label htmlFor="fullName" className="text-sm text-neutral-300">
                    Full name
                  </label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-neutral-950 border-neutral-800 focus:border-teal-600"
                    placeholder="Enter your full name"
                  />
                </div>
                {user?.email && (
                  <div className="grid gap-2">
                    <label className="text-sm text-neutral-300">Email</label>
                    <div className="text-sm text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2">
                      {user.email}
                    </div>
                  </div>
                )}
                <div className="grid gap-2">
                  <label htmlFor="bio" className="text-sm text-neutral-300">
                    Bio
                  </label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="min-h-28 bg-neutral-950 border-neutral-800 focus:border-teal-600"
                    placeholder="Tell us a bit about yourself"
                  />
                </div>
                <div className="pt-2">
                  <Button
                    onClick={onSave}
                    disabled={saving}
                    className={cn("bg-teal-600 text-black hover:bg-teal-500", saving && "opacity-80")}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/50 border-teal-900/40" id="notifications">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-teal-300">Notifications</CardTitle>
            <div className="flex items-center gap-3">
              <label htmlFor="notify" className="text-sm text-neutral-300">
                Receive Notifications
              </label>
              <Switch
                id="notify"
                checked={notifEnabled}
                onCheckedChange={setNotifEnabled}
                className="data-[state=checked]:bg-teal-600"
                aria-checked={notifEnabled}
                aria-label="Receive Notifications"
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-400">
              Toggle to receive system alerts and updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
