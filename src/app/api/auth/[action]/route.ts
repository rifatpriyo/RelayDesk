import { cookies } from "next/headers";
import { z } from "zod";
import {
  createDemoSession,
  DEMO_COOKIE,
  requireSameOrigin,
  supabaseForRequest,
} from "@/lib/core/server";
import { errorResponse, json, rateLimit, readJson } from "@/lib/core/http";
import { invariant } from "@/lib/core/errors";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    requireSameOrigin(request);
    const { action } = await context.params;
    rateLimit(
      `auth:${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}:${action}`,
      15,
      60000,
    );
    if (action === "demo") {
      const { business } = z
        .object({ business: z.enum(["retail", "service"]).default("retail") })
        .parse(await readJson(request));
      const token = createDemoSession(business);
      (await cookies()).set(DEMO_COOKIE, token, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 86400,
      });
      return json({ redirect: "/workspace/overview", demo: true });
    }
    if (action === "logout") {
      (await cookies()).delete(DEMO_COOKIE);
      (await cookies()).delete("relaydesk_business");
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = await supabaseForRequest();
        await supabase.auth.signOut();
      }
      return json({ redirect: "/" });
    }
    const input = await readJson(request),
      supabase = await supabaseForRequest();
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url)
      .origin;
    if (action === "sign-in") {
      const { email, password } = z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(200),
        })
        .parse(input);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      invariant(
        !error,
        "SIGN_IN_FAILED",
        "Unable to sign in. Check your credentials and verify your email.",
        401,
      );
      (await cookies()).delete(DEMO_COOKIE);
      return json({ redirect: "/workspace/overview" });
    }
    if (action === "sign-up") {
      const { email, password, businessName } = z
        .object({
          email: z.string().email(),
          password: z.string().min(10).max(200),
          businessName: z.string().trim().min(2).max(100),
        })
        .parse(input);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: { business_name: businessName },
        },
      });
      invariant(
        !error,
        "SIGN_UP_FAILED",
        "Unable to create your account. Check the details or try again.",
        400,
      );
      if (data.session) (await cookies()).delete(DEMO_COOKIE);
      return json({
        redirect: data.session ? "/workspace/overview" : null,
        verificationRequired: !data.session,
        message: data.session
          ? "Your account is ready."
          : "Check your email to confirm your account before signing in.",
      });
    }
    if (action === "recover") {
      const { email } = z.object({ email: z.string().email() }).parse(input);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
      invariant(
        !error,
        "RECOVERY_FAILED",
        "Unable to request password recovery. Try again later.",
        503,
      );
      return json({
        message:
          "If this email has an account, a password recovery link has been sent.",
      });
    }
    if (action === "reset" || action === "update-password") {
      const { password } = z
        .object({ password: z.string().min(10).max(200) })
        .parse(input);
      const { data } = await supabase.auth.getUser();
      invariant(
        data.user,
        "AUTH_REQUIRED",
        "Open the recovery link from your email first.",
        401,
      );
      const { error } = await supabase.auth.updateUser({ password });
      invariant(
        !error,
        "RESET_FAILED",
        "Your password could not be updated. Request another recovery link.",
      );
      return json({
        message: "Password updated. You can sign in now.",
        redirect: "/login",
      });
    }
    return json(
      { error: "NOT_FOUND", message: "Unknown authentication action." },
      404,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
