"use client";
import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "./provider";
import { Badge, Dialog } from "@/components/ui";

export function BusinessSwitcher() {
  const { request, busy, notify } = useWorkspace();
  const [data, setData] = useState<{
    memberships: { businessId: string; name: string; role: string }[];
    currentBusinessId: string;
  } | null>(null);
  useEffect(() => {
    request<typeof data>("/api/workspace/memberships")
      .then(setData)
      .catch(() => {});
  }, [request]);
  if (!data || data.memberships.length < 2) return null;
  return (
    <section className="panel panel-pad" style={{ marginBottom: 24 }}>
      <label className="label">
        Current business
        <select
          className="input"
          value={data.currentBusinessId}
          disabled={busy}
          onChange={async (event) => {
            try {
              await request("/api/workspace/memberships", {
                businessId: event.target.value,
              });
              location.href = "/workspace/overview";
            } catch {
              notify(
                "Unable to switch business. Your current workspace is still open.",
                true,
              );
            }
          }}
        >
          {data.memberships.map((member) => (
            <option key={member.businessId} value={member.businessId}>
              {member.name} · {member.role}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

type UploadedFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  status: string;
};
export function WorkspaceFiles() {
  const { request, busy, actor, notify } = useWorkspace();
  const [data, setData] = useState<{
    assets: UploadedFile[];
    usedBytes: number;
    limitBytes: number;
  } | null>(null);
  const [removing, setRemoving] = useState<UploadedFile | null>(null);
  const reload = useCallback(
    () => request<NonNullable<typeof data>>("/api/assets").then(setData),
    [request],
  );
  useEffect(() => {
    void reload().catch(() => {});
  }, [reload]);
  if (!data) return null;
  return (
    <section className="panel" style={{ marginTop: 25 }}>
      <div className="panel-head">
        <div>
          <h2>Private files</h2>
          <p>
            {(data.usedBytes / 1024 / 1024).toFixed(1)} of{" "}
            {(data.limitBytes / 1024 / 1024).toFixed(0)} MB reserved or stored.
          </p>
        </div>
        <button
          className="button ghost small"
          onClick={() => void reload().catch(() => {})}
        >
          Refresh files
        </button>
      </div>
      {data.assets.length ? (
        data.assets.map((file) => (
          <div className="row-item" key={file.id}>
            <div className="grow">
              <h3>{file.name}</h3>
              <p>
                {Math.ceil(file.size / 1024)} KB · {file.mime}
              </p>
            </div>
            <Badge tone="neutral">{file.status}</Badge>
            <button
              className="button ghost small"
              disabled={busy || actor.role === "agent"}
              aria-label={`Delete file ${file.name}`}
              onClick={() => setRemoving(file)}
            >
              Delete
            </button>
          </div>
        ))
      ) : (
        <p className="small-text muted" style={{ padding: "0 22px 20px" }}>
          Uploaded images and documents appear here. Catalog images stay private
          until you approve customer delivery.
        </p>
      )}
      <p className="small-text muted" style={{ padding: "0 22px 20px" }}>
        Remove image references from catalog records before deleting their
        files. Published knowledge is managed separately in Business knowledge.
        Pending upload reservations expire automatically.
      </p>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this private file?"
        description={`The stored file ${removing?.name || ""} will be removed. Published knowledge entries are managed separately.`}
      >
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setRemoving(null)}
          >
            Keep file
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (!removing) return;
              try {
                await request("/api/assets", {
                  action: "delete",
                  assetId: removing.id,
                });
                setRemoving(null);
                await reload();
                notify("Private file deleted.");
              } catch {}
            }}
          >
            Delete file
          </button>
        </div>
      </Dialog>
    </section>
  );
}
