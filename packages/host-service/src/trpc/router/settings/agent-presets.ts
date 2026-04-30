export type PromptInput = "argv" | "stdin";

export interface AgentPreset {
	presetId: string;
	label: string;
	launchCommand: string;
	promptInput: PromptInput;
}

/**
 * Hardcoded terminal agent presets. Used as add templates and as the seed
 * for first `list()` / `resetToDefaults()`. `launchCommand` is everything
 * before the prompt — host-service appends the prompt as argv or pipes
 * via stdin per `promptInput`.
 *
 * Superset Chat is intentionally excluded — its model/provider config
 * lives in chat settings, not in terminal-agent configs.
 */
export const AGENT_PRESETS = [
	{
		presetId: "claude",
		label: "Claude",
		launchCommand: "claude --permission-mode acceptEdits",
		promptInput: "argv",
	},
	{
		presetId: "amp",
		label: "Amp",
		launchCommand: "amp",
		promptInput: "stdin",
	},
	{
		presetId: "codex",
		label: "Codex",
		launchCommand:
			'codex -c model_reasoning_effort="high" -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --full-auto --',
		promptInput: "argv",
	},
	{
		presetId: "gemini",
		label: "Gemini",
		launchCommand: "gemini --approval-mode=auto_edit",
		promptInput: "argv",
	},
	{
		presetId: "mastracode",
		label: "Mastracode",
		launchCommand: "mastracode --prompt",
		promptInput: "argv",
	},
	{
		presetId: "opencode",
		label: "OpenCode",
		launchCommand: "opencode --prompt",
		promptInput: "argv",
	},
	{
		presetId: "pi",
		label: "Pi",
		launchCommand: "pi",
		promptInput: "argv",
	},
	{
		presetId: "copilot",
		label: "Copilot",
		launchCommand: "copilot --allow-tool=write -i",
		promptInput: "argv",
	},
	{
		presetId: "cursor-agent",
		label: "Cursor Agent",
		launchCommand: "cursor-agent",
		promptInput: "argv",
	},
] as const satisfies readonly AgentPreset[];

const DEFAULT_PRESET_IDS = new Set([
	"claude",
	"amp",
	"codex",
	"gemini",
	"copilot",
]);

export function getDefaultSeedPresets(): AgentPreset[] {
	return AGENT_PRESETS.filter((preset) =>
		DEFAULT_PRESET_IDS.has(preset.presetId),
	);
}

export function getPresetById(presetId: string): AgentPreset | undefined {
	return AGENT_PRESETS.find((preset) => preset.presetId === presetId);
}
