import { DescopeNotionSync } from './descope-notion-sync';
import { DescopeOutboundManager, descopeConfig } from './descope-outbound-config';
import { NotionSyncConfig } from './types/notion-types';

export class NotionSyncService {
  private notionSync: DescopeNotionSync;
  private descopeManager: DescopeOutboundManager;
  private config: NotionSyncConfig;

  constructor() {
    this.config = {
      notionToken: process.env.NOTION_TOKEN || '',
      tasksDatabaseId: process.env.NOTION_TASKS_DATABASE_ID || '',
      notesDatabaseId: process.env.NOTION_NOTES_DATABASE_ID || '',
      workspaceId: process.env.NOTION_WORKSPACE_ID || '',
    };

    this.notionSync = new DescopeNotionSync(this.config);
    this.descopeManager = new DescopeOutboundManager(descopeConfig);
  }

  async syncTaskWithNotion(taskData: any) {
    try {
      // Sync to Notion via Descope outbound flow
      const descopeResult = await this.descopeManager.triggerNotionSync('task', taskData);

      // Also sync directly to Notion for redundancy
      const notionResult = await this.notionSync.syncTaskToNotion(taskData);

      return {
        success: true,
        descopeResult,
        notionResult,
        notionPageId: notionResult.notionPageId,
      };
    } catch (error) {
      console.error('Error syncing task with Notion:', error);
      throw error;
    }
  }

  async syncNoteWithNotion(noteData: any) {
    try {
      // Sync to Notion via Descope outbound flow
      const descopeResult = await this.descopeManager.triggerNotionSync('note', noteData);

      // Also sync directly to Notion for redundancy
      const notionResult = await this.notionSync.syncNoteToNotion(noteData);

      return {
        success: true,
        descopeResult,
        notionResult,
        notionPageId: notionResult.notionPageId,
      };
    } catch (error) {
      console.error('Error syncing note with Notion:', error);
      throw error;
    }
  }

  async updateTaskInNotion(taskId: string, updates: any) {
    try {
      const result = await this.notionSync.updateTaskInNotion(taskId, updates);

      // Trigger Descope outbound flow for the update
      await this.descopeManager.triggerNotionSync('task', { id: taskId, ...updates });

      return result;
    } catch (error) {
      console.error('Error updating task in Notion:', error);
      throw error;
    }
  }

  async updateNoteInNotion(noteId: string, updates: any) {
    try {
      const result = await this.notionSync.updateNoteInNotion(noteId, updates);

      // Trigger Descope outbound flow for the update
      await this.descopeManager.triggerNotionSync('note', { id: noteId, ...updates });

      return result;
    } catch (error) {
      console.error('Error updating note in Notion:', error);
      throw error;
    }
  }

  async deleteFromNotion(pageId: string) {
    try {
      const result = await this.notionSync.deleteFromNotion(pageId);

      // Trigger Descope outbound flow for the deletion
      await this.descopeManager.triggerNotionSync('task', { id: pageId, action: 'delete' });

      return result;
    } catch (error) {
      console.error('Error deleting from Notion:', error);
      throw error;
    }
  }

  async performFullSync() {
    try {
      const notionResult = await this.notionSync.performFullSync();

      // Trigger Descope outbound flow for full sync
      await this.descopeManager.triggerNotionSync('task', { action: 'full_sync' });

      return notionResult;
    } catch (error) {
      console.error('Error performing full sync:', error);
      throw error;
    }
  }

  async setupNotionIntegration() {
    try {
      // Setup webhook in Descope
      const webhookResult = await this.descopeManager.setupNotionWebhook();

      // Get current flow status
      const statusResult = await this.descopeManager.getOutboundFlowStatus();

      return {
        success: true,
        webhookResult,
        statusResult,
        config: descopeConfig.notionIntegration,
      };
    } catch (error) {
      console.error('Error setting up Notion integration:', error);
      throw error;
    }
  }

  async getSyncStatus() {
    try {
      const descopeStatus = await this.descopeManager.getOutboundFlowStatus();
      const notionFullSync = await this.notionSync.performFullSync();

      return {
        descope: {
          status: descopeStatus,
          config: descopeConfig.notionIntegration,
        },
        notion: {
          syncResult: notionFullSync,
        },
        lastSync: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      throw error;
    }
  }

  async handleNotionWebhook(payload: any) {
    try {
      const result = await this.notionSync.handleNotionWebhook(payload);

      // Log the webhook event in Descope
      await this.descopeManager.triggerNotionSync('task', { ...payload, _source: 'webhook' });

      return result;
    } catch (error) {
      console.error('Error handling Notion webhook:', error);
      throw error;
    }
  }
}
