// app/api/migrate/route.ts
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function POST() {
  try {
    console.log('Starting database migration...');

    // Add role column to users table
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee'`;
    console.log('Added role column to users table');

    // Add invite_code column to groups table
    await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE`;
    console.log('Added invite_code column to groups table');

    // Create permissions table
    await sql`
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('Created permissions table');

    // Create role permissions junction table
    await sql`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role TEXT NOT NULL,
        permission_name TEXT NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(role, permission_name)
      )
    `;
    console.log('Created role_permissions table');

    // Create notes table
    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        content TEXT,
        author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_private BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('Created notes table');

    // Create note sharing table
    await sql`
      CREATE TABLE IF NOT EXISTS note_shares (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(note_id, shared_with_user_id)
      )
    `;
    console.log('Created note_shares table');

    // Create tasks table
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        assigned_to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        due_date TIMESTAMPTZ,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('Created tasks table');

    // Create group members table
    await sql`
      CREATE TABLE IF NOT EXISTS group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(group_id, user_id)
      )
    `;
    console.log('Created group_members table');

    // Create chat messages table
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        message_type TEXT DEFAULT 'text',
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('Created chat_messages table');

    // Insert default permissions
    const permissions = [
      ['finance_data:read', 'Read access to financial data and reports'],
      ['finance_data:write', 'Write access to financial data and reports'],
      ['user_management:read', 'View user information and roles'],
      ['user_management:write', 'Create, update, and delete users'],
      ['task_assignment:create', 'Create and assign tasks to users'],
      ['task_assignment:read', 'View assigned tasks'],
      ['task_assignment:update', 'Update task status and details'],
      ['notes:create', 'Create new notes'],
      ['notes:read', 'Read notes'],
      ['notes:share', 'Share notes with other users'],
      ['notes:delete', 'Delete notes'],
      ['calendar:read', 'View calendar events'],
      ['calendar:write', 'Create and update calendar events'],
      ['files:read', 'Read and download group files'],
      ['files:write', 'Upload and manage group files'],
      ['admin:permissions', 'Manage role permissions and access control'],
      ['admin:system', 'Full system administration access']
    ];

    for (const [name, description] of permissions) {
      await sql`
        INSERT INTO permissions (name, description) 
        VALUES (${name}, ${description})
        ON CONFLICT (name) DO NOTHING
      `;
    }
    console.log('Inserted default permissions');

    // Insert default role permissions
    const rolePermissions = [
      // Admin — full access
      ['admin', 'finance_data:read'],
      ['admin', 'finance_data:write'],
      ['admin', 'user_management:read'],
      ['admin', 'user_management:write'],
      ['admin', 'task_assignment:create'],
      ['admin', 'task_assignment:read'],
      ['admin', 'task_assignment:update'],
      ['admin', 'notes:create'],
      ['admin', 'notes:read'],
      ['admin', 'notes:share'],
      ['admin', 'notes:delete'],
      ['admin', 'calendar:read'],
      ['admin', 'calendar:write'],
      ['admin', 'files:read'],
      ['admin', 'files:write'],
      ['admin', 'admin:permissions'],
      ['admin', 'admin:system'],

      // Manager
      ['manager', 'finance_data:read'],
      ['manager', 'user_management:read'],
      ['manager', 'task_assignment:create'],
      ['manager', 'task_assignment:read'],
      ['manager', 'task_assignment:update'],
      ['manager', 'notes:create'],
      ['manager', 'notes:read'],
      ['manager', 'notes:share'],
      ['manager', 'calendar:read'],
      ['manager', 'calendar:write'],
      ['manager', 'files:read'],

      // Tech Lead
      ['tech-lead', 'user_management:read'],
      ['tech-lead', 'task_assignment:create'],
      ['tech-lead', 'task_assignment:read'],
      ['tech-lead', 'task_assignment:update'],
      ['tech-lead', 'notes:create'],
      ['tech-lead', 'notes:read'],
      ['tech-lead', 'notes:share'],
      ['tech-lead', 'calendar:read'],
      ['tech-lead', 'calendar:write'],
      ['tech-lead', 'files:read'],

      // Finance Manager
      ['finance-manager', 'finance_data:read'],
      ['finance-manager', 'finance_data:write'],
      ['finance-manager', 'task_assignment:create'],
      ['finance-manager', 'task_assignment:read'],
      ['finance-manager', 'task_assignment:update'],
      ['finance-manager', 'notes:create'],
      ['finance-manager', 'notes:read'],
      ['finance-manager', 'notes:share'],
      ['finance-manager', 'calendar:read'],
      ['finance-manager', 'calendar:write'],
      ['finance-manager', 'files:read'],

      // Employee
      ['employee', 'task_assignment:read'],
      ['employee', 'notes:create'],
      ['employee', 'notes:read'],
      ['employee', 'calendar:read'],

      // Intern
      ['intern', 'task_assignment:read'],
      ['intern', 'notes:create'],
      ['intern', 'notes:read'],
      ['intern', 'calendar:read'],

      // Viewer — read-only
      ['viewer', 'task_assignment:read'],
      ['viewer', 'notes:read'],
      ['viewer', 'calendar:read'],
    ];

    for (const [role, permission] of rolePermissions) {
      await sql`
        INSERT INTO role_permissions (role, permission_name) 
        VALUES (${role}, ${permission})
        ON CONFLICT (role, permission_name) DO NOTHING
      `;
    }
    console.log('Inserted default role permissions');

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_author_id ON notes(author_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_is_private ON notes(is_private)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_note_shares_note_id ON note_shares(note_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_note_shares_shared_with ON note_shares(shared_with_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON tasks(group_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id ON chat_messages(group_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`;
    console.log('Created indexes');

    console.log('Database migration completed successfully!');

    return NextResponse.json({
      success: true,
      message: 'Database migration completed successfully!'
    });

  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json({
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
