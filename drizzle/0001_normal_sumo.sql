CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`member_email` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `member_email`)
);
--> statement-breakpoint
CREATE INDEX `idx_project_members_email` ON `project_members` (`member_email`);--> statement-breakpoint
CREATE TABLE `shared_projects` (
	`project_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shared_projects_owner_id` ON `shared_projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `shared_recordings` (
	`project_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`owner_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `recording_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_shared_recordings_recording_id` ON `shared_recordings` (`recording_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
PRAGMA optimize;
