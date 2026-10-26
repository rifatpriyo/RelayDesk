"use client";
import { useState } from "react";
import { Brand } from "@/components/ui";
import Link from "next/link";
export default function Reset() {
  const [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const r = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: f.get("password") }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.message || v.error);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reset password");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="demo-page">
      <Brand />
      <div
        className="panel panel-pad"
        style={{ maxWidth: 440, margin: "40px auto" }}
      >
        <h1>Choose a new password.</h1>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {done ? (
          <>
            <p>Your password has been updated.</p>
            <Link className="button" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <label className="label">
              New password
              <input
                className="input"
                type="password"
                name="password"
                minLength={10}
                maxLength={200}
                required
                autoComplete="new-password"
              />
              <small>
                At least 10 characters. Open this page using your emailed
                recovery link.
              </small>
            </label>
            <button className="button" disabled={busy}>
              Update password
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
