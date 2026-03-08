// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { session } from '@descope/nextjs-sdk/server';
import { neon } from '@neondatabase/serverless';
import { geminiService, ChatContext } from '@/lib/gemini';
import { supabaseAdmin, GROUP_FILES_BUCKET } from '@/lib/supabase';
import { rbacService } from '@/lib/rbac';
import { tasksService } from '@/lib/tasks';
// Heavy parsers are dynamically imported only when needed

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  const sessionInfo = await session();

  if (!sessionInfo?.token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { message, groupId } = await request.json();

    if (!message || !groupId) {
      return NextResponse.json({ error: 'Message and groupId are required' }, { status: 400 });
    }

    // Get user ID from database
    const users = await sql`
      SELECT id FROM users WHERE descope_user_id = ${sessionInfo.token.sub}
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    const effectiveRole = await rbacService.getEffectiveRole(userId, groupId);

    const effectivePermissions = await rbacService.getEffectivePermissions(userId, groupId);
    const groupPermissions = await rbacService.getUserGroupPermissions(userId, groupId);

    const combinedPermissions = {
      ...effectivePermissions,
      groupPermissions: groupPermissions.groupPermissions,
      customPermissionText: groupPermissions.customPermissionText
    };

    const canAccessFiles = await rbacService.hasPermissionInGroup(userId, groupId, 'files:read');

    // Get group name
    const groups = await sql`
      SELECT name FROM groups WHERE id = ${groupId}
    `;

    if (groups.length === 0) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }


    // Get recent chat messages for context
    let recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    try {
      recentMessages = await sql`
        SELECT 
          CASE 
            WHEN cm.user_id = ${userId} THEN 'user'
            ELSE 'assistant'
          END as role,
          cm.content
        FROM chat_messages cm
        WHERE cm.group_id = ${groupId}
        ORDER BY cm.created_at DESC
        LIMIT 10
      ` as Array<{ role: 'user' | 'assistant'; content: string }>;
    } catch (error) {
      console.warn('Chat messages table not found, using empty context:', error);
      recentMessages = [];
    }

    // Fetch tasks snapshot for context (self by default; admin can see all)
    let tasksForContext: any[] = [];
    try {
      const isAdmin = await rbacService.userHasRole(userId, 'admin');
      tasksForContext = isAdmin ? await tasksService.getAllTasks() : await tasksService.getTasksForUser(userId);
    } catch (e) {
      tasksForContext = [];
    }

    // Fetch uploaded files metadata for context (titles) – gated by permissions
    let filesForContext: any[] = [];
    try {
      if (canAccessFiles) {
        filesForContext = await sql`
          SELECT title as file_name, mime_type, uploaded_at as created_at, is_inline_content
          FROM uploaded_files
          WHERE group_id = ${groupId}
          ORDER BY uploaded_at DESC
          LIMIT 10
        `;
      } else {
        filesForContext = [];
      }
    } catch (e) {
      filesForContext = [];
    }

    // Helpers
    const downloadFile = async (path: string) => {
      console.log('[chat] downloadFile: attempting to download file from path:', path);
      const { data, error } = await supabaseAdmin.storage
        .from(GROUP_FILES_BUCKET)
        .download(path);
      if (error) {
        console.error('[chat] downloadFile: error downloading file:', error);
        return null;
      }
      if (!data) {
        console.error('[chat] downloadFile: no data returned');
        return null;
      }
      console.log('[chat] downloadFile: success, file downloaded');
      return data;
    };

    const uploadFileToGemini = async (fileBlob: Blob, fileName: string, mimeType?: string): Promise<string | null> => {
      try {
        console.log('[chat] uploadFileToGemini: uploading file to Gemini', { fileName, mimeType: mimeType || fileBlob.type });

        // Convert blob to buffer for Gemini API
        const arrayBuffer = await fileBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Use the existing GeminiService uploadFileToGemini method
        const result = await geminiService.uploadFileToGemini({
          data: buffer,
          mimeType: mimeType || fileBlob.type || 'application/octet-stream',
          displayName: fileName
        });

        console.log('[chat] uploadFileToGemini: file uploaded successfully', { uri: result.uri });
        return result.uri;
      } catch (error) {
        console.error('[chat] uploadFileToGemini: error uploading to Gemini:', error);
        return null;
      }
    };

    const chunkText = (text: string, maxBytes = 200 * 1024) => {
      const chunks: string[] = [];
      let start = 0;
      while (start < text.length && chunks.length < 5) {
        const end = Math.min(start + maxBytes, text.length);
        chunks.push(text.slice(start, end));
        start = end;
      }
      return chunks;
    };

    const extractText = async (fileBlob: Blob, fallbackPath: string) => {
      console.log('[chat] extractText: processing file blob, size:', fileBlob.size);

      const lowerPath = (fallbackPath || '').toLowerCase();
      const contentType = fileBlob.type || '';

      try {
        // Text files (including JSON)
        if (contentType.startsWith('text/') || contentType.startsWith('application/json') ||
          lowerPath.endsWith('.txt') || lowerPath.endsWith('.json') || lowerPath.endsWith('.md')) {
          console.log('[chat] extractText: processing as text file');
          const text = await fileBlob.text();
          return text;
        }

        // PDF
        if (contentType === 'application/pdf' || lowerPath.endsWith('.pdf')) {
          console.log('[chat] extractText: processing as PDF');
          const arrayBuffer = await fileBlob.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const { default: pdfParse } = await import('pdf-parse');
          const result = await pdfParse(buf as any);
          return result.text || null;
        }

        // DOCX
        if (contentType.includes('officedocument.wordprocessingml.document') || lowerPath.endsWith('.docx')) {
          console.log('[chat] extractText: processing as DOCX');
          const arrayBuffer = await fileBlob.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const mammoth = await import('mammoth');
          const { value } = await mammoth.extractRawText({ buffer: buf });
          return value || null;
        }

        // XLS/XLSX/CSV
        if (
          contentType.includes('spreadsheetml') ||
          contentType === 'application/vnd.ms-excel' ||
          lowerPath.endsWith('.xlsx') ||
          lowerPath.endsWith('.xls') ||
          lowerPath.endsWith('.csv')
        ) {
          console.log('[chat] extractText: processing as spreadsheet');
          const arrayBuffer = await fileBlob.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const XLSX = await import('xlsx');
          const wb = XLSX.read(buf, { type: 'buffer' } as any);
          const texts: string[] = [];
          for (const sheetName of wb.SheetNames.slice(0, 5)) {
            const ws = wb.Sheets[sheetName];
            if (!ws) continue;
            const csv = XLSX.utils.sheet_to_csv(ws as any);
            texts.push(`# Sheet: ${sheetName}\n${csv}`);
          }
          return texts.join('\n\n');
        }

        // Fallback: try to read as text for unknown types
        console.log('[chat] extractText: trying fallback text extraction');
        const text = await fileBlob.text();
        return text;
      } catch (error) {
        console.error('[chat] extractText: error processing file:', error);
        return null;
      }
    };
    const extractStoragePathFromUrl = (url: string): string => {
      // If it's already a storage path (doesn't start with http), return as-is
      if (!url.startsWith('http')) {
        return url;
      }

      // Extract storage path from signed URL
      // Format: https://xyz.supabase.co/storage/v1/object/sign/bucket-name/path?token=...
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const signIndex = pathParts.indexOf('sign');
        if (signIndex !== -1 && pathParts.length > signIndex + 2) {
          // Skip 'sign' and bucket name, get the rest
          return pathParts.slice(signIndex + 2).join('/');
        }
      } catch (e) {
        console.warn('[chat] Failed to extract storage path from URL:', url);
      }

      // Fallback: return the original URL and hope it works
      return url;
    };


    // Build base context (no automatic RAG). We'll only inject summaries for explicit filename intents below.
    const context: ChatContext = {
      groupId,
      groupName: groups[0].name,
      userPermissions: combinedPermissions,
      recentMessages: recentMessages.reverse(),
      tasks: tasksForContext.map(t => ({ title: t.title, dueDate: t.dueDate || null, groupName: t.groupName, status: t.status })),
      files: filesForContext,
      ragSnippets: []
    };

    // Detect assignment intent keywords and let LLM structure it, instead of processing directly
    const intentAssign = /(\bassign\b|\bschedule\b|\bdelegate\b|\bcreate task\b|\badd task\b)/i.test(message);
    if (intentAssign) {
      // Proceed to LLM with context; it will return COMMAND JSON when confident
    }

    // Handle explicit command: file: <filename> (upload to Gemini and use fileData)
    let finalMessage = message;
    let augmentedContext = { ...context } as ChatContext;
    const fileCmdMatch = /file:\s*("[^"]+"|\S+)/i.exec(message);
    if (fileCmdMatch) {
      if (!canAccessFiles) {
        return NextResponse.json({ response: 'PERMISSION_DENIED: You need files:read and role admin/manager to access group files.', isCommand: false, requiresPermission: 'files:read' });
      }
      const requestedPart = fileCmdMatch[1] || '';
      const requested = requestedPart
        .trim()
        .replace(/^"|"$/g, '')
        .split(/[\s\?\.,;:]/)[0]
        .trim();
      console.log('[chat] file: command detected', { requested });

      // Inline content short-circuit: use content_text if available
      try {
        const inline = await sql`
          SELECT title, content_text FROM uploaded_files
          WHERE group_id = ${groupId} AND is_inline_content = true AND (
            title = ${requested} OR title ILIKE ${'%' + requested + '%'}
          )
          ORDER BY uploaded_at DESC
          LIMIT 1
        ` as { title: string; content_text: string | null }[];
        if (inline.length) {
          const text = (inline[0].content_text || '').toString();
          if (text.trim()) {
            // Provide the inline text as context and proceed to normal answer generation
            const chunks = chunkText(text, 200 * 1024);
            augmentedContext = {
              ...augmentedContext,
              ragSnippets: [...(augmentedContext.ragSnippets || []), ...chunks.map((c, i) => ({ fileName: `${inline[0].title} (inline ${i + 1})`, snippet: c }))]
            };
            finalMessage = message;
            // Skip storage path branch by jumping to response generation below
            const aiResponse = await geminiService.generateChatResponse(finalMessage, augmentedContext);
            return NextResponse.json({
              response: aiResponse.response,
              isCommand: aiResponse.isCommand,
              requiresPermission: aiResponse.requiresPermission
            });
          }
        }
      } catch { }

      // Try with storage_path first, fallback to file_url if column doesn't exist
      let candidates: { title: string; storage_path: string; mime_type?: string }[];
      try {
        candidates = await sql`
          (
            SELECT title, storage_path, mime_type FROM uploaded_files 
            WHERE group_id = ${groupId} AND title = ${requested}
          )
          UNION ALL
          (
            SELECT title, storage_path, mime_type FROM uploaded_files 
            WHERE group_id = ${groupId} AND title ILIKE ${'%' + requested + '%'}
            ORDER BY uploaded_at DESC
            LIMIT 5
          )
        ` as { title: string; storage_path: string; mime_type?: string }[];
      } catch (error) {
        console.log('[chat] storage_path column not found, using file_url fallback');
        const fallbackCandidates = await sql`
    (
      SELECT title, file_url FROM uploaded_files 
      WHERE group_id = ${groupId} AND title = ${requested}
    )
    UNION ALL
    (
      SELECT title, file_url FROM uploaded_files 
      WHERE group_id = ${groupId} AND title ILIKE ${'%' + requested + '%'}
      ORDER BY uploaded_at DESC
      LIMIT 5
    )
  ` as { title: string; file_url: string }[];

        // Convert URLs to storage paths
        candidates = fallbackCandidates.map(f => ({
          title: f.title,
          storage_path: extractStoragePathFromUrl(f.file_url),
          mime_type: 'application/octet-stream'
        }));
      }
      console.log('[chat] file: candidates found', { count: candidates.length });

      if (!candidates.length) {
        return NextResponse.json({ response: `No similar file found for "${requested}". Try "list files".`, isCommand: false });
      }

      const chosen = candidates[0];
      console.log('[chat] file: chosen', { title: chosen.title, path: chosen.storage_path });

      // Download file and upload to Gemini
      const fileBlob = await downloadFile(chosen.storage_path);
      console.log('[chat] file: download result', { success: fileBlob ? 'SUCCESS' : 'FAILED' });
      if (!fileBlob) {
        console.warn('[chat] file: failed to download file');
        return NextResponse.json({ response: 'Failed to access file.', isCommand: false });
      }
      console.log('[chat] file: file downloaded successfully');

      // Upload file to Gemini and get file URI
      try {
        const geminiFileUri = await uploadFileToGemini(fileBlob, chosen.title, chosen.mime_type);
        console.log('[chat] file: uploaded to Gemini', { uri: geminiFileUri });

        if (geminiFileUri) {
          augmentedContext = {
            ...augmentedContext,
            ragFileUris: [...(augmentedContext.ragFileUris || []), {
              fileName: chosen.title,
              uri: geminiFileUri,
              mimeType: chosen.mime_type || fileBlob.type || 'application/octet-stream'
            }]
          };
          finalMessage = message;
        } else {
          // Fallback to text extraction if Gemini upload fails
          const text = await extractText(fileBlob, chosen.storage_path);
          if (text && text.trim()) {
            const summary = await geminiService.summarizeLongText(text, { title: chosen.title });
            augmentedContext = {
              ...augmentedContext,
              ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: summary }]
            };
          } else {
            augmentedContext = {
              ...augmentedContext,
              ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: 'No readable text could be extracted from this file.' }]
            };
          }
          finalMessage = message;
        }
      } catch (error) {
        console.error('[chat] file: error uploading to Gemini, falling back to text extraction:', error);
        // Fallback to text extraction
        const text = await extractText(fileBlob, chosen.storage_path);
        if (text && text.trim()) {
          const summary = await geminiService.summarizeLongText(text, { title: chosen.title });
          augmentedContext = {
            ...augmentedContext,
            ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: summary }]
          };
        } else {
          augmentedContext = {
            ...augmentedContext,
            ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: 'No readable text could be extracted from this file.' }]
          };
        }
        finalMessage = message;
      }
    }

    // Auto-detect filename intent like: summarize "name", read name.pdf, show test_file, etc. (summarize & inject summary)
    if (finalMessage === message) {
      const quoted = /(?:summarize|read|open|show|analy(?:se|ze)|review)\s+"([^"]{1,200})"/i.exec(message);
      const withExt = /\b([\w\- .]{1,160}\.(?:txt|pdf|docx|xlsx|xls|csv|json|md))\b/i.exec(message);
      const candidateName = (quoted?.[1] || withExt?.[1] || '').trim();
      if (candidateName) {
        if (!canAccessFiles) {
          return NextResponse.json({ response: 'PERMISSION_DENIED: You need files:read and role admin/manager to access group files.', isCommand: false, requiresPermission: 'files:read' });
        }
        console.log('[chat] autodetect: candidate name', { candidateName });
        // Inline content short-circuit
        try {
          const inline = await sql`
            SELECT title, content_text FROM uploaded_files
            WHERE group_id = ${groupId} AND is_inline_content = true AND (
              title = ${candidateName} OR title ILIKE ${'%' + candidateName + '%'}
            )
            ORDER BY uploaded_at DESC
            LIMIT 1
          ` as { title: string; content_text: string | null }[];
          if (inline.length) {
            const text = (inline[0].content_text || '').toString();
            if (text.trim()) {
              const chunks = chunkText(text, 200 * 1024);
              augmentedContext = {
                ...augmentedContext,
                ragSnippets: [...(augmentedContext.ragSnippets || []), ...chunks.map((c, i) => ({ fileName: `${inline[0].title} (inline ${i + 1})`, snippet: c }))]
              };
              finalMessage = message;
              const aiResponse = await geminiService.generateChatResponse(finalMessage, augmentedContext);
              return NextResponse.json({
                response: aiResponse.response,
                isCommand: aiResponse.isCommand,
                requiresPermission: aiResponse.requiresPermission
              });
            }
          }
        } catch { }
        // Try with storage_path first, fallback to file_url if column doesn't exist
        let candidates: { title: string; storage_path: string; mime_type?: string }[];
        try {
          candidates = await sql`
            (
              SELECT title, storage_path, mime_type FROM uploaded_files 
              WHERE group_id = ${groupId} AND title = ${candidateName}
            )
            UNION ALL
            (
              SELECT title, storage_path, mime_type FROM uploaded_files 
              WHERE group_id = ${groupId} AND title ILIKE ${'%' + candidateName + '%'}
              ORDER BY uploaded_at DESC
              LIMIT 5
            )
          ` as { title: string; storage_path: string; mime_type?: string }[];
        } catch (error) {
          console.log('[chat] autodetect: storage_path column not found, using file_url fallback');
          const fallbackCandidates = await sql`
            (
              SELECT title, file_url FROM uploaded_files
              WHERE group_id = ${groupId} AND title = ${candidateName}
            )
            UNION ALL
            (
              SELECT title, file_url FROM uploaded_files
              WHERE group_id = ${groupId} AND title ILIKE ${'%' + candidateName + '%'}
              ORDER BY uploaded_at DESC
                LIMIT 5
            )
          ` as { title: string; file_url: string }[];

          // Convert URLs to storage paths
          candidates = fallbackCandidates.map(f => ({
            title: f.title,
            storage_path: extractStoragePathFromUrl(f.file_url),
            mime_type: 'application/octet-stream'
          }));
        }

        console.log('[chat] autodetect: candidates found', { count: candidates.length });
        if (candidates.length) {
          const chosen = candidates[0];
          console.log('[chat] autodetect: chosen', { title: chosen.title, path: chosen.storage_path });

          const fileBlob = await downloadFile(chosen.storage_path);
          console.log('[chat] autodetect: download result', { success: fileBlob ? 'SUCCESS' : 'FAILED' });
          if (!fileBlob) {
            console.warn('[chat] autodetect: failed to download file');
            return NextResponse.json({ response: 'Failed to access file.', isCommand: false });
          }
          console.log('[chat] autodetect: file downloaded successfully');

          // Upload file to Gemini and get file URI
          try {
            const geminiFileUri = await uploadFileToGemini(fileBlob, chosen.title, chosen.mime_type);
            console.log('[chat] autodetect: uploaded to Gemini', { uri: geminiFileUri });

            if (geminiFileUri) {
              augmentedContext = {
                ...augmentedContext,
                ragFileUris: [...(augmentedContext.ragFileUris || []), {
                  fileName: chosen.title,
                  uri: geminiFileUri,
                  mimeType: chosen.mime_type || fileBlob.type || 'application/octet-stream'
                }]
              };
              finalMessage = message;
            } else {
              // Fallback to text extraction if Gemini upload fails
              const text = await extractText(fileBlob, chosen.storage_path);
              if (text && text.trim()) {
                const summary = await geminiService.summarizeLongText(text, { title: chosen.title });
                augmentedContext = {
                  ...augmentedContext,
                  ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: summary }]
                };
              } else {
                augmentedContext = {
                  ...augmentedContext,
                  ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: 'No readable text could be extracted from this file.' }]
                };
              }
              finalMessage = message;
            }
          } catch (error) {
            console.error('[chat] autodetect: error uploading to Gemini, falling back to text extraction:', error);
            // Fallback to text extraction
            const text = await extractText(fileBlob, chosen.storage_path);
            if (text && text.trim()) {
              const summary = await geminiService.summarizeLongText(text, { title: chosen.title });
              augmentedContext = {
                ...augmentedContext,
                ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: summary }]
              };
            } else {
              augmentedContext = {
                ...augmentedContext,
                ragSnippets: [...(augmentedContext.ragSnippets || []), { fileName: `${chosen.title} (summary)`, snippet: 'No readable text could be extracted from this file.' }]
              };
            }
            finalMessage = message;
          }
        }
      }
    }

    // If user asked for a list of files, return list directly
    const listIntent = /(what\s+(are\s+)?the\s+files|which\s+files|list\s+files|show\s+files|all\s+files|files\?|files\s+available|files\s+can\s+i\s+access|what\s+are\s+the\s+files\s+i\s+can\s+access)/i.test(message);
    if (listIntent) {
      try {
        if (!canAccessFiles) {
          return NextResponse.json({ response: 'PERMISSION_DENIED: You need files:read and role admin/manager to list group files.', isCommand: false, requiresPermission: 'files:read' });
        }
        let rows = await sql`
          SELECT title, is_inline_content, mime_type, uploaded_at
          FROM uploaded_files
          WHERE group_id = ${groupId}
          ORDER BY uploaded_at DESC
          LIMIT 50
        ` as { title: string; is_inline_content: boolean; mime_type: string | null; uploaded_at: string }[];
        if (!rows.length) {
          return NextResponse.json({ response: 'No files found for this group.', isCommand: false, requiresPermission: false });
        }
        const lines = rows.map(r => `- ${r.title} ${r.is_inline_content ? '(inline)' : '(file)'}${r.mime_type ? ` · ${r.mime_type}` : ''}`);
        return NextResponse.json({ response: `Here are recent files:\n${lines.join('\n')}`, isCommand: false, requiresPermission: false });
      } catch (e) {
        console.error('[chat] list files failed primary select', e);
        try {
          const rowsFallback = await sql`
            SELECT title, uploaded_at
            FROM uploaded_files
            WHERE group_id = ${groupId}
            ORDER BY uploaded_at DESC
            LIMIT 50
          ` as { title: string; uploaded_at: string }[];
          if (!rowsFallback.length) {
            return NextResponse.json({ response: 'No files found for this group.', isCommand: false, requiresPermission: false });
          }
          const lines = rowsFallback.map(r => `- ${r.title}`);
          return NextResponse.json({ response: `Here are recent files:\n${lines.join('\n')}`, isCommand: false, requiresPermission: false });
        } catch (e2) {
          console.error('[chat] list files failed fallback select', e2);
          return NextResponse.json({ response: 'Failed to list files.', isCommand: false, requiresPermission: false });
        }
      }
    }

    // Generate AI response
    const aiResponse = await geminiService.generateChatResponse(finalMessage, augmentedContext);

    // Save user message to database
    try {
      await sql`
        INSERT INTO chat_messages (group_id, user_id, content, message_type)
        VALUES (${groupId}, ${userId}, ${message}, 'text')
      `;
    } catch (error) {
      console.warn('Failed to save user message:', error);
    }

    // Save AI response to database
    try {
      await sql`
        INSERT INTO chat_messages (group_id, user_id, content, message_type, metadata)
        VALUES (${groupId}, ${userId}, ${aiResponse.response}, 'text', ${JSON.stringify({
        isCommand: aiResponse.isCommand,
        requiresPermission: aiResponse.requiresPermission
      })})
      `;
    } catch (error) {
      console.warn('Failed to save AI response:', error);
    }

    // Handle task assignment if it's a command
    if (aiResponse.isCommand && aiResponse.taskAssignment) {
      try {
        const taskGroupId = groupId;

        const assignedUserIds: string[] = [];

        if (aiResponse.taskAssignment.assignToAllMembers) {
          const members = await sql`
            SELECT user_id FROM group_members WHERE group_id = ${taskGroupId}
          ` as { user_id: string }[];
          assignedUserIds.push(...members.map(m => m.user_id));
        }

        if (aiResponse.taskAssignment.assignToRole) {
          const roleMembers = await sql`
            SELECT user_id FROM group_members WHERE group_id = ${taskGroupId} AND role = ${aiResponse.taskAssignment.assignToRole}
          ` as { user_id: string }[];
          assignedUserIds.push(...roleMembers.map(m => m.user_id));
        }

        for (const ident of (aiResponse.taskAssignment.assignedTo || [])) {
          if (!ident || !ident.trim()) continue;
          const trimmed = ident.trim();
          const userResult = await sql`
            SELECT id FROM users WHERE email ILIKE ${trimmed} OR name ILIKE ${trimmed}
          ` as { id: string }[];
          if (userResult.length > 0) {
            assignedUserIds.push(userResult[0].id);
          }
        }

        let uniqueUserIds = Array.from(new Set(assignedUserIds.filter(Boolean)));

        if (uniqueUserIds.length === 0) {
          uniqueUserIds = [userId];
        }

        for (const assignedUserId of uniqueUserIds) {
          await tasksService.createTask({
            title: aiResponse.taskAssignment.title,
            description: aiResponse.taskAssignment.description || '',
            assignedToUserId: assignedUserId,
            assignedByUserId: userId,
            groupId: taskGroupId,
            dueDate: aiResponse.taskAssignment.dueDate,
            priority: aiResponse.taskAssignment.priority || 'medium'
          });
        }

        let responseMessage = `Task "${aiResponse.taskAssignment.title}" has been assigned to ${uniqueUserIds.length} user(s).`;

        if (aiResponse.taskAssignment.assignToRole) {
          responseMessage = `Task "${aiResponse.taskAssignment.title}" has been assigned to all ${aiResponse.taskAssignment.assignToRole}s${aiResponse.taskAssignment.dueDate ? ` due ${aiResponse.taskAssignment.dueDate}` : ''}.`;
        } else if (aiResponse.taskAssignment.assignToAllMembers) {
          responseMessage = `Task "${aiResponse.taskAssignment.title}" has been assigned to all group members${aiResponse.taskAssignment.dueDate ? ` due ${aiResponse.taskAssignment.dueDate}` : ''}.`;
        }

        aiResponse.response = responseMessage;
      } catch (error) {
        console.error('Error creating tasks:', error);
        aiResponse.response = `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    // Handle access request by creating a task for admins
    if (aiResponse.isAccessRequest && aiResponse.accessRequestTarget) {
      try {
        const adminMembers = await sql`
          SELECT user_id FROM group_members WHERE group_id = ${groupId} AND role = 'admin'
        ` as { user_id: string }[];

        if (adminMembers.length === 0) {
          aiResponse.response += '\n\nNo group admins found to notify about this request.';
        } else {
          for (const admin of adminMembers) {
            await tasksService.createTask({
              title: `Access Request: ${aiResponse.accessRequestTarget}`,
              description: `User requested access to ${aiResponse.accessRequestTarget}. Please review and grant permissions if appropriate.`,
              assignedToUserId: admin.user_id,
              assignedByUserId: userId,
              groupId: groupId,
              dueDate: new Date(Date.now() + 86400000).toISOString(),
              priority: 'high'
            });
          }

          if (!aiResponse.response.toLowerCase().includes('notified') && !aiResponse.response.toLowerCase().includes('request')) {
            aiResponse.response += `\n\nGroup admins have been notified about your access request for "${aiResponse.accessRequestTarget}".`;
          }
        }
      } catch (error) {
        console.error('Error creating access request task:', error);
      }
    }

    return NextResponse.json({
      response: aiResponse.response,
      isCommand: aiResponse.isCommand,
      requiresPermission: aiResponse.requiresPermission
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
