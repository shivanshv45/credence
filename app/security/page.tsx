"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Shield, KeyRound, Fingerprint, History, Check, X, LinkIcon } from "lucide-react"
import { useAuth } from "@/components/auth-context"

type AuditEntry = {
  id: string
  action: string
  user: string
  ts: string
}

type AccessGroup = {
  id: string
  name: string
  role: string
}

export default function SecurityPage() {
  const { user, userRole } = useAuth()
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [accessGroups, setAccessGroups] = useState<AccessGroup[]>([])
  const [loadingAudit, setLoadingAudit] = useState(true)
  const [loadingAccess, setLoadingAccess] = useState(true)
  const [permissions, setPermissions] = useState<string[]>([])

  useEffect(() => {
    fetchAuditLogs()
    fetchAccessInfo()
    fetchPermissions()
  }, [])

  async function fetchAuditLogs() {
    try {
      setLoadingAudit(true)
      const res = await fetch('/api/security/audit', { credentials: 'include' })
      if (!res.ok) {
        setAuditLogs([])
        return
      }
      const data = await res.json()
      const rows = Array.isArray(data.data) ? data.data : []
      setAuditLogs(rows.map((r: any) => ({
        id: r.id,
        action: r.event_type || r.action || 'Activity',
        user: r.user_name || r.user_id?.slice(0, 8) || 'System',
        ts: r.created_at ? new Date(r.created_at).toLocaleString() : '',
      })))
    } catch {
      setAuditLogs([])
    } finally {
      setLoadingAudit(false)
    }
  }

  async function fetchAccessInfo() {
    try {
      setLoadingAccess(true)
      const res = await fetch('/api/security/access', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setAccessGroups(Array.isArray(data.data) ? data.data : [])
    } catch {
      setAccessGroups([])
    } finally {
      setLoadingAccess(false)
    }
  }

  async function fetchPermissions() {
    try {
      const res = await fetch('/api/security/access', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      const groups = Array.isArray(data.data) ? data.data : []
      // Get the role from the first group to show permissions
      if (groups.length > 0) {
        const role = groups[0].role
        const permMap: Record<string, string[]> = {
          admin: ['finance_data:read', 'finance_data:write', 'user_management:read', 'user_management:write', 'task_assignment:create', 'task_assignment:read', 'task_assignment:update', 'notes:create', 'notes:read', 'notes:share', 'notes:delete', 'calendar:read', 'calendar:write', 'files:read', 'files:write', 'admin:permissions', 'admin:system'],
          manager: ['finance_data:read', 'user_management:read', 'task_assignment:create', 'task_assignment:read', 'task_assignment:update', 'notes:create', 'notes:read', 'notes:share', 'calendar:read', 'calendar:write', 'files:read'],
          'tech-lead': ['user_management:read', 'task_assignment:create', 'task_assignment:read', 'task_assignment:update', 'notes:create', 'notes:read', 'notes:share', 'calendar:read', 'calendar:write', 'files:read'],
          'finance-manager': ['finance_data:read', 'finance_data:write', 'task_assignment:create', 'task_assignment:read', 'task_assignment:update', 'notes:create', 'notes:read', 'notes:share', 'calendar:read', 'calendar:write', 'files:read'],
          employee: ['task_assignment:read', 'notes:create', 'notes:read', 'calendar:read'],
          intern: ['task_assignment:read', 'notes:create', 'notes:read', 'calendar:read'],
          viewer: ['task_assignment:read', 'notes:read', 'calendar:read'],
        }
        setPermissions(permMap[role] || permMap['employee'] || [])
      }
    } catch {
      setPermissions([])
    }
  }

  const displayRole = userRole || accessGroups[0]?.role || 'member'

  return (
    <main className="h-full w-full overflow-hidden">
      <div className="h-full flex flex-col gap-6 p-6 overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-balance">Security</h1>
          <Badge variant="outline" className="border-teal-500 text-teal-400">
            Secure
          </Badge>
        </div>

        {/* Authentication */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-teal-400" />
              Authentication
            </CardTitle>
            <Badge className="bg-green-600/30 text-green-300 border border-green-600/40">2FA Enabled</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-md border border-border/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-teal-400" />
                    <span className="font-medium">Two-Factor Auth (TOTP)</span>
                  </div>
                  <Button variant="outline" size="sm">
                    Set Up 2FA
                  </Button>
                </div>
                <Separator className="my-3" />
                <div className="flex items-center gap-4">
                  <div className="h-24 w-24 rounded-md bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">
                    QR CODE
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Scan with your authenticator app and enter the 6-digit code.
                    </div>
                    <div className="flex items-center gap-2">
                      <Input placeholder="Enter 6-digit code" className="max-w-[180px]" />
                      <Button size="sm">Verify</Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-teal-400" />
                    <span className="font-medium">Session Info</span>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>Signed in as <span className="text-white font-medium">{user?.name || user?.email || 'User'}</span></div>
                  {user?.email && <div className="text-xs">{user.email}</div>}
                  <div className="text-xs">Provider: Descope SSO</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access & Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-teal-400" />
              Access &amp; Permissions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-md border border-border/40 p-4">
                <div className="text-sm text-muted-foreground mb-1">Role</div>
                <div className="text-base font-medium capitalize">{displayRole.replace('-', ' ')}</div>
              </div>
              <div className="rounded-md border border-border/40 p-4 md:col-span-2">
                <div className="text-sm text-muted-foreground mb-2">Permissions</div>
                {permissions.length > 0 ? (
                  <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {permissions.map(perm => (
                      <li key={perm} className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-2">
                        <span className="text-xs">{perm}</span>
                        <Badge variant="outline" className="border-teal-500 text-teal-400 text-[10px]">
                          granted
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading permissions...</p>
                )}
              </div>
            </div>

            {/* Group memberships */}
            <div className="rounded-md border border-border/40">
              <div className="flex items-center justify-between p-4">
                <div className="font-medium">Group Memberships</div>
                <Badge variant="outline">{accessGroups.length} group(s)</Badge>
              </div>
              <Separator />
              <div className="max-h-64 overflow-y-auto scrollbar-hide divide-y divide-border/40">
                {loadingAccess && (
                  <div className="p-4 text-sm text-muted-foreground">Loading...</div>
                )}
                {!loadingAccess && accessGroups.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No group memberships found.</div>
                )}
                {accessGroups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between p-4">
                    <div className="text-sm font-medium">{g.name}</div>
                    <Badge variant="outline" className="capitalize">{g.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-teal-400" />
              Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-y-auto scrollbar-hide divide-y divide-border/40">
              {/* Current session entry */}
              <div className="flex items-center justify-between py-3 bg-teal-500/10 border-l-4 border-teal-500 pl-3 -ml-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-teal-500/20 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-teal-300">Session active</div>
                    <div className="text-xs text-teal-400">
                      {user?.name || user?.email || 'Current User'} &bull; {new Date().toLocaleString()}
                    </div>
                  </div>
                </div>
                <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30">Active</Badge>
              </div>

              {loadingAudit && (
                <div className="py-4 text-sm text-muted-foreground text-center">Loading audit logs...</div>
              )}

              {!loadingAudit && auditLogs.length === 0 && (
                <div className="py-4 text-sm text-muted-foreground text-center">No audit entries yet.</div>
              )}

              {auditLogs.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-6 w-6 rounded-full bg-muted/30 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{item.action}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.user} &bull; {item.ts}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">OK</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
