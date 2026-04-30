CREATE TABLE `host_agent_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`label` text NOT NULL,
	`launch_command` text NOT NULL,
	`prompt_input` text NOT NULL,
	`display_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_agent_configs_display_order_idx` ON `host_agent_configs` (`display_order`);