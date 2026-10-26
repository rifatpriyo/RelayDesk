"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "motion/react";
import type * as Three from "three";

/** RelayDesk adaptation of the MIT ThreeUI Community Sylva scene.
 * Seeded noise and the light-facing moss concept derive from Meng To's source.
 * See references/threeui/REFERENCE_NOTES.md and LICENSE. No upstream styles run.
 */
export function LivingScene() {
  const host = useRef<HTMLDivElement>(null);
  const narrative = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const { scrollYProgress } = useScroll({
    target: narrative,
    offset: ["start start", "end end"],
  });
  useEffect(
    () =>
      scrollYProgress.on("change", (value) => {
        progress.current = value;
        narrative.current?.style.setProperty(
          "--card-drift",
          `${Math.sin(value * Math.PI * 3) * 9}px`,
        );
      }),
    [scrollYProgress],
  );

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 767px)");
    let disposed = false;
    let stop: (() => void) | undefined;
    // Useful server HTML and the local fallback are painted before loading 3D.
    const timer = window.setTimeout(async () => {
      if (media.matches || mobile.matches || disposed) return;
      let THREE: typeof Three;
      try {
        THREE = await import("three");
      } catch {
        element.dataset.scene = "fallback";
        return;
      }
      if (disposed) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
      } catch {
        element.dataset.scene = "fallback";
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      element.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
      camera.position.set(0, 0.6, 15.5);
      const world = new THREE.Group();
      scene.add(world);
      scene.add(new THREE.HemisphereLight(0xe8f1c5, 0x18271c, 2.1));
      const light = new THREE.DirectionalLight(0xf7f2c9, 3.2);
      light.position.set(-4, 8, 6);
      scene.add(light);
      const edge = new THREE.DirectionalLight(0xa3c984, 1.2);
      edge.position.set(5, 2, -2);
      scene.add(edge);
      const materials: Three.Material[] = [];
      const geometries: Three.BufferGeometry[] = [];
      const material = (color: number) => {
        const m = new THREE.MeshStandardMaterial({ color, roughness: 0.96 });
        materials.push(m);
        return m;
      };
      const bark = material(0x6b6542);
      const mossMat = material(0x657b3b);
      const leafMat = material(0x829557);
      let seed = 0x3f9a1c7b;
      const random = () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const curves: { curve: Three.CatmullRomCurve3; radius: number }[] = [];
      function branch(points: number[][], radius: number) {
        const curve = new THREE.CatmullRomCurve3(
          points.map(
            (p) => new THREE.Vector3(...(p as [number, number, number])),
          ),
        );
        const geometry = new THREE.TubeGeometry(curve, 48, radius, 7, false);
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i),
            y = position.getY(i),
            z = position.getZ(i);
          const rough =
            Math.sin(x * 15 + y * 6) * 0.025 + Math.cos(y * 21 + z * 10) * 0.02;
          position.setXYZ(i, x + rough, y + rough, z + rough);
        }
        geometry.computeVertexNormals();
        geometries.push(geometry);
        world.add(new THREE.Mesh(geometry, bark));
        curves.push({ curve, radius });
      }
      // Root arch and a low ridge replace the reference's two separate canvases.
      branch(
        [
          [-5, -2.4, -0.3],
          [-3.7, -1.6, 0.2],
          [-2.4, -0.6, 0],
          [-1.8, 1.1, -0.5],
          [-0.8, 2.5, -0.8],
          [0.7, 2.65, -0.6],
          [2.2, 1.6, -0.2],
          [3.1, -0.6, 0.4],
          [5, -1.5, 0.8],
        ],
        0.28,
      );
      branch(
        [
          [-5, -2.8, 1],
          [-3, -2.25, 1.5],
          [-1.5, -2.6, 1.1],
          [0.2, -2.15, 1.3],
          [2, -2.45, 1.5],
          [4.8, -1.7, 0.6],
        ],
        0.25,
      );
      branch(
        [
          [-2.2, -0.2, -0.1],
          [-3.1, 0.7, -0.2],
          [-3.65, 1.05, -0.3],
          [-4.4, 0.98, -0.4],
        ],
        0.09,
      );
      branch(
        [
          [2.9, -0.2, 0.3],
          [3.7, 0.4, 0.1],
          [4.1, 1, 0.1],
        ],
        0.08,
      );
      branch(
        [
          [-0.3, 2.68, -0.7],
          [0.5, 3.1, -0.5],
          [1.5, 3.2, -0.6],
        ],
        0.07,
      );
      const tuftGeo = new THREE.ConeGeometry(0.035, 0.16, 3);
      tuftGeo.translate(0, 0.07, 0);
      geometries.push(tuftGeo);
      const tuftCount = 12500;
      const tufts = new THREE.InstancedMesh(tuftGeo, mossMat, tuftCount);
      const dummy = new THREE.Object3D();
      const normal = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const color = new THREE.Color();
      for (let i = 0; i < tuftCount; i++) {
        const limb = curves[Math.floor(random() * curves.length)];
        const t = random(),
          point = limb.curve.getPoint(t);
        const theta = random() * Math.PI * 2;
        const tangent = limb.curve.getTangent(t);
        const side = new THREE.Vector3()
          .crossVectors(tangent, new THREE.Vector3(0, 0, 1))
          .normalize();
        normal
          .copy(side)
          .multiplyScalar(Math.cos(theta))
          .addScaledVector(new THREE.Vector3(0, 0, 1), Math.sin(theta))
          .normalize();
        if (normal.y < -0.25) normal.y = Math.abs(normal.y);
        normal.normalize();
        const lump =
          1 + 0.15 * Math.sin(point.x * 7 + point.y * 9) + random() * 0.1;
        dummy.position.copy(point).addScaledVector(normal, limb.radius * lump);
        dummy.quaternion.setFromUnitVectors(up, normal);
        dummy.rotateY(random() * Math.PI);
        dummy.scale.setScalar(0.65 + random() * 1.6);
        dummy.updateMatrix();
        tufts.setMatrixAt(i, dummy.matrix);
        color.setHSL(
          0.205 + random() * 0.045,
          0.28 + random() * 0.18,
          0.18 + random() * 0.13,
        );
        tufts.setColorAt(i, color);
      }
      world.add(tufts);
      // A few fern fronds add identifiable foliage without expensive textures.
      const leafGeo = new THREE.SphereGeometry(1, 6, 4);
      geometries.push(leafGeo);
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 216);
      let leafIndex = 0;
      for (let fern = 0; fern < 6; fern++) {
        const base = curves[fern % 2].curve.getPoint(0.12 + fern * 0.14);
        const bend = fern % 2 ? -1 : 1;
        for (let j = 0; j < 18; j++)
          for (const direction of [-1, 1]) {
            const t = j / 18;
            dummy.position
              .copy(base)
              .add(
                new THREE.Vector3(
                  bend * t * 0.4 + direction * (0.25 - t * 0.19),
                  0.3 + t * 0.95,
                  0.15,
                ),
              );
            dummy.rotation.set(
              0.3,
              direction * 0.4,
              direction * -0.55 + bend * -0.3,
            );
            dummy.scale.set(0.21 * (1 - t * 0.7), 0.045, 0.055);
            dummy.updateMatrix();
            leaves.setMatrixAt(leafIndex++, dummy.matrix);
          }
      }
      world.add(leaves);
      const dustGeo = new THREE.BufferGeometry();
      geometries.push(dustGeo);
      const dustPosition = new Float32Array(60 * 3);
      for (let i = 0; i < dustPosition.length; i++)
        dustPosition[i] = (random() - 0.5) * 11;
      dustGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(dustPosition, 3),
      );
      const dustMat = new THREE.PointsMaterial({
        color: 0xd8dfb0,
        size: 0.025,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      materials.push(dustMat);
      const dust = new THREE.Points(dustGeo, dustMat);
      scene.add(dust);
      let frame = 0,
        visible = true,
        lost = false,
        last = 0;
      let pointerX = 0,
        pointerY = 0;
      function resize() {
        const bounds = element!.getBoundingClientRect();
        renderer.setSize(bounds.width, bounds.height, false);
        camera.aspect = bounds.width / bounds.height;
        camera.updateProjectionMatrix();
      }
      function render(now: number) {
        frame = 0;
        if (
          disposed ||
          !visible ||
          document.hidden ||
          lost ||
          media.matches ||
          mobile.matches
        )
          return;
        frame = requestAnimationFrame(render);
        if (now - last < 1000 / 30) return;
        last = now;
        world.rotation.y +=
          (pointerX * 0.07 + progress.current * 0.18 - world.rotation.y) * 0.04;
        world.rotation.x += (pointerY * 0.025 - world.rotation.x) * 0.04;
        world.position.y = -0.2 + Math.sin(progress.current * Math.PI) * 0.25;
        dust.rotation.y = now * 0.000012;
        renderer.render(scene, camera);
        element!.dataset.scene = "ready";
      }
      const start = () => {
        if (!frame && !disposed) frame = requestAnimationFrame(render);
      };
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else cancelAnimationFrame(frame);
        if (!visible) frame = 0;
      });
      observer.observe(element);
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(element);
      const onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else start();
      };
      const onPointer = (event: PointerEvent) => {
        if (!matchMedia("(pointer:fine)").matches) return;
        pointerX = Math.max(
          -1,
          Math.min(1, (event.clientX / innerWidth) * 2 - 1),
        );
        pointerY = Math.max(
          -1,
          Math.min(1, (event.clientY / innerHeight) * 2 - 1),
        );
      };
      const onLoss = (event: Event) => {
        event.preventDefault();
        lost = true;
        cancelAnimationFrame(frame);
        frame = 0;
        element.dataset.scene = "fallback";
      };
      const onRestore = () => {
        lost = false;
        start();
      };
      const onMotion = () => {
        if (media.matches || mobile.matches) {
          cancelAnimationFrame(frame);
          frame = 0;
          element.dataset.scene = "fallback";
        } else start();
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pointermove", onPointer, { passive: true });
      renderer.domElement.addEventListener("webglcontextlost", onLoss);
      renderer.domElement.addEventListener("webglcontextrestored", onRestore);
      media.addEventListener("change", onMotion);
      mobile.addEventListener("change", onMotion);
      resize();
      start();
      stop = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        resizeObserver.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointer);
        media.removeEventListener("change", onMotion);
        mobile.removeEventListener("change", onMotion);
        renderer.domElement.removeEventListener("webglcontextlost", onLoss);
        renderer.domElement.removeEventListener(
          "webglcontextrestored",
          onRestore,
        );
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        tufts.dispose();
        leaves.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }, 300);
    return () => {
      disposed = true;
      clearTimeout(timer);
      stop?.();
    };
  }, []);

  return (
    <div
      className="living-scene"
      ref={(element) => {
        host.current = element;
        narrative.current =
          element?.closest<HTMLElement>(".marketing-narrative") ?? null;
      }}
      aria-hidden="true"
      data-scene="fallback"
    >
      <img
        className="scene-fallback"
        src="/scene/relay-root.svg"
        alt=""
        width="1100"
        height="850"
      />
    </div>
  );
}
