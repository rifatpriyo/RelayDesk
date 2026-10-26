import type { BusinessState } from "./types";
import { invariant } from "./errors";

export type FileAsset = {
  id: string;
  businessId: string;
  name: string;
  mime: string;
  size: number;
  reservedBytes: number;
  path: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "ready" | "deleted";
};
export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
export const FILE_MIMES = [
  ...IMAGE_MIMES,
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export const SAMPLE_IMAGES = [
  "/samples/panjabi.svg",
  "/samples/tote.svg",
  "/samples/kurti.svg",
  "/samples/scarf.svg",
  "/samples/service.svg",
];
export function fileAssets(s: BusinessState): FileAsset[] {
  return (s.integrations.fileAssets ??= []) as FileAsset[];
}
export function assertCatalogImage(s: BusinessState, image: string) {
  if (!image || SAMPLE_IMAGES.includes(image)) return;
  const match = /^\/api\/assets\/([0-9a-f-]{36})$/.exec(image);
  const asset = match && fileAssets(s).find((a) => a.id === match[1]);
  invariant(
    asset &&
      asset.businessId === s.business.id &&
      asset.status === "ready" &&
      IMAGE_MIMES.includes(asset.mime),
    "INVALID_IMAGE",
    "Use a verified image uploaded to this business. External image URLs are not accepted.",
  );
}
export function validateFileBytes(
  asset: Pick<FileAsset, "mime" | "size">,
  bytes: Buffer,
) {
  invariant(
    bytes.length === asset.size && bytes.length > 0,
    "UPLOAD_SIZE_MISMATCH",
    "The uploaded file size does not match. Upload it again.",
    400,
  );
  let valid = false;
  if (asset.mime === "image/png")
    valid =
      bytes.length >= 24 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString("ascii", 12, 16) === "IHDR" &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0 &&
      bytes.readUInt32BE(16) * bytes.readUInt32BE(20) <= 40_000_000;
  else if (asset.mime === "image/jpeg")
    valid =
      bytes.length > 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes[bytes.length - 2] === 255 &&
      bytes[bytes.length - 1] === 217;
  else if (asset.mime === "image/webp")
    valid =
      bytes.length >= 16 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
  else if (asset.mime === "application/pdf")
    valid = bytes.subarray(0, 5).toString() === "%PDF-";
  else if (
    asset.mime ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    valid =
      bytes.length >= 4 &&
      bytes[0] === 80 &&
      bytes[1] === 75 &&
      bytes[2] === 3 &&
      bytes[3] === 4;
  else if (FILE_MIMES.includes(asset.mime)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      valid = !bytes.includes(0);
    } catch {
      valid = false;
    }
  }
  invariant(
    valid,
    "INVALID_FILE_CONTENT",
    "This file does not match its supported content type, or the image is too large to display safely.",
    400,
  );
}
