// components/chat/chat-view.tsx
"use client";

import { ChatMessage, ToolOutput, TypingIndicator } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { MembersManagement } from "@/components/groups/members-management"
import { GroupAdminPanel } from "@/components/groups/group-admin-panel";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Copy, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type Msg = {
    kind: "msg";
    role: "user" | "assistant";
    content: string;
    isCommand?: boolean;
    requiresPermission?: string;
} | {
    kind: "tool";
    title: string;
    body: string;
};

export function ChatView() {
    const { loggedIn, selectedGroup, selectGroup } = useAuth();
    const [messages, setMessages] = useState<Msg[]>([]);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [typing, setTyping] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('member');
    const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadForm, setUploadForm] = useState({ title: "", description: "", file: null as File | null });
    const [files, setFiles] = useState<Array<{ id: string; file_name: string; mime_type: string | null; size_bytes: number | null; storage_url: string; created_at: string }>>([]);

    // Fetch invite code and user role when group changes
    useEffect(() => {
        if (selectedGroup?.id) {
            fetchGroupDetails();
            fetchGroupFiles();
        }
    }, [selectedGroup]);

    async function fetchGroupFiles() {
        if (!selectedGroup?.id) return;
        try {
            const res = await fetch(`/api/groups/${selectedGroup.id}/files?limit=20`, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            setFiles(Array.isArray(data.data) ? data.data : []);
        } catch (e) {
            console.error('Failed to load files', e);
        }
    }

    async function submitUploadForm() {
        const hasInline = !!uploadForm.description && uploadForm.description.trim().length > 0;
        if (!selectedGroup?.id || !uploadForm.title || (!uploadForm.file && !hasInline)) return;
        try {
            setIsUploading(true);
            const form = new FormData();
            if (uploadForm.file) {
                form.append('file', uploadForm.file);
            }
            form.append('title', uploadForm.title);
            form.append('description', uploadForm.description);
            form.append('group_id', selectedGroup.id);
            const res = await fetch(`/api/files/upload`, {
                method: 'POST',
                body: form,
                credentials: 'include'
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Upload failed');
            }
            toast({ title: 'Uploaded', description: 'File uploaded successfully.' });
            setUploadOpen(false);
            setUploadForm({ title: "", description: "", file: null });
        } catch (error) {
            console.error('Upload error:', error);
            toast({ title: 'Error', description: error instanceof Error ? error.message : 'Upload failed', variant: 'destructive' });
        } finally {
            setIsUploading(false);
        }
    }

    const fetchGroupDetails = async () => {
        if (!selectedGroup?.id) return;

        try {
            // Fetch invite code
            const groupResponse = await fetch(`/api/groups/${selectedGroup.id}`, {
                credentials: 'include'
            });
            if (groupResponse.ok) {
                const groupData = await groupResponse.json();
                setInviteCode(groupData.invite_code);
            }

            // Fetch user role in this group
            const membersResponse = await fetch(`/api/groups/${selectedGroup.id}/members`, {
                credentials: 'include'
            });
            if (membersResponse.ok) {
                const membersData = await membersResponse.json();
                // The API returns { role: "...", groupName: "..." }
                if (membersData.role) {
                    setUserRole(membersData.role);
                }
            }
        } catch (error) {
            console.error('Failed to fetch group details:', error);
        }
    };

    const copyInviteCode = () => {
        if (inviteCode) {
            navigator.clipboard.writeText(inviteCode);
            toast({
                title: "Copied",
                description: "Invite code copied to clipboard",
            });
        }
    };

    
    useEffect(() => {
        setMessages([
            {
                kind: "msg",
                role: "assistant",
                content: `MCP Agent online. How can I assist you in ${selectedGroup?.name || "this group"}?`,
            },
            {
                kind: "tool",
                title: "Welcome to CREDENCE",
                body: "Hey! I'm CREDENCE, your AI agent who can help you with task management, document analysis, calendar scheduling, note-taking, and much more. I'm here to streamline your workflow and boost your team's productivity. What would you like to work on today?",
            },
        ]);
    }, [selectedGroup?.id]); // run when group changes

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [messages.length, typing]);

    async function addUserText(text: string) {
        setMessages((prev) => [...prev, { kind: "msg", role: "user", content: text }]);

        if (!selectedGroup?.id) {
            setMessages((prev) => [...prev, {
                kind: "msg",
                role: "assistant",
                content: "Please select or create a group from the sidebar to chat with me!"
            }]);
            return;
        }

        setTyping(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    message: text,
                    groupId: selectedGroup?.id
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Chat API error:', response.status, errorData);
                throw new Error(`Failed to send message: ${errorData.error || response.statusText}`);
            }

            const data = await response.json();

            setMessages((prev) => [...prev, {
                kind: "msg",
                role: "assistant",
                content: data.response,
                isCommand: data.isCommand,
                requiresPermission: data.requiresPermission
            }]);
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setMessages((prev) => [...prev, {
                kind: "msg",
                role: "assistant",
                content: `Sorry, I encountered an error: ${errorMessage}. Please check the console for more details.`
            }]);
        } finally {
            setTyping(false);
        }
    }

    return (
        <section
            aria-labelledby="chat-title"
            className="relative flex h-[calc(100vh-120px)] flex-col rounded-md border border-neutral-800 bg-neutral-950/50"
        >
            <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <div className="flex items-center gap-4">
                    <h1 id="chat-title" className="text-pretty text-sm font-semibold">
                        {selectedGroup?.name || "Current Group"}
                    </h1>
                    {inviteCode && (
                        <div className="flex items-center gap-2">
                            <code className="rounded bg-neutral-800 px-2 py-1 text-xs font-mono text-neutral-300">
                                {inviteCode}
                            </code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={copyInviteCode}
                                className="h-6 w-6 p-0 text-neutral-400 hover:text-white"
                            >
                                <Copy className="w-3 h-3" />
                            </Button>
                        </div>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectGroup(null)}
                        className="border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800 bg-transparent"
                    >
                        Switch Group
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <MembersManagement
                        groupId={selectedGroup?.id || ''}
                        isAdmin={userRole === 'admin'}
                    />
                    {/* Upload button for group members */}
                    {selectedGroup?.id && (
                        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-xs" disabled={isUploading}>
                                    <Upload className="h-3 w-3 mr-1" /> {isUploading ? 'Uploading...' : 'Upload'}
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Upload File</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3">
                                    <Input placeholder="Title" value={uploadForm.title} onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))} />
                                    <Textarea placeholder="Description" value={uploadForm.description} onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))} rows={3} />
                                    <Input type="file" onChange={(e) => setUploadForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))} />
                                    <div className="flex justify-end">
                                        <Button onClick={submitUploadForm} disabled={!uploadForm.title || (!uploadForm.file && !(uploadForm.description && uploadForm.description.trim().length > 0)) || isUploading}>Submit</Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}
                    {userRole === 'admin' && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setIsAdminPanelOpen((v) => !v)}
                        >
                            Admin
                        </Button>
                    )}
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-teal-500" aria-hidden="true" />
                        Online
                    </div>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
                {/* Minimal group files list */}
                {selectedGroup?.id && files.length > 0 && (
                    <div className="rounded border border-neutral-900 bg-black p-3">
                        <div className="text-xs font-medium mb-2 text-neutral-300">Group Files</div>
                        <ul className="space-y-1 text-xs text-neutral-400">
                            {files.map(f => (
                                <li key={f.id} className="flex items-center justify-between">
                                    <span className="truncate mr-2">{f.file_name}</span>
                                    <span className="text-neutral-500">{f.mime_type || 'file'}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {/* Group Admin Panel - Only show for admins */}
                {userRole === 'admin' && (
                    <div className="mb-4">
                        <GroupAdminPanel
                            groupId={selectedGroup?.id || ''}
                            isAdmin={userRole === 'admin'}
                            isOpen={isAdminPanelOpen}
                            onToggle={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                        />
                    </div>
                )}

                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide rounded-md border border-neutral-900 bg-black p-3">
                    <div className="space-y-3">
                        {messages.map((m, i) => {
                            if (m.kind === "msg") return (
                                <ChatMessage
                                    key={i}
                                    role={m.role}
                                    isCommand={m.isCommand}
                                    requiresPermission={m.requiresPermission}
                                >
                                    {m.content}
                                </ChatMessage>
                            );
                            if (m.kind === "tool") return <ToolOutput key={i} title={m.title}>{m.body}</ToolOutput>;
                            return null;
                        })}
                        {loggedIn && typing ? <TypingIndicator className="mt-1" /> : null}
                    </div>
                </div>
                <div className={!loggedIn || !selectedGroup?.id ? "pointer-events-none opacity-70 [filter:blur(1.5px)]" : ""}>
                    <ChatInput onSend={addUserText} />
                </div>
            </div>
        </section>
    );
}
