# RelayDesk design and motion

Reading this as a SaaS landing page for Bangladesh small-business owners, with calm botanical depth and a practical, light workspace. The visual metaphor is a living system for customer conversations.

The installed `design-taste-frontend` skill was read and applied to marketing, with DESIGN_VARIANCE 7, MOTION_INTENSITY 6, and VISUAL_DENSITY 4. The user brief takes precedence where it specifies a visible scroll cue, exact headline/support copy, ivory product cards, five sequential chapters, and the Sylva reference. The workspace follows a denser product interface rather than applying the landing-page skill to data tables and multi-step workflows.

## Identity and source

Marketing uses deep forest `#192c22`, warm ivory `#f1f1df`, and pale jade `#b6d6a3`. Ivory sample cards provide contrast without changing the page theme. The light workspace uses charcoal, paper, and dark jade. Lexend and Noto Sans Bengali are locally bundled through Fontsource with fallbacks. Phosphor supplies the icon family. The project-owned Button adapts shadcn/ui's Radix Slot pattern; dialogs use Radix. Native selects and details remain semantic and keyboard-operable.

The official ThreeUI Community source and notices are preserved under `references/threeui`. See [reference provenance](../references/threeui/REFERENCE_NOTES.md) for the pinned revision, assets, licensing distinction, and exact adaptation. No hosted ThreeUI embed, remote scene media, private source, or original global stylesheet is loaded by the application.

## Five-chapter narrative

1. Connect: four equal channels become one inbox; official account approval and explicit activation are explained.
2. Knowledge: a small spreadsheet becomes approved catalog data; unknown stock remains unknown and supported source limits are stated.
3. Style: a grounded Banglish product answer includes an original sample image and price; optional extra guidance appears in a disclosure.
4. Changes: an owner-created 5–8 June 2027 sample dispatch pause expires at 00:00 on 9 June in Asia/Dhaka. It is explicitly a shop policy rather than a claim about couriers.
5. Growth: an unsupported custom request is handed to staff, with automatic replies paused.

One CSS-sticky desktop scene is bounded by the hero/narrative container. The chapters and their examples remain ordinary server-rendered DOM in document order, so the matching sample travels with its chapter. Motion's `useScroll` tracks the bounded narrative. It drives subtle scene depth and a maximum nine-pixel example drift without state updates per frame. An IntersectionObserver updates the chapter navigation and branch emphasis. The scene is not the content: copy remains selectable, accessible, and useful before hydration or with failed JavaScript. Wheel, touch, keyboard, and browser scrolling are never intercepted. Anchors and Skip animation are real links.

Mobile stacks every chapter and uses the original SVG scene instead of loading Three.js. Reduced-motion mode removes pinning, parallax, transitional movement, and decorative loops while preserving every example and control. A WebGL failure or context loss retains the fallback and all calls to action.

## Rendering bounds and cleanup

Three.js is imported 300ms after initial useful HTML is painted, only on desktop without reduced motion. Device pixel ratio is capped at 1.5, antialiasing is off, and rendering is capped at 30fps. Geometry is instanced rather than mounting separate per-chapter scenes. The loop pauses offscreen and in hidden tabs. Fine-pointer response is bounded and affects only decorative geometry; controls remain stationary. Cleanup disconnects observers/listeners, cancels frames, and disposes geometry, materials, instance buffers, and the renderer.

The SVG is intentionally lightweight and does not require a bitmap download. Source geometry and texture budgets are drastically lower than the original reference. This is not a pixel-identical renderer or a performance benchmark of the source.

## Honest interaction and accessibility

Marketing examples are illustrative, local responses. Language, reply style, question selection, FAQs, anchors, demo links, and account links are real controls. The interactive section states that it sends no AI requests or customer messages. The actual signed-in playground performs the configured provider request. Plans are provisional and checkout is explicitly simulated. No fabricated customer totals, conversion increases, testimonials, or Meta partnership claims are present.

Touch targets, visible focus, semantic buttons, labels, headings, and readable text are provided. Functional labels are at least 12px, conversation examples and mobile body copy are 14px, and mobile selects are 16px. Chapter links scroll inside their own horizontal navigation on narrow screens. No content depends on hovering. Marketing prices and allowance values match the server plan table. The workspace is the destination for real setup actions rather than placing credentials or implementation diagnostics on marketing.

## Verification

Executed review on 25 October 2026: all eight marketing browser scenarios passed across desktop and mobile projects, including a tablet viewport capture. The normal desktop capture rendered the Three.js scene; forced WebGL failure and reduced-motion tests retained working content and links. Desktop, tablet, mobile hero, and mobile chapter screenshots were inspected for typography, spacing, overlap, and clipping. No field performance guarantee is implied.

`tests/browser/marketing.spec.ts` covers desktop/mobile overflow, reduced motion, unavailable WebGL, keyboard scrolling, working demo/skip links, chapter anchor synchronization, sample language/tone changes, handover, and FAQ expansion. Root acceptance runs these with the shared Playwright configuration; see `docs/BUILD_STATUS.md` for final executed results rather than treating this test inventory as a pass claim.

Typography, spacing, cards, mobile stacking, and fallback appearance should be checked in the recorded desktop/mobile screenshots. The root validation workflow saves screenshots under `test-results/`. No field Core Web Vitals measurements or tests on physical low-end Android devices have been performed. Browser automation and geometry budgets do not establish an LCP/INP guarantee; measure those after connecting the final production origin and real device traffic.

The initial desktop/mobile full-page fallback captures were visually reviewed on 24 October 2026. The review increased small-label typography and control sizes, preserved spaces where mobile headings remove line breaks, and bounded tablet headline sizing. A dedicated normal-motion, tablet, and mobile-detail capture test records the renderer's actual ready/fallback state and confirms that navigation removes the scene canvas.

API references checked during implementation: installed Next.js `use-client.md`, https://motion.dev/docs/react-use-scroll and https://motion.dev/docs/react-use-motion-value-event through Context7. Exact package versions are recorded in `package-lock.json`.
