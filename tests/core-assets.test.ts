import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Actor, BusinessState } from "../src/lib/core/types";
import { demoActor, seedBusiness } from "../src/lib/core/seed";
import { assertManager, validateState } from "../src/lib/core/commands";
import { fileAssets } from "../src/lib/core/asset-policy";

const harness = vi.hoisted(() => ({
  state: null as BusinessState | null,
  objects: new Map<string, Buffer>(),
  signed: vi.fn(),
  removed: vi.fn(),
}));
vi.mock("../src/lib/core/server", () => ({
  assertManager: (actor: Actor) => assertManager(actor),
  readBusiness: async (actor: Actor) => {
    validateState(harness.state!, actor);
    return structuredClone(harness.state!);
  },
  transactBusiness: async <T>(
    actor: Actor,
    callback: (draft: BusinessState) => T | Promise<T>,
  ) => {
    const draft = structuredClone(harness.state!);
    validateState(draft, actor);
    const result = await callback(draft);
    validateState(draft, actor, true);
    harness.state = draft;
    return result;
  },
  supabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (key: string, options: unknown) => {
          harness.signed("upload", key, options);
          return {
            data: {
              signedUrl: `https://storage.example.test/${key}?token=fixture`,
            },
            error: null,
          };
        },
        createSignedUrl: async (key: string, seconds: number) => {
          harness.signed("download", key, seconds);
          return {
            data: {
              signedUrl: `https://storage.example.test/${key}?download=fixture`,
            },
            error: null,
          };
        },
        download: async (key: string) => ({
          data: harness.objects.has(key)
            ? new Blob([new Uint8Array(harness.objects.get(key)!)])
            : null,
          error: null,
        }),
        remove: async (keys: string[]) => {
          harness.removed(keys);
          for (const key of keys) harness.objects.delete(key);
          return { error: null };
        },
      }),
    },
  }),
}));
import {
  cleanupExpiredAssets,
  completeUpload,
  deleteUploadedAsset,
  listUploadedAssets,
  prepareUpload,
  putLocalUpload,
  readUploadedAsset,
  resolveApprovedProductImage,
} from "../src/lib/core/assets";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9n8AAAAASUVORK5CYII=",
  "base64",
);
const localOwner = () => demoActor();
const realOwner = () => ({ ...demoActor(), demo: false });
const input = () => ({
  name: "product.png",
  mime: "image/png",
  size: png.length,
});
function stored(assetId: string) {
  return fileAssets(harness.state!).find((a) => a.id === assetId)!;
}

