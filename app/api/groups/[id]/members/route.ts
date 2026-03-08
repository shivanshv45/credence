import { NextResponse } from 'next/server';
import { session } from '@descope/nextjs-sdk/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const sessionInfo = await session();

  if (!sessionInfo?.token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const descopeUserId = sessionInfo.token.sub;
    const { id } = await context.params;
    const groupId = id;

    // Get user's internal ID
    const users = await sql`
      SELECT id FROM users WHERE descope_user_id = ${descopeUserId}
    ` as { id: string }[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userId = users[0].id;

    // Check if user is a member of this group
    const membership = await sql`
      SELECT gm.role, g.name as group_name
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      WHERE gm.group_id = ${groupId} AND gm.user_id = ${userId}
    ` as { role: string; group_name: string }[];

    if (!membership || membership.length === 0) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 404 });
    }

    const userRole = membership[0].role;

    // If user is admin, return all members. Otherwise, return just user's role
    if (userRole === 'admin') {
      // Get all members of the group
      const allMembers = await sql`
        SELECT 
          gm.user_id as id,
          u.name,
          u.email,
          gm.role,
          gm.joined_at
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ${groupId}
        ORDER BY gm.joined_at ASC
      ` as { id: string; name: string | null; email: string | null; role: string; joined_at: string }[];

      return NextResponse.json({
        role: userRole,
        groupName: membership[0].group_name,
        members: allMembers.map(member => ({
          id: member.id,
          name: member.name || 'Unknown User',
          email: member.email || 'No email',
          role: member.role,
          joined_at: member.joined_at
        }))
      });
    } else {
      // Non-admin users only get their own role
      return NextResponse.json({
        role: userRole,
        groupName: membership[0].group_name
      });
    }

  } catch (error) {
    console.error('Failed to get group members:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const sessionInfo = await session();

  if (!sessionInfo?.token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const descopeUserId = sessionInfo.token.sub;
    const { id } = await context.params;
    const groupId = id;
    const { member_user_id, new_role } = await request.json();

    console.log(`PATCH request - Group ID: ${groupId}, Member User ID: ${member_user_id}, New Role: ${new_role}`);

    if (!member_user_id || !new_role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate the role value
    const validRoles = ['admin', 'manager', 'tech-lead', 'finance-manager', 'employee', 'intern', 'viewer'];
    if (!validRoles.includes(new_role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 });
    }

    // Get user's internal ID
    const users = await sql`
      SELECT id FROM users WHERE descope_user_id = ${descopeUserId}
    ` as { id: string }[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userId = users[0].id;

    // Check if user is admin of this group
    const membership = await sql`
      SELECT role FROM group_members 
      WHERE group_id = ${groupId} AND user_id = ${userId}
    ` as { role: string }[];

    if (!membership || membership.length === 0 || membership[0].role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Update the member's role in the group
    const groupUpdateResult = await sql`
      UPDATE group_members 
      SET role = ${new_role}
      WHERE group_id = ${groupId} AND user_id = ${member_user_id}
    `;
    console.log('Group role update result:', groupUpdateResult);

    // Also update the user's global role to match the group role
    // This ensures the chat system recognizes the role change
    const userUpdateResult = await sql`
      UPDATE users 
      SET role = ${new_role}
      WHERE id = ${member_user_id}
    `;
    console.log('User role update result:', userUpdateResult);

    // Debug logging to verify the update
    console.log(`Role update - User ID: ${member_user_id}, New Role: ${new_role}, Group ID: ${groupId}`);

    // Verify the update worked
    const verifyUser = await sql`
      SELECT role FROM users WHERE id = ${member_user_id}
    `;
    console.log(`Verification - User ${member_user_id} role is now: ${verifyUser[0]?.role}`);

    // Also verify the group role update
    const verifyGroupRole = await sql`
      SELECT role FROM group_members 
      WHERE group_id = ${groupId} AND user_id = ${member_user_id}
    `;
    console.log(`Verification - Group role is now: ${verifyGroupRole[0]?.role}`);

    return NextResponse.json({ success: true, message: 'Role updated successfully' });

  } catch (error) {
    console.error('Failed to update member role:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const sessionInfo = await session();

  if (!sessionInfo?.token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const descopeUserId = sessionInfo.token.sub;
    const { id } = await context.params;
    const groupId = id;
    const { member_user_id } = await request.json();

    if (!member_user_id) {
      return NextResponse.json({ error: 'Missing member_user_id' }, { status: 400 });
    }

    // Get user's internal ID
    const users = await sql`
      SELECT id FROM users WHERE descope_user_id = ${descopeUserId}
    ` as { id: string }[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userId = users[0].id;

    // Check if user is admin of this group
    const membership = await sql`
      SELECT role FROM group_members 
      WHERE group_id = ${groupId} AND user_id = ${userId}
    ` as { role: string }[];

    if (!membership || membership.length === 0 || membership[0].role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Don't allow removing the last admin
    const adminCount = await sql`
      SELECT COUNT(*) as count FROM group_members 
      WHERE group_id = ${groupId} AND role = 'admin'
    ` as { count: number }[];

    if (adminCount[0].count <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 });
    }

    // Remove the member
    await sql`
      DELETE FROM group_members 
      WHERE group_id = ${groupId} AND user_id = ${member_user_id}
    `;

    return NextResponse.json({ success: true, message: 'Member removed successfully' });

  } catch (error) {
    console.error('Failed to remove member:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}