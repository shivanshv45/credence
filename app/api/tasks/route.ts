// app/api/tasks/route.ts
import { NextResponse } from 'next/server';
import { session } from '@descope/nextjs-sdk/server';
import { neon } from '@neondatabase/serverless';
import { tasksService } from '@/lib/tasks';
import { rbacService } from '@/lib/rbac';

const sql = neon(process.env.DATABASE_URL!);


export async function GET(request: Request) {
  const sessionInfo = await session();

  if (!sessionInfo?.token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    const scope = searchParams.get('scope'); // 'self' | 'all'

    // Get user ID
    const users = await sql`
      SELECT id FROM users WHERE descope_user_id = ${sessionInfo.token.sub}
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // For individual flow: always allow user to read their own tasks
    let tasks = [] as any[];
    if (scope === 'all') {
      const isAdmin = await rbacService.userHasRole(userId, 'admin');
      if (!isAdmin) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
      tasks = await tasksService.getAllTasks();
    } else {
      // Return user tasks (ignore group-level read perms for personal usage)
      tasks = await tasksService.getTasksForUser(userId);
    }

    return NextResponse.json(tasks);

  } catch (error) {
    console.error('Tasks GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper: ensure personal group exists and return its id
async function getOrCreatePersonalGroupId(userId: string): Promise<string> {
  // Try find existing
  const existing = await sql`
    SELECT id FROM groups WHERE created_by = ${userId} AND name = 'Personal'
  ` as { id: string }[];
  if (existing.length) return existing[0].id;

  // Create new personal group and add membership
  const inserted = await sql`
    INSERT INTO groups (name, created_by)
    VALUES ('Personal', ${userId})
    RETURNING id
  ` as { id: string }[];
  const groupId = inserted[0].id;
  try {
    await sql`INSERT INTO group_members (group_id, user_id, role) VALUES (${groupId}, ${userId}, 'member')`;
  } catch { }
  return groupId;
}

// POST: Create a new task
export async function POST(request: Request) {
  const sessionInfo = await session();

  if (!sessionInfo?.token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, description, assignedToUserId, groupId, dueDate, priority } = await request.json();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Get user ID
    const users = await sql`
      SELECT id FROM users WHERE descope_user_id = ${sessionInfo.token.sub}
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    const resolvedAssignedTo = assignedToUserId || userId;
    const personalGroupId = await getOrCreatePersonalGroupId(userId);
    const resolvedGroupId = groupId || personalGroupId;

    let requirePermission = false;
    if (resolvedAssignedTo !== userId) requirePermission = true;
    if (groupId && groupId !== personalGroupId) requirePermission = true;
    if (requirePermission) {
      const hasCreatePermission = await rbacService.hasPermission(userId, 'task_assignment:create');
      if (!hasCreatePermission) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const task = await tasksService.createTask({
      title,
      description: description || '',
      assignedToUserId: resolvedAssignedTo,
      assignedByUserId: userId,
      groupId: resolvedGroupId,
      dueDate,
      priority
    });

    // audit
    try {
      await sql`
        INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${userId}, 'task.create', 'task', ${task.id}, ${JSON.stringify({ groupId: resolvedGroupId })})
      `;
    } catch { }

    return NextResponse.json(task, { status: 201 });

  } catch (error) {
    console.error('Tasks POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
