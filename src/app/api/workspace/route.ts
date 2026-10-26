import {
  getRequestContext,
  readBusiness,
  transactBusiness,
  requireSameOrigin,
  deleteBusinessAssets,
  resolveTeamMember,
} from "@/lib/core/server";
import { commandSchema, executeCommand } from "@/lib/core/commands";
import { errorResponse, json, rateLimit, readJson } from "@/lib/core/http";
import { PLANS } from "@/lib/core/plans";
import type { Actor, BusinessState } from "@/lib/core/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function payload(s: BusinessState, actor: Actor) {
  const { integrations: _, ...workspace } = s;
  const { csrfToken, service: __, ...publicActor } = actor;
  return { workspace, actor: publicActor, csrfToken, plans: PLANS };
}
export async function GET() {
  try {
    const actor = await getRequestContext();
    return json(payload(await readBusiness(actor), actor));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await getRequestContext(request);
    requireSameOrigin(request, actor);
    rateLimit(`workspace:${actor.userId}:${actor.businessId}`, 120);
    const input = commandSchema.parse(await readJson(request));
    const resolved =
      input.action === "team.add"
        ? await resolveTeamMember(actor, input.email)
        : undefined;
    if (input.action === "business.delete") {
      const s = await readBusiness(actor);
      executeCommand(structuredClone(s), actor, input);
      await deleteBusinessAssets(actor);
    }
    const result = await transactBusiness(actor, (draft) =>
      executeCommand(draft, actor, input, new Date(), resolved),
    );
    if (input.action === "business.delete")
      return json({ result, deleted: true });
    return json({ ...payload(await readBusiness(actor), actor), result });
  } catch (error) {
    return errorResponse(error);
  }
}
