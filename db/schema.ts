import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  owner: text("owner").primaryKey(),
  revision: integer("revision").notNull().default(1),
  projects: text("projects").notNull(),
});

export const users = sqliteTable("users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  lastSeenAt: integer("last_seen_at").notNull(),
}, (table) => [uniqueIndex("idx_users_email").on(table.email)]);

export const sharedProjects = sqliteTable("shared_projects", {
  projectId: text("project_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  project: text("project").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("idx_shared_projects_owner_id").on(table.ownerId)]);

export const projectMembers = sqliteTable("project_members", {
  projectId: text("project_id").notNull(),
  memberEmail: text("member_email").notNull(),
  role: text("role").notNull().default("editor"),
  addedAt: integer("added_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.memberEmail] }),
  index("idx_project_members_email").on(table.memberEmail),
]);

export const sharedRecordings = sqliteTable("shared_recordings", {
  projectId: text("project_id").notNull(),
  recordingId: text("recording_id").notNull(),
  ownerId: text("owner_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.recordingId] }),
  index("idx_shared_recordings_recording_id").on(table.recordingId),
]);
