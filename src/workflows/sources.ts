import { syncSource, publishImport } from "@/lib/integrations/service";
import { readBusiness, serviceActor } from "@/lib/core/server";
import { integrationState } from "@/lib/integrations/types";
async function synchronize(businessId: string, sourceId: string) {
  "use step";
  const actor = serviceActor(businessId),
    before = await readBusiness(actor),
    source = integrationState(before).sources.find(
      (item) => item.id === sourceId,
    );
  const { batch } = await syncSource(actor, sourceId);
  // Only a previously approved mapping can publish unattended; row errors retain a review batch.
  if (source?.mapping && batch.status === "review" && !batch.errors.length)
    await publishImport(actor, batch.id, false);
}
synchronize.maxRetries = 0;
export async function sourceSyncWorkflow(businessId: string, sourceId: string) {
  "use workflow";
  await synchronize(businessId, sourceId);
}
