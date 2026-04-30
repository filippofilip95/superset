import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	AGENT_PRESETS,
	type AgentPreset,
	getDefaultSeedPresets,
	getPresetById,
	type PromptInput,
} from "./agent-presets";

const promptInputSchema = z.enum(["argv", "stdin"]);

const presetIdSchema = z
	.string()
	.refine((value) => getPresetById(value) !== undefined, {
		message: "Unknown presetId",
	});

interface HostAgentConfigOutput {
	id: string;
	presetId: string;
	label: string;
	launchCommand: string;
	promptInput: PromptInput;
	order: number;
}

interface HostAgentConfigRow {
	id: string;
	presetId: string;
	label: string;
	launchCommand: string;
	promptInput: string;
	displayOrder: number;
}

function toOutput(row: HostAgentConfigRow): HostAgentConfigOutput {
	return {
		id: row.id,
		presetId: row.presetId,
		label: row.label,
		launchCommand: row.launchCommand,
		promptInput: row.promptInput as PromptInput,
		order: row.displayOrder,
	};
}

function rowFromPreset(
	preset: AgentPreset,
	displayOrder: number,
): typeof hostAgentConfigs.$inferInsert {
	return {
		id: randomUUID(),
		presetId: preset.presetId,
		label: preset.label,
		launchCommand: preset.launchCommand,
		promptInput: preset.promptInput,
		displayOrder,
	};
}

function listOrdered(db: HostDb): HostAgentConfigRow[] {
	return db
		.select()
		.from(hostAgentConfigs)
		.orderBy(asc(hostAgentConfigs.displayOrder))
		.all();
}

function seedDefaultsIfEmpty(db: HostDb): HostAgentConfigRow[] {
	const existing = listOrdered(db);
	if (existing.length > 0) return existing;
	const seeds = getDefaultSeedPresets().map((preset, index) =>
		rowFromPreset(preset, index),
	);
	if (seeds.length === 0) return existing;
	db.insert(hostAgentConfigs).values(seeds).run();
	return listOrdered(db);
}

export const agentConfigsRouter = router({
	/**
	 * List configured host agents in persisted order. Seeds bundled defaults
	 * on first call when no configs exist.
	 */
	list: protectedProcedure.query(({ ctx }) => {
		const rows = seedDefaultsIfEmpty(ctx.db);
		return rows.map(toOutput);
	}),

	/**
	 * Available add templates. Returns the hardcoded preset list — the UI
	 * uses this to render the "add agent" picker.
	 */
	listPresets: protectedProcedure.query(() =>
		AGENT_PRESETS.map((preset) => ({ ...preset })),
	),

	/**
	 * Create a new host agent config from a hardcoded preset. Allows
	 * duplicate `presetId` entries — each gets a fresh `id`.
	 */
	add: protectedProcedure
		.input(z.object({ presetId: presetIdSchema }))
		.mutation(({ ctx, input }) => {
			const preset = getPresetById(input.presetId);
			if (!preset) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown presetId: ${input.presetId}`,
				});
			}
			const existing = listOrdered(ctx.db);
			const nextOrder =
				existing.length === 0
					? 0
					: Math.max(...existing.map((row) => row.displayOrder)) + 1;
			const insert = rowFromPreset(preset, nextOrder);
			ctx.db.insert(hostAgentConfigs).values(insert).run();
			const created = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, insert.id))
				.get();
			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to read back inserted host agent config",
				});
			}
			return toOutput(created);
		}),

	/**
	 * Update editable fields on an existing config. Only `label`,
	 * `launchCommand`, and `promptInput` are mutable; `presetId` and
	 * `order` are not.
	 */
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				patch: z
					.object({
						label: z.string().min(1).optional(),
						launchCommand: z.string().min(1).optional(),
						promptInput: promptInputSchema.optional(),
					})
					.refine(
						(patch) =>
							patch.label !== undefined ||
							patch.launchCommand !== undefined ||
							patch.promptInput !== undefined,
						{ message: "Patch must update at least one field" },
					),
			}),
		)
		.mutation(({ ctx, input }) => {
			const existing = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.get();
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Host agent config not found: ${input.id}`,
				});
			}
			ctx.db
				.update(hostAgentConfigs)
				.set({ ...input.patch, updatedAt: Date.now() })
				.where(eq(hostAgentConfigs.id, input.id))
				.run();
			const updated = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to read back updated host agent config",
				});
			}
			return toOutput(updated);
		}),

	/** Delete a single host agent config by id. */
	remove: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.delete(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.run();
			return { success: true as const };
		}),

	/**
	 * Persist a new ordering. The submitted ids must match the current
	 * configured ids exactly — no additions, no removals, no duplicates.
	 */
	reorder: protectedProcedure
		.input(z.object({ ids: z.array(z.string().min(1)).min(1) }))
		.mutation(({ ctx, input }) => {
			const existing = listOrdered(ctx.db);
			const existingIds = new Set(existing.map((row) => row.id));
			const inputIds = new Set(input.ids);
			if (inputIds.size !== input.ids.length) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Reorder ids must be unique",
				});
			}
			if (
				existingIds.size !== inputIds.size ||
				input.ids.some((id) => !existingIds.has(id))
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Reorder ids must match existing configs exactly",
				});
			}
			const now = Date.now();
			input.ids.forEach((id, index) => {
				ctx.db
					.update(hostAgentConfigs)
					.set({ displayOrder: index, updatedAt: now })
					.where(eq(hostAgentConfigs.id, id))
					.run();
			});
			return listOrdered(ctx.db).map(toOutput);
		}),

	/** Replace the current configs with the bundled defaults. */
	resetToDefaults: protectedProcedure.mutation(({ ctx }) => {
		const existing = listOrdered(ctx.db);
		if (existing.length > 0) {
			ctx.db
				.delete(hostAgentConfigs)
				.where(
					inArray(
						hostAgentConfigs.id,
						existing.map((row) => row.id),
					),
				)
				.run();
		}
		const seeds = getDefaultSeedPresets().map((preset, index) =>
			rowFromPreset(preset, index),
		);
		if (seeds.length > 0) {
			ctx.db.insert(hostAgentConfigs).values(seeds).run();
		}
		return listOrdered(ctx.db).map(toOutput);
	}),
});

export type HostAgentConfigDto = HostAgentConfigOutput;
