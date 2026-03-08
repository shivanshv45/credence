// lib/rbac.ts
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * 7 roles ordered from most privileged to least.
 * The index is used for hierarchy comparisons.
 */
export const ROLE_HIERARCHY = [
  'admin',
  'manager',
  'tech-lead',
  'finance-manager',
  'employee',
  'intern',
  'viewer',
] as const;

export type RoleName = (typeof ROLE_HIERARCHY)[number];

/** Returns the numeric level of a role (0 = highest). -1 if unknown. */
export function roleLevel(role: string): number {
  const idx = ROLE_HIERARCHY.indexOf(role as RoleName);
  return idx === -1 ? ROLE_HIERARCHY.length : idx;
}

/** True when `userRole` is equal to or higher than `requiredRole` in the hierarchy. */
export function roleAtLeast(userRole: string, requiredRole: RoleName): boolean {
  return roleLevel(userRole) <= roleLevel(requiredRole);
}

export interface UserPermissions {
  role: string;
  permissions: string[];
  groupPermissions?: string[];
  customPermissionText?: string;
}

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'finance_data:read', 'finance_data:write',
    'user_management:read', 'user_management:write',
    'task_assignment:create', 'task_assignment:read', 'task_assignment:update',
    'notes:create', 'notes:read', 'notes:share', 'notes:delete',
    'calendar:read', 'calendar:write',
    'files:read', 'files:write',
    'admin:permissions', 'admin:system',
  ],
  manager: [
    'finance_data:read',
    'user_management:read',
    'task_assignment:create', 'task_assignment:read', 'task_assignment:update',
    'notes:create', 'notes:read', 'notes:share',
    'calendar:read', 'calendar:write',
    'files:read',
  ],
  'tech-lead': [
    'user_management:read',
    'task_assignment:create', 'task_assignment:read', 'task_assignment:update',
    'notes:create', 'notes:read', 'notes:share',
    'calendar:read', 'calendar:write',
    'files:read',
  ],
  'finance-manager': [
    'finance_data:read', 'finance_data:write',
    'task_assignment:create', 'task_assignment:read', 'task_assignment:update',
    'notes:create', 'notes:read', 'notes:share',
    'calendar:read', 'calendar:write',
    'files:read',
  ],
  employee: [
    'task_assignment:read',
    'notes:create', 'notes:read',
    'calendar:read',
  ],
  intern: [
    'task_assignment:read',
    'notes:create', 'notes:read',
    'calendar:read',
  ],
  viewer: [
    'task_assignment:read',
    'notes:read',
    'calendar:read',
  ],
};

export class RBACService {
  /**
   * Resolves the effective role for a user within a specific group context.
   * Prefers the group-level role; falls back to the global user role.
   */
  async getEffectiveRole(userId: string, groupId: string): Promise<string> {
    try {
      const membership = await sql`
        SELECT role FROM group_members
        WHERE group_id = ${groupId} AND user_id = ${userId}
        LIMIT 1
      ` as { role: string }[];

      if (membership.length > 0 && membership[0].role) {
        return membership[0].role;
      }

      const user = await sql`
        SELECT role FROM users WHERE id = ${userId}
      ` as { role: string }[];

      return user[0]?.role || 'employee';
    } catch (error) {
      console.error('Error resolving effective role:', error);
      return 'employee';
    }
  }

  async getUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      const userResult = await sql`
        SELECT role FROM users WHERE id = ${userId}
      `;

      if (userResult.length === 0) {
        return {
          role: 'employee',
          permissions: DEFAULT_PERMISSIONS['employee'],
        };
      }

      const role = userResult[0].role || 'employee';

      // Try DB-driven permissions first
      const permissionsResult = await sql`
        SELECT p.name
        FROM permissions p
        JOIN role_permissions rp ON p.name = rp.permission_name
        WHERE rp.role = ${role}
      `;

      const permissions = permissionsResult.length > 0
        ? permissionsResult.map(p => p.name)
        : DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS['employee'];

