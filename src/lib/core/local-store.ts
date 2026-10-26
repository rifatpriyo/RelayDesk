import { mkdir, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Actor, BusinessState, ChannelKind } from "./types";
import { DEMO_RETAIL_ID, DEMO_SERVICE_ID, seedBusiness } from "./seed";
import { invariant } from "./errors";
import { validateState } from "./commands";
type LocalState = {
  version: 1;
  businesses: Record<string, BusinessState>;
  assets: Record<string, string>;
  spend?: Record<
    string,
    { businessId: string; day: string; reserved: number; actual: number | null }
  >;
};
export class LocalStore {
  constructor(
    private directory = process.env.DEMO_DATA_DIR ||
      path.join(process.cwd(), ".data", "demo"),
  ) {}
  private async locked<T>(
    fn: (state: LocalState) => T | Promise<T>,
    write: boolean,
  ): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const lock = path.join(this.directory, "write.lock"),
      file = path.join(this.directory, "state.json");
    let acquired = false;
    for (let i = 0; i < 200; i++) {
      try {
        await mkdir(lock);
        acquired = true;
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    invariant(
      acquired,
      "STORE_BUSY",
      "The local store is busy. Retry shortly.",
      503,
    );
    try {
      let state: LocalState;
      try {
        state = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        state = {
          version: 1,
          businesses: {
            [DEMO_RETAIL_ID]: seedBusiness("retail"),
            [DEMO_SERVICE_ID]: seedBusiness("service"),
          },
          assets: {},
        };
        write = true;
      }
      const result = await fn(state);
      if (write) {
        const temp = path.join(this.directory, `state-${randomUUID()}.tmp`);
        await writeFile(temp, JSON.stringify(state), {
          encoding: "utf8",
          mode: 0o600,
        });
        await rename(temp, file);
      }
      return structuredClone(result);
    } finally {
      await rmdir(lock);
    }
  }
  async read(actor: Actor): Promise<BusinessState> {
    return this.locked((state) => {
      const s = state.businesses[actor.businessId];
      invariant(s, "NOT_FOUND", "Business not found.", 404);
      validateState(s, actor);
      return s;
    }, false);
  }
  async transact<T>(
    actor: Actor,
    fn: (draft: BusinessState) => T | Promise<T>,
  ): Promise<T> {
    return this.locked(async (state) => {
      const s = state.businesses[actor.businessId];
      invariant(s, "NOT_FOUND", "Business not found.", 404);
      validateState(s, actor);
      const result = await fn(s);
      validateState(s, actor, true);
      s.revision++;
      return result;
    }, true);
  }
  async lookupAsset(kind: ChannelKind, assetId: string) {
    return this.locked((s) => s.assets[`${kind}:${assetId}`] ?? null, false);
  }
  async claimAsset(actor: Actor, kind: ChannelKind, assetId: string) {
    return this.locked((s) => {
      const key = `${kind}:${assetId}`;
      invariant(
        !s.assets[key] || s.assets[key] === actor.businessId,
        "ASSET_IN_USE",
        "This account is connected to another business.",
        409,
      );
      s.assets[key] = actor.businessId;
    }, true);
  }
  async releaseAsset(actor: Actor, kind: ChannelKind, assetId: string) {
    return this.locked((s) => {
      const key = `${kind}:${assetId}`;
      if (s.assets[key] === actor.businessId) delete s.assets[key];
    }, true);
  }
  async listBusinessIds() {
    return this.locked(
      (s) =>
        Object.values(s.businesses)
          .filter((b) => !b.business.deletedAt)
          .map((b) => b.business.id),
      false,
    );
  }
  async reserveGlobalSpend(
    id: string,
    businessId: string,
    day: string,
    amountMicros: number,
    limitMicros: number,
  ) {
    return this.locked((s) => {
      s.spend ??= {};
      if (s.spend[id]) {
        invariant(
          s.spend[id].businessId === businessId,
          "TENANT_MISMATCH",
          "Cost reservation belongs to another business.",
          403,
        );
        return;
      }
      const used = Object.values(s.spend)
        .filter((v) => v.day === day)
        .reduce((sum, v) => sum + (v.actual ?? v.reserved), 0);
      invariant(
        used + amountMicros <= limitMicros,
        "GLOBAL_COST_LIMIT",
        "The operator daily inference budget is exhausted.",
        429,
      );
      s.spend[id] = { businessId, day, reserved: amountMicros, actual: null };
    }, true);
  }
  async settleGlobalSpend(id: string, actualMicros: number) {
    return this.locked((s) => {
      const r = s.spend?.[id];
      invariant(
        r,
        "SPEND_NOT_RESERVED",
        "Inference spend was not reserved.",
        409,
      );
      if (r.actual === null) r.actual = actualMicros;
    }, true);
  }
}
