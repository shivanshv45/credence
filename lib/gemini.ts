// lib/gemini.ts
import { GoogleGenAI, Type } from "@google/genai";

class GeminiKeyManager {
  private keys: string[];
  public currentIndex = 0;

  constructor() {
    this.keys = this.loadKeys();
  }

  private loadKeys(): string[] {
    const keys: string[] = [];
    let i = 1;
    while (true) {
      const key = process.env[`GEMINI_API_KEY_${i}`];
      if (!key) break;
      keys.push(key);
      i++;
    }
    const baseKey = process.env.GEMINI_API_KEY;
    if (baseKey) keys.push(baseKey);

    // Always provide a fallback string if undefined
    if (keys.length === 0) {
      console.warn("No GEMINI_API_KEY found in environment!");
      keys.push("apikey");
    }

    const uniqueKeys = Array.from(new Set(keys));
    console.log(`[DEBUG] Loaded ${uniqueKeys.length} unique Gemini API keys`);
    return uniqueKeys;
  }

  public getNextKey(): string {
    if (!this.keys.length) throw new Error("No API keys available");
    const key = this.keys[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    return key;
  }

  public async executeWithRetry<T>(func: (client: GoogleGenAI) => Promise<T>): Promise<T> {
    let lastError: any = null;
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.getNextKey();
      try {
        const client = new GoogleGenAI({ apiKey: key });
        return await func(client);
      } catch (e: any) {
        const errStr = String(e?.message || e);
        if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
          console.warn(`[WARNING] Quota exhausted for key ending in ...${key.slice(-4)}, trying next key`);
          lastError = e;
          continue;
        } else {
          throw e;
        }
      }
    }
    throw new Error(`All API keys exhausted. Last error: ${lastError}`);
  }
}

const keyManager = new GeminiKeyManager();

const baseClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "apikey" }); // Keep base fallback

export interface UserPermissions {
  role: string;
  permissions: string[];
  groupPermissions?: string[];
  customPermissionText?: string;
}

export interface ChatContext {
  groupId: string;
  groupName: string;
  userPermissions: UserPermissions;
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  tasks?: Array<{
    title: string;
    dueDate: string | null;
    groupName: string;
    status: string;
  }>;
  files?: Array<{
    file_name: string;
    mime_type: string | null;
    created_at: string;
  }>;
  ragSnippets?: Array<{
    fileName: string;
    snippet: string;
  }>;
  ragFileUris?: Array<{
    fileName: string;
    uri: string;
    mimeType: string;
  }>;
}

export interface TaskAssignment {
  title: string;
  description: string;
  assignedTo: string[];
  assignToAllMembers?: boolean;
  assignToRole?: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  groupId: string;
}

const chatResponseSchema = {
  type: Type.OBJECT,
  properties: {
    response: {
      type: Type.STRING,
      description: "The casual, natural language response to the user. Address the user directly and confirm actions clearly. Use markdown formatting nicely."
    },
    isCommand: {
      type: Type.BOOLEAN,
      description: "Set to true ONLY if the user is asking to assign a task."
    },
    isAccessRequest: {
      type: Type.BOOLEAN,
      description: "Set to true ONLY if the user is requesting access/permission to a file or data they do not currently have access to.",
    },
    accessRequestTarget: {
      type: Type.STRING,
      description: "The name of the file or data the user is requesting access to. (Used only if isAccessRequest is true)",
      nullable: true
    },
    requiresPermission: {
      type: Type.STRING,
      description: "If permission is denied, specify which one.",
      nullable: true
    },
    taskAssignment: {
      type: Type.OBJECT,
      description: "If isCommand is true, provide the task details here.",
      nullable: true,
      properties: {
        title: { type: Type.STRING, description: "Short title of the task" },
        description: { type: Type.STRING, description: "Task description, default to 'Task assigned via chat' if none provided." },
        assignedTo: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific usernames or emails mentioned." },
        assignToRole: { type: Type.STRING, nullable: true, description: "If assigned to a role like 'manager', 'member', 'admin'." },
        assignToAllMembers: { type: Type.BOOLEAN, description: "True if task assigned to everyone/all members." },
        dueDate: { type: Type.STRING, nullable: true, description: "ISO date string if a deadline is mentioned." },
        priority: { type: Type.STRING, description: "low, medium, or high." },
        groupId: { type: Type.STRING }
      }
    }
  },
  required: ["response", "isCommand"]
};