      return { role, permissions };
    } catch (error) {
      console.error('Error fetching user permissions:', error);

      if (error instanceof Error && error.message.includes('column "role" does not exist')) {
        try {
          await fetch('/api/migrate', { method: 'POST' });
          return this.getUserPermissions(userId);
        } catch {
          // migration failed, fall through
        }
      }

      return {
        role: 'employee',
        permissions: DEFAULT_PERMISSIONS['employee'],
      };
    }
  }

  /**
   * Returns the full resolved permission set for a user in a group context.
   * Merges global permissions with group-level role permissions.
   */
  async getEffectivePermissions(userId: string, groupId: string): Promise<UserPermissions> {
    const globalPerms = await this.getUserPermissions(userId);
    const effectiveRole = await this.getEffectiveRole(userId, groupId);

    // If group role is higher, use its permissions instead
    if (roleLevel(effectiveRole) < roleLevel(globalPerms.role)) {
      const rolePerms = await this.getRolePermissions(effectiveRole);
      const merged = Array.from(new Set([...globalPerms.permissions, ...rolePerms]));
      return { role: effectiveRole, permissions: merged };
    }

    return { ...globalPerms, role: effectiveRole };
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      return userPermissions.permissions.includes(permission);
    } catch {
      return false;
    }
  }

  /**
   * Permission check that is group-aware.
   * Uses the effective role (group or global) to determine permissions.
   */
  async hasPermissionInGroup(userId: string, groupId: string, permission: string): Promise<boolean> {
    try {
      const perms = await this.getEffectivePermissions(userId, groupId);
      return perms.permissions.includes(permission);
    } catch {
      return false;
    }
  }

  async userHasRole(userId: string, role: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM users WHERE id = ${userId} AND role = ${role}
      `;
      return result.length > 0;
    } catch {
      return false;
    }
  }

  async userHasGroupRole(userId: string, groupId: string, role: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM group_members WHERE user_id = ${userId} AND group_id = ${groupId} AND role = ${role}
      `;
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * True if the user's effective role in the group is at least as high as `minRole`.
   */
  async userHasAtLeastRole(userId: string, groupId: string, minRole: RoleName): Promise<boolean> {
    const effective = await this.getEffectiveRole(userId, groupId);
    return roleAtLeast(effective, minRole);
  }

  async getAllRoles(): Promise<Array<{ role: string; count: number }>> {
    try {
      const result = await sql`
        SELECT role, COUNT(*) as count
        FROM users
        WHERE role IS NOT NULL
        GROUP BY role
        ORDER BY role
      `;
      return result as { role: string; count: number }[];
    } catch {
      return [];
    }
  }

  async getRolePermissions(role: string): Promise<string[]> {
    try {
      const result = await sql`
        SELECT p.name
        FROM permissions p
        JOIN role_permissions rp ON p.name = rp.permission_name
        WHERE rp.role = ${role}
        ORDER BY p.name
      `;
      if (result.length > 0) return result.map(r => r.name);
      return DEFAULT_PERMISSIONS[role] || [];
    } catch {
      return DEFAULT_PERMISSIONS[role] || [];
    }
  }

  async updateRolePermissions(role: string, permissions: string[]): Promise<void> {
    try {
      await sql`DELETE FROM role_permissions WHERE role = ${role}`;

      for (const permission of permissions) {
        await sql`
          INSERT INTO role_permissions (role, permission_name)
          VALUES (${role}, ${permission})
          ON CONFLICT (role, permission_name) DO NOTHING
        `;
      }
    } catch (error) {
      console.error('Error updating role permissions:', error);
      throw error;
    }
  }

  async getAllPermissions(): Promise<Array<{ name: string; description: string }>> {
    try {
      const result = await sql`
        SELECT name, description
        FROM permissions
        ORDER BY name
      `;
      return result as { name: string; description: string }[];
    } catch {
      return [];
    }
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    try {
      await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }

  async getUserGroupPermissions(userId: string, groupId: string): Promise<{
    groupPermissions: string[];
    customPermissionText: string;
  }> {
    try {
      const groupRole = await sql`
        SELECT role FROM group_members
        WHERE group_id = ${groupId} AND user_id = ${userId}
      ` as { role: string }[];

      if (groupRole.length === 0) {
        return { groupPermissions: [], customPermissionText: '' };
      }

      const role = groupRole[0].role;

      // Try DB table first; fall back to defaults if table doesn't exist
      let groupPermissions: string[] = [];
      try {
        const gpResult = await sql`
          SELECT permission_name
          FROM group_role_permissions
          WHERE group_id = ${groupId} AND role = ${role}
        ` as { permission_name: string }[];
        groupPermissions = gpResult.map(p => p.permission_name);
      } catch {
        groupPermissions = DEFAULT_PERMISSIONS[role] || [];
      }

      let customPermissionText = '';
      try {
        const cpResult = await sql`
          SELECT custom_permission_text
          FROM group_custom_permissions
          WHERE group_id = ${groupId} AND role = ${role}
        ` as { custom_permission_text: string }[];
        customPermissionText = cpResult[0]?.custom_permission_text || '';
      } catch {
        customPermissionText = '';
      }

      return { groupPermissions, customPermissionText };
    } catch {
      return { groupPermissions: [], customPermissionText: '' };
    }
  }
}

export const rbacService = new RBACService();
