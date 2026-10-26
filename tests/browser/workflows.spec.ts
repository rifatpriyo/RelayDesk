import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:3100";
async function enter(page: Page, business = "retail") {
  const response = await page.request.post("/api/auth/demo", {
    headers: { origin },
    data: { business },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/workspace/overview");
  await expect(
    page.getByRole("heading", { name: "A good day for good conversations." }),
  ).toBeVisible();
}

test("private catalog image and existing-account team workflows persist", async ({
  page,
  playwright,
}, info) => {
  await enter(page, "service");
  const state = await (await page.request.get("/api/workspace")).json();
  if (state.workspace.billing.subscription.planId !== "growth") {
    const checkout = await (
      await page.request.post("/api/workspace", {
        headers: { origin },
        data: { action: "billing.checkout", planId: "growth" },
      })
    ).json();
    const paid = await page.request.post("/api/workspace", {
      headers: { origin },
      data: {
        action: "billing.result",
        checkoutId: checkout.result.id,
        eventId: crypto.randomUUID(),
        result: "succeeded",
      },
    });
    expect(paid.ok()).toBe(true);
  }
  await page.goto("/workspace/settings");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const email = `browser-${info.project.name}@example.test`;
  await page.getByLabel("Member email").fill(email);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add member", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const member = page.getByRole("row").filter({ hasText: email });
  await expect(member).toBeVisible();
  await page.reload();
  await member.getByRole("button", { name: /Remove/ }).click();
  await page
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await expect(member).not.toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /^Currency/ }),
  ).toBeDisabled();

  await page.goto("/workspace/catalog");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const title = `Private image ${info.project.name}`;
  await page.getByLabel("Name", { exact: true }).fill(title);
  await page
    .getByLabel("SKU or stable identifier")
    .fill(`IMG-${info.project.name}-${Date.now()}`);
  await page.getByLabel("Price in BDT").fill("500");
  await page
    .getByLabel("Upload catalog image", { exact: false })
    .setInputFiles({
      name: "catalog-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHxkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(
    page.getByRole("textbox", { name: /^Image reference/ }),
  ).toHaveValue(/^\/api\/assets\//);
  await page.getByLabel("Approve this image for customer replies").check();
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  const image = page.getByRole("img", { name: title, exact: true });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(
      (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
    ),
  ).toBe(true);
  const imageUrl = (await image.getAttribute("src"))!;
  const other = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  await other.post("/api/auth/demo", { data: { business: "retail" } });
  expect((await other.get(imageUrl)).status()).toBe(404);
  await other.dispose();
});

test("website visitor can request staff and receive an inbox reply", async ({
  page,
  context,
}) => {
  await enter(page, "service");
  await page.goto("/workspace/channels");
  await page.getByRole("button", { name: "Configure widget" }).click();
  await page
    .getByRole("textbox", { name: "Widget title", exact: true })
    .fill("Service team chat");
  await page
    .getByRole("textbox", { name: /Allowed website origins/ })
    .fill(origin);
  await page.getByLabel("Activate website replies").check();
  await page.getByRole("button", { name: "Save widget settings" }).click();
  const link = page.getByRole("link", { name: "Open widget preview" });
  await expect(link).toBeVisible();
  const visitor = await context.newPage();
  await visitor.goto((await link.getAttribute("href"))!);
  await expect(
    visitor.getByRole("heading", { name: "Service team chat" }),
  ).toBeVisible();
  await visitor
    .getByRole("textbox", { name: "Your message" })
    .fill("Can I speak to a person?");
  await visitor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(visitor.getByRole("status")).toContainText(
    "team has been notified",
  );
  await page.goto("/workspace/inbox");
  await page.getByRole("button", { name: "Website", exact: true }).click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: /^Website visitor/ }) })
    .last()
    .click();
  const reply = `Our service team is here to help. ${Date.now()}`;
  await page
    .getByRole("textbox", { name: "Reply to Website visitor" })
    .fill(reply);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText(reply);
  await visitor.bringToFront();
  await expect(visitor.getByLabel("Conversation")).toContainText(reply, {
    timeout: 20000,
  });
  await visitor.close();
});

test("scheduled changes and assistant draft publication survive reload", async ({
  page,
}, info) => {
  await enter(page);
  await page.goto("/workspace/rules");
  await page.getByRole("button", { name: "Add change", exact: true }).click();
  const title = `Warehouse closure ${info.project.name}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Starts at, with timezone")
    .fill("2028-01-10T00:00:00+06:00");
  await page
    .getByLabel("Ends at, with timezone")
    .fill("2028-01-12T09:00:00+06:00");
  await page
    .getByLabel("Dispatch resumes (optional)")
    .fill("2028-01-12T09:00:00+06:00");
  await page
    .getByLabel("What customers should know")
    .fill(
      "Our warehouse is closed for stocktaking. Dispatch resumes on 12 January.",
    );
  await page.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto("/workspace/assistant");
  const before = await (await page.request.get("/api/workspace")).json();
  const tone =
    before.workspace.settings.published.tone === "concise"
      ? "professional"
      : "concise";
  await page
    .getByRole("combobox", { name: "How should it sound?" })
    .selectOption(tone);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const draft = await (await page.request.get("/api/workspace")).json();
  expect(draft.workspace.settings.published.tone).toBe(
    before.workspace.settings.published.tone,
  );
  expect(draft.workspace.settings.draft.tone).toBe(tone);
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.getByRole("button", { name: "Publish saved draft" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  expect(
    (await (await page.request.get("/api/workspace")).json()).workspace.settings
      .published.tone,
  ).toBe(tone);
  await page.goto("/workspace/onboarding");
  const mark = page.getByRole("button", { name: "Mark current step reviewed" });
  if (await mark.count()) await mark.click();
  await page.reload();
  expect(
    (await (await page.request.get("/api/workspace")).json()).workspace.business
      .onboardingStep,
  ).toBeGreaterThan(0);
});
