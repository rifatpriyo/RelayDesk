import { FatalError } from "workflow";
import {
  prepareInbound,
  generateInbound,
  deliverResponse,
} from "@/lib/integrations/pipeline";
import { readBusiness, serviceActor } from "@/lib/core/server";
import { integrationState } from "@/lib/integrations/types";

async function prepare(businessId: string, jobId: string) {
  "use step";
  return prepareInbound(businessId, jobId);
}
prepare.maxRetries = 2;
async function generate(businessId: string, jobId: string) {
  "use step";
  await generateInbound(businessId, jobId);
}
// External inference ambiguity is durably accounted for, never blindly retried.
generate.maxRetries = 0;
async function deliver(businessId: string, jobId: string) {
  "use step";
  const state = await readBusiness(serviceActor(businessId));
  const job = integrationState(state).inbox.find((item) => item.id === jobId);
  if (!job) throw new FatalError("Persisted message job no longer exists.");
  await deliverResponse(businessId, job.responseId);
}
deliver.maxRetries = 0;
export async function inboundMessageWorkflow(
  businessId: string,
  jobId: string,
) {
  "use workflow";
  if (await prepare(businessId, jobId)) {
    await generate(businessId, jobId);
    await deliver(businessId, jobId);
  }
}
async function deliverStaff(businessId: string, responseId: string) {
  "use step";
  await deliverResponse(businessId, responseId);
}
deliverStaff.maxRetries = 0;
export async function outboundMessageWorkflow(
  businessId: string,
  responseId: string,
) {
  "use workflow";
  await deliverStaff(businessId, responseId);
}
