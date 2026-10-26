import { test, expect } from "@playwright/test";
import path from "node:path";

test("owner can import, publish knowledge, test, take over, and complete simulated checkout", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore workspace" }).first().click();
  await expect(
    page.getByRole("heading", { name: "A good day for good conversations." }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-overview.png`,
    fullPage: true,
  });
  await page.goto("/workspace/sources");
  if (info.project.name === "mobile") {
    await expect(
      page
        .locator("select[name=sourceId] option")
        .filter({ hasText: "Replace catalog.csv" }),
    ).toHaveCount(1);
    await page
      .locator("select[name=sourceId]")
      .selectOption({ label: "Replace catalog.csv" });
  }
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("public/samples/catalog.csv"));
  await page.getByRole("button", { name: "Upload for review" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Olive Linen Shirt", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve & import" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/workspace/catalog");
  await expect(
    page.getByRole("heading", { name: "Olive Linen Shirt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Browser sample ${info.project.name}`);
  await page
    .getByLabel("SKU or stable identifier")
    .fill(`PW-${info.project.name}-${Date.now()}`);
  await page.getByLabel("Price in BDT").fill("975.50");
  await page.getByRole("spinbutton", { name: /^Stock/ }).fill("7");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("heading", {
        name: `Browser sample ${info.project.name}`,
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.goto("/workspace/knowledge");
  await page.getByRole("button", { name: "Add answer" }).click();
  await page
    .getByLabel("Question or title")
    .fill(`Packaging ${info.project.name}`);
  await page
    .getByLabel("Your approved answer")
    .fill(
      "Our packaging is recyclable paper. Ask the team about gift wrapping.",
    );
  await page
    .getByRole("combobox", { name: "Availability", exact: true })
    .selectOption("published");
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/workspace/playground");
  await page
    .getByRole("textbox", { name: "Test question" })
    .fill("LIN-OLV price koto?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("1,290");
  await expect(
    page.getByText("Deterministic demo", { exact: true }),
  ).toBeVisible();
  await page.goto("/workspace/inbox");
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Mehedi Hasan", exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mehedi Hasan", exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Reply to Mehedi Hasan" })
    .fill("Our team will help with your exchange.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.locator(".message-bubble").last()).toHaveText(
    "Our team will help with your exchange.",
  );
  await page.goto("/workspace/billing");
  const growth = page
    .locator(".plan")
    .filter({ has: page.getByRole("heading", { name: /Growth/ }) });
  await expect(growth).toBeVisible();
  if (
    (await growth
      .getByRole("button", { name: "Your current plan" })
      .count()) === 0
  ) {
    await growth.getByRole("button", { name: "Try simulated plan" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "No money will be charged",
    );
    await page.getByRole("button", { name: "Simulate success" }).click();
    await expect(page.getByRole("dialog")).toContainText("succeeded");
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Growth plan", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-billing.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile navigation, keyboard dialog and honest missing-provider states work", async ({
  page,
}, info) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore workspace" }).last().click();
  await expect(
    page.getByRole("heading", { name: "A good day for good conversations." }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Channels", exact: true })
      .click();
  } else
    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Channels", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Connect Messenger", exact: true })
    .click();
  await expect(page.locator(".feedback.error")).toBeVisible();
  await expect(page.locator(".feedback.error")).toContainText(
    /demo|configur|operator/i,
  );
  await page.goto("/workspace/catalog");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
});

test("HTTP authorization rejects cross-origin and cross-business mutations", async ({
  playwright,
}, info) => {
  test.skip(
    info.project.name === "mobile",
    "HTTP authorization is independent of viewport; exercised once on desktop.",
  );
  const a = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
    extraHTTPHeaders: { origin: "http://127.0.0.1:3100" },
  });
  const b = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
    extraHTTPHeaders: { origin: "http://127.0.0.1:3100" },
  });
  expect(
    (await a.post("/api/auth/demo", { data: { business: "retail" } })).ok(),
  ).toBe(true);
  expect(
    (await b.post("/api/auth/demo", { data: { business: "service" } })).ok(),
  ).toBe(true);
  const sa = await (await a.get("/api/workspace")).json(),
    sb = await (await b.get("/api/workspace")).json();
  expect(sa.workspace.business.id).not.toBe(sb.workspace.business.id);
  const foreign = await a.post("/api/workspace", {
    data: { action: "catalog.delete", id: sb.workspace.catalog[0].id },
  });
  expect(foreign.status()).toBe(404);
  const csrf = await a.post("/api/workspace", {
    headers: { origin: "https://untrusted.example" },
    data: { action: "settings.publish" },
  });
  expect(csrf.status()).toBe(403);
  const expired = await a.post("/api/workspace", {
    headers: { "x-csrf-token": "tampered" },
    data: { action: "settings.publish" },
  });
  expect(expired.status()).toBe(403);
  await a.dispose();
  await b.dispose();
});
