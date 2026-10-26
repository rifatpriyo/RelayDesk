"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { WorkspaceResponse, PublicWorkspace } from "@/lib/core/types";
import Link from "next/link";

type Context = WorkspaceResponse & {
  refresh: () => Promise<void>;
  command: (action: string, data?: Record<string, unknown>) => Promise<unknown>;
  request: <T = Record<string, unknown>>(
    url: string,
    body?: unknown,
  ) => Promise<T>;
  busy: boolean;
  notify: (message: string, error?: boolean) => void;
};
const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceResponse | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(
      null,
    );
  const notify = useCallback(
    (text: string, error = false) => setFeedback({ text, error }),
    [],
  );
  const refresh = useCallback(async () => {
    const res = await fetch("/api/workspace", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok)
      throw new Error(
        json.message || json.error || "Unable to open your workspace",
      );
    setData(json);
    setError("");
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 6500);
    return () => clearTimeout(timer);
  }, [feedback]);
  const request = useCallback(
    async <T,>(url: string, body?: unknown): Promise<T> => {
      setBusy(true);
      try {
        const form = body instanceof FormData;
        const res = await fetch(url, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            ...(form ? {} : { "Content-Type": "application/json" }),
            "x-csrf-token": data?.csrfToken || "",
          },
          body:
            body === undefined ? undefined : form ? body : JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok)
          throw new Error(
            result.message ||
              (typeof result.error === "string"
                ? result.error
                : "The operation could not be completed. Please check your details."),
          );
        return result as T;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Something went wrong", true);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [data?.csrfToken, notify],
  );
  const command = useCallback(
    async (action: string, values: Record<string, unknown> = {}) => {
      const result = await request<{
        workspace?: PublicWorkspace;
        result: unknown;
      }>("/api/workspace", { action, ...values });
      if (result.workspace)
        setData((old) =>
          old ? { ...old, workspace: result.workspace! } : old,
        );
      return result.result;
    },
    [request],
  );
  if (error)
    return (
      <main className="demo-page">
        <h1>Let’s open your workspace.</h1>
        <div className="notice error" role="alert">
          {error}
        </div>
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <Link className="button" href="/login">
            Sign in
          </Link>
          <Link className="button secondary" href="/demo">
            Try the demo
          </Link>
          <button
            className="button secondary"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Retry
          </button>
        </div>
      </main>
    );
  if (!data)
    return (
      <main aria-busy="true" aria-label="Loading workspace">
        <div className="loading-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      </main>
    );
  return (
    <WorkspaceContext.Provider
      value={{ ...data, refresh, command, request, busy, notify }}
    >
      {children}
      {feedback && (
        <div
          className={`feedback ${feedback.error ? "error" : ""}`}
          role={feedback.error ? "alert" : "status"}
        >
          {feedback.text}
          <button
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}
