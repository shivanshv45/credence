import { NextResponse } from 'next/server';
import { session } from '@descope/nextjs-sdk/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
    const sessionInfo = await session();
    if (!sessionInfo?.token?.sub) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const users = await sql`SELECT id FROM users WHERE descope_user_id = ${sessionInfo.token.sub}`;
        if (!users.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        const userId = users[0].id;

        // Fetch pending tasks
        const tasks = await sql`
      SELECT id, title, created_at, 'task' as type 
      FROM tasks 
      WHERE (assigned_to_user_id = ${userId} OR assigned_by_user_id = ${userId}) 
      AND status = 'pending'
      ORDER BY created_at DESC LIMIT 5
    `;

        // Fetch recent audit logs (last 3 days)
        const audits = await sql`
      SELECT id, action as title, created_at, 'audit' as type 
      FROM audit_logs 
      WHERE actor_user_id = ${userId}
      ORDER BY created_at DESC LIMIT 5
    `;

        // Combine and sort
        const all = [...tasks, ...audits].sort((a, b) => {
            const ta = new Date(a.created_at).getTime();
            const tb = new Date(b.created_at).getTime();
            return tb - ta;
        }).slice(0, 10);

        const formatted = all.map(item => {
            const date = new Date(item.created_at);
            const isToday = new Date().toDateString() === date.toDateString();
            const timeStr = isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString();

            if (item.type === 'task') {
                return {
                    id: `task-${item.id}`,
                    icon: 'alert',
                    title: 'Pending Task',
                    desc: item.title,
                    ts: timeStr,
                    href: '/tasks'
                };
            } else {
                return {
                    id: `audit-${item.id}`,
                    icon: 'payment',
                    title: 'Security Log',
                    desc: item.title,
                    ts: timeStr,
                    href: '/?view=security#audit-log'
                };
            }
        });

        return NextResponse.json({ data: formatted });
    } catch (error) {
        console.error('Notifications Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
