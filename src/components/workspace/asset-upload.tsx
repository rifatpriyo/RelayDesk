"use client";

import { useState } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { useWorkspace } from "./provider";

export function CatalogImageUpload({
  onUploaded,
  onBusy,
}: {
  onUploaded: (image: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { request, actor, notify } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify("Choose a PNG, JPEG, or WebP image.", true);
      return;
    }
    const limit = actor.demo ? 2_000_000 : 5_000_000;
    if (file.size > limit) {
      notify(`Images must be smaller than ${limit / 1_000_000} MB.`, true);
      return;
    }
    setUploading(true);
    onBusy(true);
    try {
      const prepared = await request<{
        assetId: string;
        upload: {
          url: string;
          method: string;
          headers: Record<string, string>;
        };
      }>("/api/assets", {
        action: "prepare",
        name: file.name,
        mime: file.type,
        size: file.size,
      });
      const response = await fetch(prepared.upload.url, {
        method: prepared.upload.method,
        headers: prepared.upload.headers,
        body: file,
        credentials: prepared.upload.url.startsWith("/")
          ? "same-origin"
          : "omit",
      });
      if (!response.ok)
        throw new Error("The upload failed. Please retry with the same image.");
      const result = await request<{ image: string }>("/api/assets", {
        action: "complete",
        assetId: prepared.assetId,
      });
      onUploaded(result.image);
      notify(
        "Image uploaded privately. Approve it for customer replies before saving.",
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "The image could not be uploaded.",
        true,
      );
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }
  return (
    <label className="label wide">
      <span>
        <UploadSimple
          size={15}
          style={{ verticalAlign: "middle", marginRight: 6 }}
        />
        Upload catalog image
      </span>
      <input
        className="input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading || actor.role === "agent"}
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <small role="status">
        {uploading
          ? "Uploading and checking image…"
          : `PNG, JPEG, or WebP, up to ${actor.demo ? 2 : 5} MB. Private until approved for customer delivery.`}
      </small>
    </label>
  );
}
