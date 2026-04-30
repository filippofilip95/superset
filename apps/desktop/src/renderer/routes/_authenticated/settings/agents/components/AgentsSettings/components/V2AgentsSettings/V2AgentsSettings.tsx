import type { HostAgentConfigDto } from "@superset/host-service/settings";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader } from "@superset/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

function agentConfigsKey(activeHostUrl: string | null) {
	return ["host-agent-configs", activeHostUrl] as const;
}

function presetsKey(activeHostUrl: string | null) {
	return ["host-agent-presets", activeHostUrl] as const;
}

export function V2AgentsSettings() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();

	const { data: configs, isLoading } = useQuery({
		queryKey: agentConfigsKey(activeHostUrl),
		enabled: !!activeHostUrl,
		queryFn: async () => {
			if (!activeHostUrl) return [];
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.list.query();
		},
	});

	const { data: presets } = useQuery({
		queryKey: presetsKey(activeHostUrl),
		enabled: !!activeHostUrl,
		queryFn: async () => {
			if (!activeHostUrl) return [];
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.listPresets.query();
		},
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: agentConfigsKey(activeHostUrl) });

	const addMutation = useMutation({
		mutationFn: async (presetId: string) => {
			if (!activeHostUrl) throw new Error("Host service not available");
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.add.mutate({ presetId });
		},
		onSuccess: () => invalidate(),
		onError: (err) => toast.error(err.message),
	});

	const removeMutation = useMutation({
		mutationFn: async (id: string) => {
			if (!activeHostUrl) throw new Error("Host service not available");
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.remove.mutate({ id });
		},
		onSuccess: () => invalidate(),
		onError: (err) => toast.error(err.message),
	});

	const reorderMutation = useMutation({
		mutationFn: async (ids: string[]) => {
			if (!activeHostUrl) throw new Error("Host service not available");
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.reorder.mutate({ ids });
		},
		onSuccess: () => invalidate(),
		onError: (err) => toast.error(err.message),
	});

	const resetMutation = useMutation({
		mutationFn: async () => {
			if (!activeHostUrl) throw new Error("Host service not available");
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.resetToDefaults.mutate();
		},
		onSuccess: () => {
			invalidate();
			toast.success("Reset to default agents");
		},
		onError: (err) => toast.error(err.message),
	});

	const move = (index: number, delta: -1 | 1) => {
		if (!configs) return;
		const target = index + delta;
		if (target < 0 || target >= configs.length) return;
		const next = [...configs];
		const [moved] = next.splice(index, 1);
		if (!moved) return;
		next.splice(target, 0, moved);
		reorderMutation.mutate(next.map((c) => c.id));
	};

	if (!activeHostUrl) {
		return (
			<div className="p-6 max-w-5xl w-full">
				<p className="text-sm text-muted-foreground">
					Host service is not available. Connect to a host to configure agents.
				</p>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-5xl w-full">
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Agents</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Configured terminal agents on this host. The new workspace launcher
						picks from this list.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								<Plus className="size-4 mr-1.5" />
								Add agent
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{(presets ?? []).map((preset) => (
								<DropdownMenuItem
									key={preset.presetId}
									onClick={() => addMutation.mutate(preset.presetId)}
								>
									{preset.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="ghost" size="sm">
								<RotateCcw className="size-4 mr-1.5" />
								Reset
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Reset to default agents?</AlertDialogTitle>
								<AlertDialogDescription>
									This replaces your configured agents with the bundled
									defaults. Custom labels and command edits on this host will be
									lost.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction onClick={() => resetMutation.mutate()}>
									Reset
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading agents…</p>
			) : (configs?.length ?? 0) === 0 ? (
				<p className="text-sm text-muted-foreground">
					No agents configured. Use Add agent to choose from the bundled
					presets.
				</p>
			) : (
				<div className="space-y-3">
					{configs?.map((config, index) => (
						<V2AgentConfigCard
							key={config.id}
							config={config}
							canMoveUp={index > 0}
							canMoveDown={index < (configs?.length ?? 0) - 1}
							onMoveUp={() => move(index, -1)}
							onMoveDown={() => move(index, 1)}
							onRemove={() => removeMutation.mutate(config.id)}
							activeHostUrl={activeHostUrl}
						/>
					))}
				</div>
			)}
		</div>
	);
}

interface V2AgentConfigCardProps {
	config: HostAgentConfigDto;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
	activeHostUrl: string;
}

function V2AgentConfigCard({
	config,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onMoveDown,
	onRemove,
	activeHostUrl,
}: V2AgentConfigCardProps) {
	const queryClient = useQueryClient();
	const [label, setLabel] = useState(config.label);
	const [launchCommand, setLaunchCommand] = useState(config.launchCommand);
	const [promptInput, setPromptInput] = useState(config.promptInput);

	useEffect(() => {
		setLabel(config.label);
		setLaunchCommand(config.launchCommand);
		setPromptInput(config.promptInput);
	}, [config.label, config.launchCommand, config.promptInput]);

	const dirty =
		label !== config.label ||
		launchCommand !== config.launchCommand ||
		promptInput !== config.promptInput;

	const updateMutation = useMutation({
		mutationFn: async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.settings.agentConfigs.update.mutate({
				id: config.id,
				patch: { label, launchCommand, promptInput },
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: agentConfigsKey(activeHostUrl),
			});
			toast.success("Agent saved");
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
				<div className="text-sm font-medium">{config.label}</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						disabled={!canMoveUp}
						onClick={onMoveUp}
						aria-label="Move up"
					>
						<ArrowUp className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						disabled={!canMoveDown}
						onClick={onMoveDown}
						aria-label="Move down"
					>
						<ArrowDown className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={onRemove}
						aria-label="Remove agent"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div className="space-y-1">
						<Label htmlFor={`label-${config.id}`}>Label</Label>
						<Input
							id={`label-${config.id}`}
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<div className="space-y-1 sm:col-span-2">
						<Label htmlFor={`cmd-${config.id}`}>Launch command</Label>
						<Input
							id={`cmd-${config.id}`}
							value={launchCommand}
							onChange={(e) => setLaunchCommand(e.target.value)}
							className="font-mono text-xs"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
					<div className="space-y-1">
						<Label htmlFor={`prompt-${config.id}`}>Prompt input</Label>
						<Select
							value={promptInput}
							onValueChange={(value) =>
								setPromptInput(value as typeof promptInput)
							}
						>
							<SelectTrigger id={`prompt-${config.id}`}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="argv">argv</SelectItem>
								<SelectItem value="stdin">stdin</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="sm:col-span-2 flex items-end justify-end gap-2">
						<span className="text-xs text-muted-foreground">
							Preset: <span className="font-mono">{config.presetId}</span>
						</span>
						<Button
							size="sm"
							disabled={!dirty || updateMutation.isPending}
							onClick={() => updateMutation.mutate()}
						>
							Save
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
