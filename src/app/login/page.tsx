"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Brand } from "@/components/ui";
import { Leaf } from "@phosphor-icons/react";
export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup" | "recover">("signin"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("mode");
    if (requested === "signup" || requested === "recover") setMode(requested);
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch(
        `/api/auth/${mode === "signin" ? "sign-in" : mode === "signup" ? "sign-up" : mode}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(data)),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || result.error);
      if (mode === "signin") location.href = "/workspace/overview";
      else setMessage(result.message || "Check your email for the next step.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <h1>
            Your business,
            <br />
            ready to reply.
          </h1>
          <p>
            A thoughtful home for every customer conversation. Built around what
            makes your business yours.
          </p>
        </div>
        <small>RelayDesk · A living system for conversations</small>
        <Leaf className="auth-leaf" weight="duotone" />
      </section>
      <section className="auth-form-area">
        <div className="auth-form">
          <h1>
            {mode === "signin"
              ? "Welcome back."
              : mode === "signup"
                ? "Make room for growth."
                : "Let’s get you back in."}
          </h1>
          <p className="small-text">
            {mode === "signin"
              ? "Sign in to your business workspace."
              : mode === "signup"
                ? "Create an account and build your first assistant."
                : "We’ll email a secure link to reset your password."}
          </p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              {message}
            </div>
          )}
          <form className="form-stack" onSubmit={submit}>
            {mode === "signup" && (
              <label className="label">
                Business name
                <input
                  className="input"
                  name="businessName"
                  required
                  maxLength={120}
                />
              </label>
            )}
            <label className="label">
              Email address
              <input
                className="input"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            {mode !== "recover" && (
              <label className="label">
                Password
                <input
                  className="input"
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={10}
                  required
                />
              </label>
            )}
            <button className="button" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send recovery email"}
            </button>
          </form>
          <div className="auth-links">
            <button
              className="text-link"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError("");
                setMessage("");
              }}
            >
              {mode === "signup"
                ? "Already have an account?"
                : "Create an account"}
            </button>
            <button
              className="text-link"
              onClick={() => {
                setMode(mode === "recover" ? "signin" : "recover");
                setError("");
                setMessage("");
              }}
            >
              {mode === "recover" ? "Back to sign in" : "Forgot password?"}
            </button>
          </div>
          <p
            className="small-text"
            style={{ marginTop: 32, textAlign: "center" }}
          >
            Just looking around?{" "}
            <Link className="text-link" href="/demo">
              Try the demo
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
