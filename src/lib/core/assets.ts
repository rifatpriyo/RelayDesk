import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Actor, Product } from "./types";
import { invariant } from "./errors";
import {
  assertManager,
  readBusiness,
  transactBusiness,
  supabaseAdmin,
} from "./server";
import {
  fileAssets,
  FILE_MIMES,
  IMAGE_MIMES,
  SAMPLE_IMAGES,
  validateFileBytes,
  type FileAsset,
} from "./asset-policy";
import { planById } from "./plans";

const bucket = "business-files";
export const uploadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((v) => !/[\x00-\x1f\\/]/.test(v), "Use a plain filename."),
    mime: z.enum(FILE_MIMES as [string, ...string[]]),
    size: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
  })
  .strict();
function localPath(actor: Actor, id: string) {
  invariant(
    /^[0-9a-f-]{36}$/.test(id),
    "INVALID_ASSET",
    "Invalid asset identifier.",
  );
  return path.resolve(
    process.env.DEMO_DATA_DIR || path.join(process.cwd(), ".data", "demo"),
    "files",
    actor.businessId,
    id,
  );
}
function record(s: Awaited<ReturnType<typeof readBusiness>>, id: string) {
  const a = fileAssets(s).find(
    (v) => v.id === id && v.businessId === s.business.id,
  );
  invariant(
    a && a.status !== "deleted",
    "ASSET_NOT_FOUND",
    "This file was not found in your business.",
    404,
  );
  return a;
}
async function removeObject(actor: Actor, a: FileAsset) {
  if (actor.demo) {
    await rm(localPath(actor, a.id), { force: true });
    return;
  }
  const { error } = await supabaseAdmin().storage.from(bucket).remove([a.path]);
  invariant(
    !error,
    "STORAGE_ERROR",
    "Could not delete this file. Retry shortly.",
    503,
  );
}
export async function cleanupExpiredAssets(actor: Actor) {
  assertManager(actor);
  const before = await readBusiness(actor);
  let removed = 0;
  for (const stale of fileAssets(before).filter(
    (a) =>
      (a.status === "pending" || a.status === "deleted") &&
      new Date(a.expiresAt).getTime() <= Date.now(),
  ).slice(0, 20)) {
    await removeObject(actor, stale);
    await transactBusiness(actor, (s) => {
      s.integrations.fileAssets = fileAssets(s).filter(
        (a) => a.id !== stale.id,
      );
    });
    removed++;
  }
  return removed;
}
export async function prepareUpload(
  actor: Actor,
  input: z.infer<typeof uploadSchema>,
) {
  assertManager(actor);
  const value = uploadSchema.parse(input);
  const maxBytes = actor.demo
    ? 2 * 1024 * 1024
    : IMAGE_MIMES.includes(value.mime)
      ? 5 * 1024 * 1024
      : 20 * 1024 * 1024;
  invariant(
    value.size <= maxBytes,
    "UPLOAD_TOO_LARGE",
    `This upload is limited to ${maxBytes / 1024 / 1024} MB.`,
    413,
  );
  // Reclaim only after the provider's two-hour upload capability has expired.
  await cleanupExpiredAssets(actor);
  const reservedBytes = actor.demo ? maxBytes : 20 * 1024 * 1024; // Signed capability is bounded by the bucket's limit, not a client header.
  const id = randomUUID();
  const asset: FileAsset = {
    ...value,
    id,
    businessId: actor.businessId,
    reservedBytes,
    path: `${actor.businessId}/uploads/${id}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 3600000).toISOString(),
  };
  await transactBusiness(actor, (s) => {
    const assets = fileAssets(s),
      used = assets.reduce((sum, a) => sum + a.reservedBytes, 0);
    invariant(
      assets.length < 2500 &&
        used + reservedBytes <=
          planById(s.billing.subscription.planId).storageMb * 1024 * 1024,
      "STORAGE_LIMIT",
      "Your plan storage allowance is reached. Remove unused files or choose a higher plan.",
      409,
    );
    assets.push(asset);
  });
  try {
    if (actor.demo)
      return {
        assetId: id,
        maxBytes,
        upload: {
          url: `/api/assets/${id}`,
          method: "PUT",
          headers: { "Content-Type": value.mime },
        },
      };
    const { data, error } = await supabaseAdmin()
      .storage.from(bucket)
      .createSignedUploadUrl(asset.path, { upsert: false });
    invariant(
      data && !error,
      "STORAGE_ERROR",
      "Could not prepare a private upload. Try again.",
      503,
    );
    return {
      assetId: id,
      maxBytes,
      upload: {
        url: data.signedUrl,
        method: "PUT",
        headers: { "Content-Type": value.mime, "x-upsert": "false" },
      },
    };
  } catch (error) {
    await transactBusiness(actor, (s) => {
      s.integrations.fileAssets = fileAssets(s).filter((a) => a.id !== id);
    });
    throw error;
  }
}
async function bytesFor(actor: Actor, asset: FileAsset) {
  if (actor.demo) {
    try {
      return await readFile(localPath(actor, asset.id));
    } catch {
      throw new Error("Uploaded local file is unavailable");
    }
  }
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .download(asset.path);
  invariant(
    data && !error,
    "UPLOAD_NOT_READY",
    "Upload the file before confirming it.",
    409,
  );
  invariant(
    data.size <= 20 * 1024 * 1024,
    "UPLOAD_TOO_LARGE",
    "The stored file exceeds the upload limit.",
    413,
  );
  return Buffer.from(await data.arrayBuffer());
}
export async function putLocalUpload(
  actor: Actor,
  id: string,
  request: Request,
) {
  assertManager(actor);
  invariant(
    actor.demo,
    "DIRECT_UPLOAD_REQUIRED",
    "Use the signed direct upload URL.",
    400,
  );
  const a = record(await readBusiness(actor), id);
  invariant(
    a.status === "pending" && new Date(a.expiresAt).getTime() > Date.now(),
    "UPLOAD_EXPIRED",
    "Prepare a new upload.",
    409,
  );
  const declared = Number(request.headers.get("content-length"));
  invariant(
    !declared || declared <= 2 * 1024 * 1024,
    "UPLOAD_TOO_LARGE",
    "The local demo supports uploads up to 2 MB.",
    413,
  );
  const reader = request.body?.getReader();
  invariant(reader, "EMPTY_UPLOAD", "Choose a file.");
  const chunks: Buffer[] = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > 2 * 1024 * 1024) {
      await reader.cancel();
      invariant(
        false,
        "UPLOAD_TOO_LARGE",
        "The local demo supports uploads up to 2 MB.",
        413,
      );
    }
    chunks.push(Buffer.from(next.value));
  }
  const bytes = Buffer.concat(chunks);
  validateFileBytes(a, bytes);
  const target = localPath(actor, id);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const existing = await readFile(target);
      invariant(
        existing.equals(bytes),
        "UPLOAD_EXISTS",
        "This upload already contains a different file.",
        409,
      );
    } else throw error;
  }
}
export async function completeUpload(actor: Actor, id: string) {
  assertManager(actor);
  const a = record(await readBusiness(actor), id);
  invariant(
    a.status === "ready" || new Date(a.expiresAt).getTime() > Date.now(),
    "UPLOAD_EXPIRED",
    "Prepare a new upload.",
    409,
  );
  const bytes = await bytesFor(actor, a);
  validateFileBytes(a, bytes);
  await transactBusiness(actor, (s) => {
    const current = record(s, id);
    current.status = "ready";
    current.reservedBytes = bytes.length;
  });
  return {
    assetId: id,
    image: IMAGE_MIMES.includes(a.mime) ? `/api/assets/${id}` : null,
    asset: { id, name: a.name, mime: a.mime, size: bytes.length },
  };
}
export async function readUploadedAsset(actor: Actor, id: string) {
  const a = record(await readBusiness(actor), id);
  invariant(
    a.status === "ready",
    "UPLOAD_NOT_READY",
    "Confirm the upload first.",
    409,
  );
  const buffer = await bytesFor(actor, a);
  validateFileBytes(a, buffer);
  return { buffer, name: a.name, mime: a.mime };
}
export async function deleteUploadedAsset(actor: Actor, id: string) {
  assertManager(actor);
  const asset = await transactBusiness(actor, (s) => {
    const a = record(s, id);
    invariant(
      !s.catalog.some((p) => p.image === `/api/assets/${id}`),
      "ASSET_IN_USE",
      "Remove this image from catalog records before deleting it.",
      409,
    );
    a.status = "deleted";
    return { ...a };
  });
  // An unexpired upload capability could recreate a removed object. Keep the
  // inaccessible object (or its full pending reservation) until that link expires.
  if (actor.demo || new Date(asset.expiresAt).getTime() <= Date.now()) {
    await removeObject(actor, asset);
    await transactBusiness(actor, (s) => {
      s.integrations.fileAssets = fileAssets(s).filter((a) => a.id !== id);
    });
  }
}
export async function listUploadedAssets(actor: Actor) {
  const s = await readBusiness(actor);
  return {
    assets: fileAssets(s)
      .filter((a) => a.status !== "deleted")
      .map((a) => ({
        id: a.id,
        name: a.name,
        mime: a.mime,
        size: a.size,
        status: a.status,
        image: IMAGE_MIMES.includes(a.mime) ? `/api/assets/${a.id}` : null,
      })),
    usedBytes: fileAssets(s).reduce((sum, a) => sum + a.reservedBytes, 0),
    limitBytes: planById(s.billing.subscription.planId).storageMb * 1024 * 1024,
  };
}
export async function resolveApprovedProductImage(
  actor: Actor,
  product: Product,
): Promise<string | null> {
  if (
    product.businessId !== actor.businessId ||
    product.archived ||
    !product.imageApproved ||
    !product.image
  )
    return null;
  const state = await readBusiness(actor);
  const current = state.catalog.find(
    (p) =>
      p.id === product.id &&
      p.image === product.image &&
      p.imageApproved &&
      !p.archived,
  );
  if (!current) return null;
  if (SAMPLE_IMAGES.includes(current.image)) {
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    return origin ? new URL(current.image, origin).toString() : null;
  }
  const id = /^\/api\/assets\/([0-9a-f-]{36})$/.exec(current.image)?.[1];
  if (!id) return null;
  const a = record(state, id);
  if (a.status !== "ready" || !IMAGE_MIMES.includes(a.mime)) return null;
  if (actor.demo) return null; // Demo channels do not expose private local files publicly.
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(a.path, 300);
  invariant(
    data && !error,
    "STORAGE_ERROR",
    "Could not prepare the approved product image.",
    503,
  );
  return data.signedUrl;
}
