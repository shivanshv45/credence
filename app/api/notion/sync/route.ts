import { NextRequest, NextResponse } from 'next/server';
import { DescopeNotionSync } from '@/lib/descope-notion-sync';
import { NotionSyncConfig } from '@/lib/types/notion-types';

const notionConfig: NotionSyncConfig = {
  notionToken: process.env.NOTION_TOKEN || '',
  tasksDatabaseId: process.env.NOTION_TASKS_DATABASE_ID || '',
  notesDatabaseId: process.env.NOTION_NOTES_DATABASE_ID || '',
  workspaceId: process.env.NOTION_WORKSPACE_ID || '',
};

const notionSync = new DescopeNotionSync(notionConfig);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    let result: any;

    switch (type) {
      case 'task':
        result = await notionSync.syncTaskToNotion(data);
        break;
      case 'note':
        result = await notionSync.syncNoteToNotion(data);
        break;
      case 'full_sync': {
        const fullResult = await notionSync.performFullSync();
        return NextResponse.json({ success: true, data: fullResult });
      }
      default:
        return NextResponse.json(
          { error: 'Invalid sync type' },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        notionPageId: result.notionPageId,
      });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Notion sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, updates } = body;

    let result;

    switch (type) {
      case 'task':
        result = await notionSync.updateTaskInNotion(id, updates);
        break;
      case 'note':
        result = await notionSync.updateNoteInNotion(id, updates);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid update type' },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Notion update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    const result = await notionSync.deleteFromNotion(pageId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Successfully deleted from Notion',
      });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Notion delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
