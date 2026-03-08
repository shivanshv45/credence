//group-gate.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-context";
import { Copy, Users, Building2, Plus, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type InviteMember = { email: string; role: string };
const ROLES = ["employee", "manager", "admin", "tech-lead", "finance-manager", "intern"];


export default function GroupGate() {
  const { groups, selectGroup, createGroup, addMembers } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  // Add-members modal state
  const [addOpen, setAddOpen] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [members, setMembers] = useState<InviteMember[]>([]);

  // Join group modal state
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Invite code display state
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState("");

  const onCreate = async () => {
    if (!name.trim()) return;
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Group creation failed:', response.status, errorData);
        throw new Error(errorData.error || `Failed to create group (${response.status})`);
      }

      const groupData = await response.json();
      setCreatedGroupId(groupData.id);
      setGeneratedInviteCode(groupData.invite_code || '');
      setName("");
      setOpen(false);
      if (groupData.invite_code) {
        setShowInviteCode(true);
      } else {
        // If no invite code, just select the group
        selectGroup(groupData.id);
      }
    } catch (error) {
      console.error("Failed to create group:", error);
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive"
      });
      setOpen(false);
    }
  };

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v) return;
    setMembers((prev) => [...prev, { email: v, role: "employee" }]);
    setEmailInput("");
  };

  const removeMember = (idx: number) =>
    setMembers((prev) => prev.filter((_, i) => i !== idx));

  const updateMemberRole = (idx: number, role: string) =>
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, role } : m)));

  const finishMembers = async () => {
    if (createdGroupId) {
      if (members.length > 0) {
        await addMembers(createdGroupId, members);
      }
      selectGroup(createdGroupId); // ✅ only select here
    }
    setMembers([]);
    setEmailInput("");
    setCreatedGroupId(null);
    setAddOpen(false);
  };

  const skipMembers = () => {
    if (createdGroupId) selectGroup(createdGroupId); // ✅ only select here
    setMembers([]);
    setEmailInput("");
    setCreatedGroupId(null);
    setAddOpen(false);
  };

  const joinGroup = async () => {
    if (!inviteCode.trim()) return;

    setJoining(true);
    try {
      const response = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ invite_code: inviteCode.trim() })
      });

      if (!response.ok) {
        let errorData: { error?: string } = {};
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.warn('Failed to parse error response as JSON:', parseError);
        }
        console.error('Join group failed:', response.status, errorData);
        throw new Error(errorData.error || `Failed to join group (${response.status})`);
      }

      const data = await response.json();
      toast({
        title: "Success",
        description: data.message,
      });

      setInviteCode("");
      setJoinOpen(false);

      // Refresh groups list
      window.location.reload();
    } catch (error) {
      console.error("Failed to join group:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to join group";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setJoining(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(generatedInviteCode);
    toast({
      title: "Copied",
      description: "Invite code copied to clipboard",
    });
  };

  const closeInviteCode = () => {
    setShowInviteCode(false);
    setGeneratedInviteCode("");
    if (createdGroupId) {
      selectGroup(createdGroupId);
    }
  };

  return (
    <section
      aria-labelledby="groups-title"
      className="relative flex h-[calc(100vh-120px)] flex-col rounded-lg border border-neutral-800 bg-gradient-to-br from-neutral-950/50 to-neutral-900/30 backdrop-blur-sm"
    >
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <Building2 className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 id="groups-title" className="text-lg font-semibold text-white">
              Your Groups
            </h1>
            <p className="text-sm text-neutral-400">Manage your team workspaces</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setJoinOpen(true)}
            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400/70 transition-all duration-200"
          >
            <Users className="w-4 h-4 mr-2" />
            Join Group
          </Button>
          <Button
            onClick={() => setOpen(true)}
            className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg hover:shadow-teal-500/25 transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Group
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide rounded-lg border border-neutral-800 bg-gradient-to-br from-neutral-950 to-neutral-900 p-6">
          {groups.length === 0 ? (
            <div className="grid h-full place-items-center">
              <div className="text-center max-w-md">
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-teal-500/20 to-teal-600/20 flex items-center justify-center mb-4">
                  <Building2 className="w-8 h-8 text-teal-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No groups yet</h3>
                <p className="text-neutral-400 mb-6">Create your first group to start collaborating with your team</p>
                <Button
                  className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg hover:shadow-teal-500/25 transition-all duration-200"
                  onClick={() => setOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create your first group
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="group rounded-xl border border-neutral-700 bg-gradient-to-br from-neutral-900/50 to-neutral-800/30 p-6 hover:border-teal-500/50 hover:bg-gradient-to-br hover:from-teal-900/10 hover:to-teal-800/5 transition-all duration-300 cursor-pointer"
                  onClick={() => selectGroup(g.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 group-hover:bg-teal-500/20 transition-colors duration-200">
                      <Building2 className="w-5 h-5 text-teal-400" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-teal-400 transition-colors duration-200" />
                  </div>
                  <h3 className="font-semibold text-white text-lg mb-2 group-hover:text-teal-100 transition-colors duration-200">{g.name}</h3>
                  <p className="text-sm text-neutral-400 mb-4">Click to open this workspace</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Active workspace</span>
                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create group dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="sr-only">Open create group</DialogTrigger>
        <DialogContent className="border-white/10 bg-black/90 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Create a Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm text-neutral-400">Group Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Finance Team"
              className="border-white/10 bg-black/60"
            />
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button
                variant="outline"
                className="border-white/10 bg-transparent"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              onClick={onCreate}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add members dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger className="sr-only">Add members</DialogTrigger>
        <DialogContent className="border-white/10 bg-black/90 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Add members (optional)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-neutral-400">Invite by email</label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 border-white/10 bg-black/60"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEmail}
                  className="border-teal-500/40 text-teal-300 hover:bg-teal-500/10 bg-transparent"
                >
                  Add
                </Button>
              </div>
            </div>

            {members.length > 0 && (
              <ul className="max-h-40 overflow-y-auto scrollbar-hide rounded border border-white/10 bg-neutral-950 p-2 text-sm">
                {members.map((m, i) => (
                  <li
                    key={`${m.email}-${i}`}
                    className="flex items-center justify-between gap-3 rounded px-2 py-1"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-200">{m.email}</span>
                      <select
                        value={m.role}
                        onChange={(e) => updateMemberRole(i, e.target.value)}
                        className="rounded border bg-black/60 px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-neutral-400 hover:text-red-300"
                      onClick={() => removeMember(i)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-white/10 bg-transparent"
              onClick={skipMembers}
            >
              Skip for now
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              onClick={finishMembers}
            >
              Save & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join group dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogTrigger className="sr-only">Join group</DialogTrigger>
        <DialogContent className="border-white/10 bg-black/90 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Join a Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm text-neutral-400">Invite Code</label>
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code (e.g., ABC12345)"
              className="border-white/10 bg-black/60"
            />
            <p className="text-xs text-neutral-500">
              Ask a group admin for the invite code to join their group.
            </p>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <p className="text-xs text-blue-400">
                <strong>Note:</strong> Invite code feature requires database migration. If you get an error, please run the migration first.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button
                variant="outline"
                className="border-white/10 bg-transparent"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="bg-blue-600 hover:bg-blue-500"
              onClick={joinGroup}
              disabled={joining || !inviteCode.trim()}
            >
              {joining ? "Joining..." : "Join Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite code display dialog */}
      <Dialog open={showInviteCode} onOpenChange={setShowInviteCode}>
        <DialogTrigger className="sr-only">Show invite code</DialogTrigger>
        <DialogContent className="border-white/10 bg-black/90 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Group Created Successfully!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {generatedInviteCode ? (
              <>
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <p className="text-sm text-green-400 mb-2">Share this invite code with others:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-black/60 px-3 py-2 text-lg font-mono text-white">
                      {generatedInviteCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyInviteCode}
                      className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  Anyone with this code can join your group. Keep it secure and only share with trusted members.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                <p className="text-sm text-yellow-400 mb-2">Group created successfully!</p>
                <p className="text-xs text-neutral-500">
                  Note: Invite code feature requires database migration. Please run the migration to enable invite codes.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              onClick={closeInviteCode}
            >
              Continue to Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
