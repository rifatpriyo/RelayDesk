# ThreeUI reference provenance and adaptation

The build brief was supplied without its companion reference directory. The official public Community source was retrieved instead. The preserved upstream files in this directory are reference material, not executable application routes.

- Requested visual reference: https://threeui.com/hero/sylva/living-green#usage
- Official Community repository: https://github.com/MengTo/threeui
- Pinned revision: `68802d5428071ada5c20db8094b1649e6bb770ed`
- Retrieved: 24 October 2026.
- Original source path: `public/landing-pages/inner-green-3d.html`, preserved here as `public__landing-pages__inner-green-3d.html`.
- Pinned source: https://github.com/MengTo/threeui/blob/68802d5428071ada5c20db8094b1649e6bb770ed/public/landing-pages/inner-green-3d.html
- Original assets path: `public/landing-pages/inner-green-assets/`; local files preserved under `inner-green-assets/`.
- Original repository notices: `LICENSE`, `ASSET-LICENSES.md`, `FONT-LICENSES.md`, `THIRD_PARTY_NOTICES.md`, and `README.md` are preserved beside the source.

The Community release is MIT, copyright 2026 Meng To. Its `ASSET-LICENSES.md` distinguishes included Community assets from external catalog thumbnails and hosted media. RelayDesk does not hotlink hosted ThreeUI images, run the upstream HTML, or import the upstream global CSS. The separate standalone Sylva distribution had different reuse restrictions and was not used in the application. No claim is made to have obtained a supplied code export, companion prompt, or companion Skill.md.

## What was adapted

`src/components/marketing/living-scene.tsx` is a separately named, reduced Three.js implementation. Its seeded pseudo-random generator and light-facing moss placement concept derive from the preserved Community source. It replaces the reference's two dense canvases and custom material/shader effects with one lazy-loaded canvas, five explicit branch curves, 12,500 instanced low-polygon moss tufts, 216 fern leaves, and 60 dust points. It uses the installed Three.js package rather than executing the vendored older runtime. Upstream interaction, menu, controls, fonts, and styles are not copied into the application.

The reference's organic arch, ridge, restrained depth, floating navigation, atmospheric particles, and ivory cards inform RelayDesk's composition. All brand, product copy, navigation, five scroll chapters, sample conversations, plan descriptions, interactive controls, and calls to action were written for this application. The chapter samples are labeled and correspond to their text. No conservation claims, usage totals, or testimonials are carried across.

`public/scene/relay-root.svg` is original vector botanical fallback artwork. It is used on mobile, with reduced motion, during loading, after a failed Three.js import, and on WebGL creation/context failure. It is not an upstream image. The locally preserved upstream photos are reference-only and do not represent RelayDesk products. Catalog illustrations in `public/samples` are separately identified original sample art.

The original source's instructions and embedded content describe that source's own demonstration. They are not build instructions for RelayDesk. The user's request explicitly authorized a branded adaptation.