export class GeminiService {
  async generateChatResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<{
    response: string;
    isCommand: boolean;
    isAccessRequest?: boolean;
    accessRequestTarget?: string;
    taskAssignment?: TaskAssignment;
    requiresPermission?: string;
  }> {
    const systemPrompt = this.buildSystemPrompt(context);

    try {
      const combinedPrompt = `${systemPrompt}\n\nUser: ${userMessage}`;

      const configObj = {
        responseMimeType: "application/json",
        responseSchema: chatResponseSchema,
        temperature: 0.8,
      };

      const executeFn = async (client: GoogleGenAI) => {
        let parts: any[] = [{ text: combinedPrompt }];
        if (context.ragFileUris && context.ragFileUris.length > 0) {
          for (const f of context.ragFileUris.slice(0, 5)) {
            parts.push({ fileData: { fileUri: f.uri, mimeType: f.mimeType } });
          }
        }

        try {
          console.log("[DEBUG] Attempting generation with gemini-2.5-flash...");
          const res = await client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts }],
            config: configObj
          });
          if (!res.text) throw new Error("Empty response from gemini-2.5-flash");
          return res.text;
        } catch (e: any) {
          console.warn("[WARNING] gemini-2.5-flash failed: " + String(e));
          console.log("[DEBUG] Falling back to gemini-2.5-pro...");
          const res = await client.models.generateContent({
            model: "gemini-2.5-pro",
            contents: [{ role: "user", parts }],
            config: configObj
          });
          if (!res.text) throw new Error("Empty response from gemini-2.5-pro");
          return res.text;
        }
      };

      const rawText = await keyManager.executeWithRetry(executeFn);
      const parsed = JSON.parse(rawText || "{}");

      if (parsed.taskAssignment && !parsed.taskAssignment.groupId) {
        parsed.taskAssignment.groupId = context.groupId;
      }
      if (parsed.taskAssignment && !parsed.taskAssignment.priority) {
        parsed.taskAssignment.priority = 'medium';
      }

      return {
        response: parsed.response || "No response.",
        isCommand: parsed.isCommand === true,
        isAccessRequest: parsed.isAccessRequest === true,
        accessRequestTarget: parsed.accessRequestTarget || undefined,
        taskAssignment: parsed.taskAssignment,
        requiresPermission: parsed.requiresPermission || undefined
      };

    } catch (error: any) {
      console.error("Gemini API error:", error?.message || error);
      return {
        response: "I'm sorry, I'm having trouble connecting to the AI service. Please try again later.",
        isCommand: false,
      };
    }
  }

  private buildSystemPrompt(context: ChatContext): string {
    const permissionsList = context.userPermissions.permissions.join(", ");
    const groupPermissionsList = context.userPermissions.groupPermissions?.join(", ") || "";

    let prompt = `You are a highly capable AI assistant for the Credence MCP platform. You chat smoothly with users and manage tasks based on intentions.
USER CONTEXT:
- Current Group ID: ${context.groupId}
- Current Group: ${context.groupName}
- User Role: ${context.userPermissions.role}
- User Permissions: ${permissionsList}`;

    if (groupPermissionsList) {
      prompt += `\n- Group-Specific Permissions: ${groupPermissionsList}`;
    }

    if (context.userPermissions.customPermissionText) {
      prompt += `\n\nHIGH PRIORITY - CUSTOM GROUP PERMISSIONS:\n${context.userPermissions.customPermissionText}`;
    }

    prompt += `\n\nROLE HIERARCHY (highest to lowest privilege):
1. admin — full system access, can manage permissions, users, files, tasks, notes, calendar
2. manager — can manage tasks, read finance data, share notes, read/write calendar, access files
3. tech-lead — similar to manager but no finance access; can manage tasks, notes, calendar, files
4. finance-manager — finance read/write, task management, notes, calendar, file access
5. employee — basic access: read tasks, create/read notes, view calendar
6. intern — same as employee but intended for temporary/limited scope
7. viewer — read-only: can only view tasks, notes, and calendar

PERMISSION RULES:
- If a user asks to do something they don't have permission for, deny it gracefully and set requiresPermission to the missing permission.
- IF A USER ASKS FOR FILE/DATA ACCESS THEY DO NOT HAVE: Offer to request access on their behalf. Set "isAccessRequest" to true and populate "accessRequestTarget" with the exact file or data they need. This creates a task for group admins to review.
- When the user lacks a permission, mention which role they would need (e.g., "You would need at least a manager role to do this").
- You output valid JSON following the schema perfectly. Set "isCommand" to true if you are asked to assign a task.
- Populate the task details correctly if instructed.
`;

    if (context.tasks && context.tasks.length > 0) {
      prompt += `\n\nTASKS SNAPSHOT:\n` + context.tasks.slice(0, 10).map(t => `- [${t.status}] ${t.title}`).join("\n");
    }

    if (context.files && context.files.length > 0) {
      prompt += `\n\nGROUP FILES SNAPSHOT:\n` + context.files.slice(0, 5).map(f => `- ${f.file_name}`).join("\n");
    }

    if (context.ragSnippets && context.ragSnippets.length > 0) {
      prompt += `\n\nFILE CONTEXT (Use this to answer file-related queries directly):\n` +
        context.ragSnippets.slice(0, 5).map(s => `--- FILE: ${s.fileName}\n${s.snippet}`).join("\n\n");
    }

    return prompt;
  }

  async uploadFileToGemini(params: {
    data: Buffer;
    mimeType: string;
    displayName: string;
  }): Promise<{ uri: string; mimeType: string; fileName: string }> {
    // Utilize the baseClient for simple storage uploads, or fallback through keyManager manually
    // We'll just use executeWithRetry for robust uploads
    const executeUpload = async (client: GoogleGenAI) => {
      const uploaded = await client.files.upload({
        file: { data: params.data, mimeType: params.mimeType, displayName: params.displayName }
      } as any);
      return uploaded;
    };

    try {
      const uploaded = await keyManager.executeWithRetry(executeUpload);
      const uri = (uploaded as any)?.file?.uri ?? (uploaded as any)?.uri ?? '';
      if (!uri) throw new Error('Failed to upload file to Gemini');
      return { uri, mimeType: params.mimeType, fileName: params.displayName };
    } catch (e) {
      throw e;
    }
  }

  async generateNotesSummary(
    notes: Array<{ title: string; content: string; author: string }>
  ): Promise<string> {
    const prompt = `Summarize these notes in a helpful way:\n\n${notes.map(n => `Title: ${n.title}\nAuthor: ${n.author}\nContent: ${n.content}\n---`).join("\n")}`;

    const executeSummary = async (client: GoogleGenAI) => {
      const result = await client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
      return result.text ?? "".replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
    };

    try {
      return await keyManager.executeWithRetry(executeSummary);
    } catch (error) {
      console.error("Gemini API error:", error);
      return "Unable to generate summary at this time.";
    }
  }

  async summarizeLongText(rawText: string, options?: { title?: string; targetTokens?: number }): Promise<string> {
    const title = options?.title || "Document";
    const truncated = rawText.slice(0, 220 * 1024);
    const prompt = `You are given a document titled "${title}". Produce a concise summary capturing key items, limit 15 bullet points.\n\nDOCUMENT:\n${truncated}`;

    const executeLongText = async (client: GoogleGenAI) => {
      const result = await client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
      return (result.text || "").trim();
    };

    try {
      return await keyManager.executeWithRetry(executeLongText);
    } catch (e) {
      return "";
    }
  }
}

export const geminiService = new GeminiService();
