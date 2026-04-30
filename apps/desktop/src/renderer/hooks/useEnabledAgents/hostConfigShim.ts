import type { HostAgentConfigDto } from "@superset/host-service/settings";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import {
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
} from "@superset/shared/agent-prompt-template";
import type { TerminalResolvedAgentConfig } from "@superset/shared/agent-settings";

/**
 * Stable id used by AgentSelect / launch resolution when the agent comes
 * from a V2 host config. The `custom:` prefix matches the existing
 * `AgentDefinitionId` shape; the UUID after it is the host config
 * instance id, which is what the renderer sends back to the host on
 * launch.
 */
export function hostAgentConfigDefinitionId(
	hostConfigId: string,
): AgentDefinitionId {
	return `custom:${hostConfigId}` as AgentDefinitionId;
}

/**
 * Map a V2 host agent config into the legacy `TerminalResolvedAgentConfig`
 * shape so existing renderer consumers (AgentSelect, useAgentLaunchPreferences,
 * indexResolvedAgentConfigs, dispatchForkLaunch) keep working without an
 * end-to-end rewrite. Removed once those callers are migrated to the V2
 * shape directly.
 *
 * `launchCommand` covers both `command` and `promptCommand` — V2 host
 * configs collapse the legacy prompt/no-prompt distinction into one
 * "everything before the prompt" string.
 */
export function hostAgentConfigToResolvedConfig(
	host: HostAgentConfigDto,
): TerminalResolvedAgentConfig {
	return {
		id: hostAgentConfigDefinitionId(host.id),
		source: "user",
		kind: "terminal",
		label: host.label,
		enabled: true,
		command: host.launchCommand,
		promptCommand: host.launchCommand,
		promptTransport: host.promptInput,
		taskPromptTemplate: DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
		contextPromptTemplateSystem: DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
		contextPromptTemplateUser: DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
		overriddenFields: [],
	};
}
