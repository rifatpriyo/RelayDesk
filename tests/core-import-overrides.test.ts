import { beforeEach, expect, it, vi } from "vitest";
import type { Actor, BusinessState } from "../src/lib/core/types";
import { demoActor, seedBusiness } from "../src/lib/core/seed";
import { executeCommand } from "../src/lib/core/commands";

const memory = vi.hoisted(() => ({
  state: undefined as BusinessState | undefined,
}));
vi.mock("../src/lib/core/server", () => ({
  assertManager: (actor: Actor) => {
    if (actor.role === "agent") throw new Error("manager required");
  },
  readBusiness: async (actor: Actor) => {
    if (memory.state?.business.id !== actor.businessId)
      throw new Error("tenant denied");
    return structuredClone(memory.state);
  },
  transactBusiness: async <T>(
    actor: Actor,
    callback: (state: BusinessState) => T | Promise<T>,
  ) => {
    if (memory.state?.business.id !== actor.businessId)
      throw new Error("tenant denied");
    const draft = structuredClone(memory.state),
      result = await callback(draft);
    memory.state = draft;
    return result;
  },
  supabaseAdmin: vi.fn(),
}));
import { createImport, publishImport } from "../src/lib/integrations/service";

beforeEach(() => {
  memory.state = seedBusiness("retail");
});

it("keeps owner-edited image and SKU plus existing overrides through a source replacement", async () => {
  const actor = demoActor();
  const rows = [
    {
      id: "stable-item",
      sku: "SOURCE-SKU",
      name: "Imported tote",
      price: "490",
      currency: "BDT",
      stock: "24",
      image: "/samples/tote.svg",
    },
  ];
  const batch = await createImport(actor, rows, "catalog.csv", "csv");
  await publishImport(actor, batch.id);
  const item = memory.state!.catalog.find(
    (product) => product.sourceRecordId === "stable-item",
  )!;
  item.overrides = ["description", "variant"];
  executeCommand(memory.state!, actor, {
    action: "catalog.save",
    product: {
      id: item.id,
      name: item.name,
      description: "Owner's approved description",
      sku: "OWNER-SKU",
      priceMinor: item.priceMinor,
      stock: item.stock,
      image: "/samples/scarf.svg",
      imageApproved: true,
      attributes: item.attributes,
      variants: item.variants,
      freshnessHours: item.freshnessHours,
    },
  });
  const saved = memory.state!.catalog.find(
    (product) => product.id === item.id,
  )!;
  expect(saved.overrides).toContain("variant");
  const replacement = await createImport(
    actor,
    [
      {
        ...rows[0],
        sku: "NEW-SOURCE-SKU",
        image: "/samples/kurti.svg",
        stock: "11",
      },
    ],
    "catalog.csv",
    "csv",
    batch.sourceId,
    true,
  );
  await publishImport(actor, replacement.id);
  const result = memory.state!.catalog.find(
    (product) => product.id === item.id,
  )!;
  expect(result).toMatchObject({
    sku: "OWNER-SKU",
    image: "/samples/scarf.svg",
    imageApproved: true,
    sourceId: batch.sourceId,
    sourceRecordId: "stable-item",
  });
  expect(
    memory.state!.catalog.filter(
      (product) => product.sourceRecordId === "stable-item",
    ),
  ).toHaveLength(1);
});
