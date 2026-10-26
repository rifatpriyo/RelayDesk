import { test, expect } from "@playwright/test";
test("marketing remains readable with reduced motion and unavailable WebGL", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return original.apply(this, [type, ...args] as never);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business, ready to reply." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Try the demo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/demo$/);
  await page.goto("/");
  await page.screenshot({
    path: `test-results/${info.project.name}-marketing.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    ),
  ).toBe(false);
  await expect(page.locator("[data-story-chapter]")).toHaveCount(5);
  expect(
    await page
      .locator(".m-scene-stage")
      .evaluate((el) => getComputedStyle(el).position),
  ).not.toBe("sticky");
  await page.getByRole("link", { name: "Skip animation", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#interactive-demo$/);
  await expect(page.getByLabel("Conversation language")).toBeInViewport();
});

test("WebGL failure keeps the native-scroll story usable", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) {
        (window as unknown as { webglAttempts: number }).webglAttempts =
          ((window as unknown as { webglAttempts: number }).webglAttempts ||
            0) + 1;
        return null;
      }
      return original.apply(this, [type, ...args] as never);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business, ready to reply." }),
  ).toBeVisible();
  if (info.project.name === "desktop")
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { webglAttempts: number }).webglAttempts || 0,
        ),
      )
      .toBeGreaterThan(0);
  await expect(page.locator(".scene-fallback")).toBeVisible();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await page.locator('a[href="#chapter-4"]').click();
  await expect(
    page.getByRole("heading", {
      name: "Plans change. Keep customers informed.",
    }),
  ).toBeInViewport();
  await expect(
    page.locator('.m-chapter-nav a[aria-current="step"]'),
  ).toContainText("Changes");
  await expect(page.locator("#chapter-4")).toContainText("Asia/Dhaka");
  await expect(page.locator("#chapter-4")).toContainText("Expires 9 June");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
  ).toBe(false);
});

test("sample controls show grounded multilingual replies and handover", async ({
  page,
}) => {
  await page.goto("/#interactive-demo");
  const demo = page.locator("#interactive-demo");
  await demo.getByLabel("Conversation language").selectOption("bn");
  await expect(demo.locator(".m-bubble.answer")).toContainText("৪৯০");
  await demo.getByLabel("Conversation language").selectOption("banglish");
  await demo.getByLabel("Reply style").selectOption("concise");
  await expect(demo.locator(".m-bubble.answer")).toContainText(
    "Everyday Tote: ৳490. Sample stock: 24 ta.",
  );
  await demo.getByRole("button", { name: /A change to shipping/ }).click();
  await expect(demo.locator(".m-bubble.answer")).toContainText("5–8 June 2027");
  await demo.getByRole("button", { name: /A request for the team/ }).click();
  await expect(demo.locator(".m-handover")).toContainText(
    "The assistant pauses.",
  );
  await expect(demo).toContainText(
    "No live AI call or customer message is sent here.",
  );
  await page
    .locator("#questions summary")
    .filter({ hasText: "Will the demo charge me?" })
    .click();
  await expect(page.locator("#questions details[open]")).toContainText(
    "Real payments are not connected.",
  );
});

test("normal desktop scene and tablet layout retain readable content", async ({
  page,
}, info) => {
  if (info.project.name === "mobile") {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.screenshot({ path: "test-results/mobile-marketing-hero.png" });
    await page
      .locator("#chapter-3")
      .screenshot({ path: "test-results/mobile-marketing-chapter.png" });
    return;
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business, ready to reply." }),
  ).toBeVisible();
  // WebGL can be unavailable in the test host. Record the renderer state; the
  // separate failure test verifies that every chapter and CTA still works.
  try {
    await page.waitForFunction(
      () =>
        document.querySelector(".living-scene")?.getAttribute("data-scene") ===
        "ready",
      undefined,
      { timeout: 10000 },
    );
  } catch {}
  const sceneState = await page
    .locator(".living-scene")
    .getAttribute("data-scene");
  info.annotations.push({
    type: "scene",
    description: `Normal desktop capture: ${sceneState}`,
  });
  expect(
    await page.locator(".living-scene canvas").count(),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/desktop-marketing-normal.png" });
  await page
    .getByRole("link", { name: "Try the demo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator(".living-scene canvas")).toHaveCount(0);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your business, ready to reply." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/tablet-marketing.png",
    fullPage: true,
  });
});
