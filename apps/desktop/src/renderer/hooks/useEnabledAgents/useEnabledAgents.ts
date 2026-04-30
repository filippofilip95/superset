import {
	getEnabledAgentConfigs,
	type ResolvedAgentConfig,
} from "@superset/shared/agent-settings";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { hostAgentConfigToResolvedConfig } from "./hostConfigShim";

interface UseEnabledAgentsResult {
	agents: ResolvedAgentConfig[];
	isPending: boolean;
	isFetched: boolean;
}

/**
 * Returns the list of agents available for launch. Under `V2_CLOUD`,
 * reads from the active host's `settings.agentConfigs` (host-runtime
 * scoped). Under v1, reads from desktop `settings.getAgentPresets()`
 * and filters to enabled-only. Shared across the automations and
 * new-workspace flows.
 */
export function useEnabledAgents(): UseEnabledAgentsResult {
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	const v1 = useV1EnabledAgents(!isV2CloudEnabled);
	const v2 = useV2EnabledAgents(isV2CloudEnabled);
	return isV2CloudEnabled ? v2 : v1;
}

function useV1EnabledAgents(enabled: boolean): UseEnabledAgentsResult {
	const query = electronTrpc.settings.getAgentPresets.useQuery(undefined, {
		enabled,
	});

	const agents = useMemo(
		() => getEnabledAgentConfigs(query.data ?? []),
		[query.data],
	);

	return { agents, isPending: query.isPending, isFetched: query.isFetched };
}

function useV2EnabledAgents(enabled: boolean): UseEnabledAgentsResult {
	const { activeHostUrl } = useLocalHostService();

	const query = useQuery({
		queryKey: ["host-agent-configs", activeHostUrl] as const,
		enabled: enabled && !!activeHostUrl,
		queryFn: async () => {
			if (!activeHostUrl) return [];
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.list.query();
		},
	});

	const agents = useMemo<ResolvedAgentConfig[]>(
		() => (query.data ?? []).map(hostAgentConfigToResolvedConfig),
		[query.data],
	);

	return {
		agents,
		isPending: enabled ? query.isPending : false,
		isFetched: enabled ? query.isFetched : true,
	};
}
