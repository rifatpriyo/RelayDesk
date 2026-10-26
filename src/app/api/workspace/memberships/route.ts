import { z } from "zod";
import {
  availableMemberships,
  getRequestContext,
  requireSameOrigin,
  selectBusiness,
} from "@/lib/core/server";
import { errorResponse, json, readJson, rateLimit } from "@/lib/core/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    const actor = await getRequestContext();
    return json({
      memberships: await availableMemberships(actor),
      currentBusinessId: actor.businessId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await getRequestContext();
    requireSameOrigin(request, actor);
    rateLimit(`switch:${actor.userId}`, 30);
    const { businessId } = z
      .object({ businessId: z.string().uuid() })
      .strict()
      .parse(await readJson(request));
    await selectBusiness(actor, businessId);
    return json({ redirect: "/workspace/overview" });
  } catch (error) {
    return errorResponse(error);
  }
}
