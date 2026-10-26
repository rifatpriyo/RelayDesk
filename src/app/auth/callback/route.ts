import { supabaseForRequest } from "@/lib/core/server";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    requested = url.searchParams.get("next") || "/workspace/overview";
  const next =
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes("\\")
      ? requested
      : "/workspace/overview";
  if (code) {
    try {
      const client = await supabaseForRequest();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(new URL(next, url.origin), {
          headers: { "Cache-Control": "private, no-store" },
        });
    } catch {
      /* Render a recoverable state without exposing provider errors. */
    }
  }
  return NextResponse.redirect(
    new URL("/login?error=verification", url.origin),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