describe("private file lifecycle and capability boundaries", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "relaydesk-assets-"));
    vi.stubEnv("DEMO_DATA_DIR", directory);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    harness.state = seedBusiness("retail");
    harness.objects.clear();
    harness.signed.mockClear();
    harness.removed.mockClear();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("persists verified local bytes, requires completion, and deletes them", async () => {
    const owner = localOwner(),
      prepared = await prepareUpload(owner, input());
    expect(prepared.upload.url).toBe(`/api/assets/${prepared.assetId}`);
    await expect(readUploadedAsset(owner, prepared.assetId)).rejects.toThrow(
      "Confirm",
    );
    await putLocalUpload(
      owner,
      prepared.assetId,
      new Request("https://app.example.test", {
        method: "PUT",
        body: new Uint8Array(png),
      }),
    );
    expect((await completeUpload(owner, prepared.assetId)).image).toBe(
      `/api/assets/${prepared.assetId}`,
    );
    expect(
      (await readUploadedAsset(owner, prepared.assetId)).buffer.equals(png),
    ).toBe(true);
    expect((await listUploadedAssets(owner)).usedBytes).toBe(png.length);
    await deleteUploadedAsset(owner, prepared.assetId);
    await expect(readUploadedAsset(owner, prepared.assetId)).rejects.toThrow(
      "not found",
    );
    expect((await listUploadedAssets(owner)).usedBytes).toBe(0);
  });

  it("rejects a different tenant, removed member, and agent mutation", async () => {
    const prepared = await prepareUpload(localOwner(), input());
    await expect(
      readUploadedAsset(demoActor("service"), prepared.assetId),
    ).rejects.toThrow("context does not match");
    await expect(
      prepareUpload(demoActor("retail", "agent"), input()),
    ).rejects.toThrow("owner or admin");
    await expect(
      completeUpload(
        { ...localOwner(), userId: "removed-member" },
        prepared.assetId,
      ),
    ).rejects.toThrow("membership changed");
    await expect(
      readUploadedAsset(localOwner(), "../other-business"),
    ).rejects.toThrow("not found");
  });

  it("rejects spoofed bytes, mismatched sizes and oversized local streams", async () => {
    const owner = localOwner(),
      prepared = await prepareUpload(owner, input());
    await expect(
      putLocalUpload(
        owner,
        prepared.assetId,
        new Request("https://app.example.test", {
          method: "PUT",
          body: "<svg>not a PNG</svg>",
        }),
      ),
    ).rejects.toThrow("size does not match");
    await expect(
      putLocalUpload(
        owner,
        prepared.assetId,
        new Request("https://app.example.test", {
          method: "PUT",
          body: new Uint8Array(png.length),
        }),
      ),
    ).rejects.toThrow("supported content type");
    await expect(
      putLocalUpload(
        owner,
        prepared.assetId,
        new Request("https://app.example.test", {
          method: "PUT",
          body: new Uint8Array(2 * 1024 * 1024 + 1),
        }),
      ),
    ).rejects.toThrow("2 MB");
    await expect(
      prepareUpload(owner, { ...input(), size: 3 * 1024 * 1024 }),
    ).rejects.toThrow("2 MB");
  });

  it("reserves the full cloud upload capability and blocks quota bypass", async () => {
    const owner = realOwner();
    await prepareUpload(owner, input());
    await prepareUpload(owner, input());
    expect((await listUploadedAssets(owner)).usedBytes).toBe(40 * 1024 * 1024);
    await expect(prepareUpload(owner, input())).rejects.toThrow(
      "storage allowance",
    );
    expect(harness.signed).toHaveBeenCalledWith(
      "upload",
      expect.stringContaining(`${owner.businessId}/uploads/`),
      { upsert: false },
    );
  });

  it("keeps deleted pending reservations until their signed capability expires", async () => {
    const owner = realOwner(),
      prepared = await prepareUpload(owner, input());
    await deleteUploadedAsset(owner, prepared.assetId);
    expect((await listUploadedAssets(owner)).assets).toHaveLength(0);
    expect((await listUploadedAssets(owner)).usedBytes).toBe(20 * 1024 * 1024);
    expect(harness.removed).not.toHaveBeenCalled();
    // A retained external upload token may still create its object. The server
    // never exposes or confirms it, and scheduled cleanup removes it after expiry.
    harness.objects.set(stored(prepared.assetId).path, png);
    await expect(completeUpload(owner, prepared.assetId)).rejects.toThrow(
      "not found",
    );
    stored(prepared.assetId).expiresAt = new Date(Date.now() - 1).toISOString();
    expect(await cleanupExpiredAssets(owner)).toBe(1);
    expect(harness.objects.size).toBe(0);
    expect((await listUploadedAssets(owner)).usedBytes).toBe(0);
  });

  it("holds completed objects against token recreation and only serves approved product images", async () => {
    const owner = realOwner(),
      prepared = await prepareUpload(owner, input());
    harness.objects.set(stored(prepared.assetId).path, png);
    await completeUpload(owner, prepared.assetId);
    const product = harness.state!.catalog[0];
    product.image = `/api/assets/${prepared.assetId}`;
    product.imageApproved = false;
    expect(await resolveApprovedProductImage(owner, product)).toBeNull();
    product.imageApproved = true;
    expect(await resolveApprovedProductImage(owner, product)).toContain(
      "download=fixture",
    );
    expect(harness.signed).toHaveBeenCalledWith(
      "download",
      stored(prepared.assetId).path,
      300,
    );
    await expect(deleteUploadedAsset(owner, prepared.assetId)).rejects.toThrow(
      "catalog",
    );
    harness.state!.catalog[0].image = "";
    expect(await resolveApprovedProductImage(owner, product)).toBeNull();
    await deleteUploadedAsset(owner, prepared.assetId);
    expect(harness.objects.size).toBe(1);
    await expect(readUploadedAsset(owner, prepared.assetId)).rejects.toThrow(
      "not found",
    );
    stored(prepared.assetId).expiresAt = new Date(Date.now() - 1).toISOString();
    await cleanupExpiredAssets(owner);
    expect(harness.objects.size).toBe(0);
  });

  it("never creates public URLs for local private uploads or foreign products", async () => {
    const owner = localOwner(),
      product = harness.state!.catalog[0];
    expect(
      await resolveApprovedProductImage(owner, {
        ...product,
        businessId: demoActor("service").businessId,
      }),
    ).toBeNull();
    const prepared = await prepareUpload(owner, input());
    await putLocalUpload(
      owner,
      prepared.assetId,
      new Request("https://app.example.test", {
        method: "PUT",
        body: new Uint8Array(png),
      }),
    );
    await completeUpload(owner, prepared.assetId);
    harness.state!.catalog[0].image = `/api/assets/${prepared.assetId}`;
    expect(
      await resolveApprovedProductImage(owner, harness.state!.catalog[0]),
    ).toBeNull();
    expect(harness.signed).not.toHaveBeenCalled();
  });
});
