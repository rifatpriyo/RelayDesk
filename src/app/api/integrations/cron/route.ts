import { start } from "workflow/api";
import { listBusinessIds, readBusiness, serviceActor } from "@/lib/core/server";
import { integrationState } from "@/lib/integrations/types";
import { IntegrationError, equalSecret } from "@/lib/integrations/security";
import { apiError } from "@/lib/integrations/http";
import { sourceSyncWorkflow } from "@/workflows/sources";
import { maintainBusiness } from "@/lib/integrations/pipeline";
import { cleanupExpiredAssets } from "@/lib/core/assets";
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (
      !secret ||
      !equalSecret(
        request.headers.get("authorization") || "",
        `Bearer ${secret}`,
      )
    )
      throw new IntegrationError("cron_auth", "Unauthorized.", 401);
    let started = 0;
    const ids = await listBusinessIds();
    if (ids.length > 100)
      throw new IntegrationError(
        "cron_partition_required",
        "Partition the scheduler before exceeding 100 businesses.",
        503,
      );
    for (const id of ids) {
      await maintainBusiness(id);
      await cleanupExpiredAssets(serviceActor(id));
      const state = await readBusiness(serviceActor(id));
      for (const source of integrationState(state).sources) {
        if (started >= 20) break;
        if (
          source.id === "google-authorization" ||
          !["mysql", "postgresql", "google_sheets"].includes(source.kind) ||
          source.status !== "connected" ||
          !source.mapping
        )
          continue;
        const age = Date.now() - Date.parse(source.lastSuccess || "1970-01-01");
        if (age < Math.max(60, source.syncMinutes) * 60_000) continue;
        await start(sourceSyncWorkflow, [id, source.id]);
        started++;
      }
    }
    return Response.json({
      started,
      maintained: ids.length,
      notice:
        "Bounded maintenance and source scheduler. Ambiguous sends require operator reconciliation; sources without approved mappings remain in review.",
    });
  } catch (error) {
    return apiError(error);
  }
}
