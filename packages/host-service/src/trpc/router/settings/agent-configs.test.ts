import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { agentConfigsRouter } from "./agent-configs";

const MIGRATIONS_FOLDER = join(import.meta.dir, "../../../../drizzle");

function createTestCtx(): HostServiceContext {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return {
		db,
		isAuthenticated: true,
	} as unknown as HostServiceContext;
}

describe("settings.agentConfigs", () => {
	it("seeds bundled defaults on first list()", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		expect(list.map((c) => c.presetId)).toEqual([
			"claude",
			"amp",
			"codex",
			"gemini",
			"copilot",
		]);
		for (const config of list) {
			expect(config.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
			expect(typeof config.label).toBe("string");
			expect(config.label.length).toBeGreaterThan(0);
			expect(typeof config.launchCommand).toBe("string");
			expect(["argv", "stdin"]).toContain(config.promptInput);
		}
		expect(list.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
	});

	it("does not include Superset Chat in the seed", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		expect(
			list.some((c) => c.presetId.toLowerCase().includes("superset")),
		).toBe(false);
		expect(list.some((c) => c.label.toLowerCase().includes("superset"))).toBe(
			false,
		);
	});

	it("does not re-seed when configs already exist", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const first = await caller.list();
		const second = await caller.list();
		expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id));
	});

	it("add() copies preset fields and assigns a unique id with next order", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const initial = await caller.list();
		const created = await caller.add({ presetId: "pi" });
		expect(created.presetId).toBe("pi");
		expect(created.label).toBe("Pi");
		expect(created.launchCommand).toBe("pi");
		expect(created.promptInput).toBe("argv");
		expect(created.order).toBe(initial.length);
		expect(initial.some((c) => c.id === created.id)).toBe(false);
	});

	it("allows duplicate presetId entries with distinct ids", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		await caller.list();
		const a = await caller.add({ presetId: "claude" });
		const b = await caller.add({ presetId: "claude" });
		expect(a.presetId).toBe("claude");
		expect(b.presetId).toBe("claude");
		expect(a.id).not.toBe(b.id);
		const list = await caller.list();
		const claudes = list.filter((c) => c.presetId === "claude");
		expect(claudes.length).toBe(3);
	});

	it("update() persists label, launchCommand, and promptInput", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		const target = list[0];
		if (!target) throw new Error("expected seeded config");
		const updated = await caller.update({
			id: target.id,
			patch: {
				label: "My Claude",
				launchCommand: "claude --dangerously-skip-permissions",
				promptInput: "stdin",
			},
		});
		expect(updated.label).toBe("My Claude");
		expect(updated.launchCommand).toBe("claude --dangerously-skip-permissions");
		expect(updated.promptInput).toBe("stdin");

		const reread = await caller.list();
		const refreshed = reread.find((c) => c.id === target.id);
		expect(refreshed).toEqual(updated);
	});

	it("update() rejects invalid promptInput", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		const target = list[0];
		if (!target) throw new Error("expected seeded config");
		await expect(
			caller.update({
				id: target.id,
				// @ts-expect-error - testing runtime rejection of invalid promptInput
				patch: { promptInput: "file" },
			}),
		).rejects.toThrow();
	});

	it("update() rejects an empty patch", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		const target = list[0];
		if (!target) throw new Error("expected seeded config");
		await expect(caller.update({ id: target.id, patch: {} })).rejects.toThrow();
	});

	it("remove() deletes a config", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		const target = list[0];
		if (!target) throw new Error("expected seeded config");
		await caller.remove({ id: target.id });
		const after = await caller.list();
		expect(after.find((c) => c.id === target.id)).toBeUndefined();
		expect(after.length).toBe(list.length - 1);
	});

	it("reorder() persists the submitted order", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		const reversed = [...list.map((c) => c.id)].reverse();
		const reordered = await caller.reorder({ ids: reversed });
		expect(reordered.map((c) => c.id)).toEqual(reversed);
		expect(reordered.map((c) => c.order)).toEqual(
			list.map((_, index) => index),
		);
		const reread = await caller.list();
		expect(reread.map((c) => c.id)).toEqual(reversed);
	});

	it("reorder() rejects ids that don't match existing configs", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		await expect(
			caller.reorder({
				ids: list.slice(0, list.length - 1).map((c) => c.id),
			}),
		).rejects.toThrow();
		await expect(
			caller.reorder({
				ids: [...list.map((c) => c.id), "not-a-real-id"],
			}),
		).rejects.toThrow();
	});

	it("reorder() rejects duplicate ids", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const list = await caller.list();
		const ids = list.map((c) => c.id);
		const first = ids[0];
		if (!first) throw new Error("expected seeded config");
		const dup = [first, ...ids.slice(1, -1), first];
		await expect(caller.reorder({ ids: dup })).rejects.toThrow();
	});

	it("resetToDefaults() replaces the list with the bundled defaults", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const original = await caller.list();
		const target = original[0];
		if (!target) throw new Error("expected seeded config");
		await caller.update({
			id: target.id,
			patch: { label: "Heavily Customized" },
		});
		await caller.add({ presetId: "pi" });
		await caller.add({ presetId: "cursor-agent" });

		const reset = await caller.resetToDefaults();
		expect(reset.map((c) => c.presetId)).toEqual([
			"claude",
			"amp",
			"codex",
			"gemini",
			"copilot",
		]);
		expect(reset.some((c) => c.label === "Heavily Customized")).toBe(false);
		expect(reset.every((c) => !original.find((o) => o.id === c.id))).toBe(true);
	});

	it("listPresets() returns all hardcoded presets including non-default ones", async () => {
		const ctx = createTestCtx();
		const caller = agentConfigsRouter.createCaller(ctx);
		const presets = await caller.listPresets();
		const ids = presets.map((p) => p.presetId);
		expect(ids).toContain("claude");
		expect(ids).toContain("pi");
		expect(ids).toContain("cursor-agent");
		expect(ids).toContain("mastracode");
		expect(ids).toContain("opencode");
	});
});
