'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BREAK_INDEX, CHAIN_BLOCKS, MISMATCH_HASH } from './chainData';
import { makeHazardTexture, makeLabelTexture, resolveMonoFamily } from './hashTexture';
import type { ProgressStore } from './useScrollProgress';

// The evidence chain, scroll-scrubbed in three phases:
//   p 0.00–0.55  blocks assemble link by link
//   p 0.55–0.75  connectors close the chain
//   p 0.75–1.00  the payoff — block 5's recomputed hash mismatches, a hazard
//                fracture rises between 4 and 5, downstream greys out
//
// Hex literals map to design/tokens.css (WebGL cannot read CSS vars):
//   #10151b --ink-900 faces · #48586a --ink-500 edges · #2e3a46 --ink-600
//   connectors · #6e8093 --sig-unmonitored downstream grey

const N = CHAIN_BLOCKS.length;
const PITCH = 2.2;
const BLOCK_X = (i: number) => (i - (N - 1) / 2) * PITCH;
const FRACTURE_X = (BLOCK_X(BREAK_INDEX - 1) + BLOCK_X(BREAK_INDEX)) / 2;
const CHAIN_HALF = BLOCK_X(N - 1) + 1.9; // half-extent incl. block + margin
const FOV_TAN = Math.tan((35 * Math.PI) / 180 / 2);

const EDGE_INK = new THREE.Color('#48586a');
const CONN_INK = new THREE.Color('#2e3a46');
const GREY = new THREE.Color('#6e8093');
const WHITE = new THREE.Color('#ffffff');

const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

// Shared geometry, created once per chunk load. This module lives exclusively
// in the ssr:false lazy chunk, so module scope only ever evaluates in the
// browser; never disposed (the scene exists once, on the landing page).
const BOX_GEOM = new THREE.BoxGeometry(1.7, 0.95, 0.5);
const GEOM = {
  box: BOX_GEOM,
  edges: new THREE.EdgesGeometry(BOX_GEOM),
  label: new THREE.PlaneGeometry(1.5, 0.375),
  conn: new THREE.BoxGeometry(PITCH - 1.7, 0.07, 0.07),
  fract: new THREE.PlaneGeometry(0.22, 1.6),
};

interface TextureSet {
  labels: THREE.CanvasTexture[];
  mismatch: THREE.CanvasTexture;
  hazard: THREE.CanvasTexture;
}

export function HashChain({ progress }: { progress: ProgressStore }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const faceMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const edgeMats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const labelMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const connMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const conns = useRef<(THREE.Mesh | null)[]>([]);
  const fracture = useRef<THREE.Mesh | null>(null);
  const fractureMat = useRef<THREE.MeshBasicMaterial | null>(null);
  const textures = useRef<TextureSet | null>(null);
  const camX = useRef(0);

  // Labels arrive once the page's own IBM Plex Mono is ready; until then the
  // label planes stay face-coloured (invisible against the block).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const family = await resolveMonoFamily();
      if (cancelled) return;
      const labels = CHAIN_BLOCKS.map((b) => makeLabelTexture(b.kind, b.hash, family));
      const breakBlock = CHAIN_BLOCKS[BREAK_INDEX];
      const mismatch = makeLabelTexture(
        breakBlock ? breakBlock.kind : '',
        MISMATCH_HASH,
        family,
        '#c22b1f', // --sig-alert: the recomputed hash that no longer matches
      );
      const hazard = makeHazardTexture();
      hazard.repeat.set(1, 7);
      textures.current = { labels, mismatch, hazard };
      labels.forEach((tex, i) => {
        const m = labelMats.current[i];
        if (m) {
          m.map = tex;
          m.color.copy(WHITE);
          m.needsUpdate = true;
        }
      });
      const fm = fractureMat.current;
      if (fm) {
        fm.map = hazard;
        fm.color.copy(WHITE);
        fm.needsUpdate = true;
      }
    })();
    return () => {
      cancelled = true;
      const t = textures.current;
      if (t) {
        t.labels.forEach((tex) => tex.dispose());
        t.mismatch.dispose();
        t.hazard.dispose();
        textures.current = null;
      }
    };
  }, []);

  useFrame((state) => {
    const p = progress.get();
    const t = state.clock.elapsedTime;
    const q = smoothstep((p - 0.75) / 0.25); // payoff

    // --- blocks -------------------------------------------------------------
    for (let i = 0; i < N; i++) {
      const g = groups.current[i];
      const face = faceMats.current[i];
      const edge = edgeMats.current[i];
      const label = labelMats.current[i];
      if (!g || !face || !edge || !label) continue;

      // block 1 anchors the empty runway; the rest assemble across p 0–0.55
      const start = i === 0 ? -0.08 : (i * 0.55) / N;
      const a = smoothstep((p - start) / 0.08);
      g.visible = a > 0.001;
      const drift = a >= 1 ? Math.sin(t * 0.5 + i * 1.3) * 0.02 : 0;
      g.position.set(BLOCK_X(i), (1 - a) * -1.2 + drift, 0);
      g.rotation.x = (1 - a) * 0.5;
      face.opacity = a;
      edge.opacity = a;

      if (i >= BREAK_INDEX) {
        // downstream of the break: grey to --sig-unmonitored, never red
        edge.color.lerpColors(EDGE_INK, GREY, q);
        label.color.lerpColors(WHITE, GREY, q);
        label.opacity = a * (1 - 0.35 * q);
      } else {
        label.opacity = a;
      }
    }

    // the tampered block's hash swaps to its recomputed (mismatching) value —
    // assigned per-frame from q so scrubbing backwards restores it
    const breakLabel = labelMats.current[BREAK_INDEX];
    const tex = textures.current;
    if (breakLabel && tex) {
      const want = q > 0.02 ? tex.mismatch : (tex.labels[BREAK_INDEX] ?? null);
      if (breakLabel.map !== want) {
        breakLabel.map = want;
        breakLabel.needsUpdate = true;
      }
    }

    // --- connectors ---------------------------------------------------------
    for (let i = 0; i < N - 1; i++) {
      const c = conns.current[i];
      const m = connMats.current[i];
      if (!c || !m) continue;
      const s = smoothstep((p - (0.55 + (i * 0.2) / (N - 1))) / 0.033);
      c.visible = s > 0.001;
      c.scale.x = Math.max(0.001, s);
      const severed = i === BREAK_INDEX - 1;
      m.opacity = severed ? s * (1 - q) : s;
      if (i >= BREAK_INDEX) m.color.lerpColors(CONN_INK, GREY, q * 0.6);
    }

    // --- the fracture: hazard tape across the broken link --------------------
    const f = fracture.current;
    const fm = fractureMat.current;
    if (f && fm) {
      f.visible = q > 0.001;
      f.scale.y = Math.max(0.001, q);
      fm.opacity = q;
    }

    // --- camera: fit wide viewports, travel narrow ones ----------------------
    const aspect = state.size.width / Math.max(1, state.size.height);
    const fitZ = CHAIN_HALF / (FOV_TAN * aspect);
    const baseZ = Math.min(16, Math.max(9, fitZ));
    const travelling = fitZ > baseZ + 0.01;
    let targetX = 0;
    if (travelling) {
      if (p < 0.55) targetX = BLOCK_X(0) + (p / 0.55) * (BLOCK_X(N - 1) - BLOCK_X(0));
      else if (p < 0.75) targetX = BLOCK_X(N - 1) + ((p - 0.55) / 0.2) * (FRACTURE_X - BLOCK_X(N - 1));
      else targetX = FRACTURE_X;
    } else {
      targetX = FRACTURE_X * 0.35 * q;
    }
    camX.current += (targetX - camX.current) * 0.08;
    const z = baseZ - 1.5 * q;
    const orbit = 0.35 * Math.sin(p * Math.PI);
    state.camera.position.set(camX.current + orbit, 1.1, z);
    state.camera.lookAt(camX.current, 0, 0);
  });

  return (
    <group>
      {CHAIN_BLOCKS.map((b, i) => (
        <group
          key={b.seq}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh geometry={GEOM.box}>
            <meshBasicMaterial
              ref={(m) => {
                faceMats.current[i] = m;
              }}
              color="#10151b"
              transparent
              opacity={0}
            />
          </mesh>
          <lineSegments geometry={GEOM.edges}>
            <lineBasicMaterial
              ref={(m) => {
                edgeMats.current[i] = m;
              }}
              color="#48586a"
              transparent
              opacity={0}
            />
          </lineSegments>
          <mesh geometry={GEOM.label} position={[0, 0, 0.252]}>
            <meshBasicMaterial
              ref={(m) => {
                labelMats.current[i] = m;
              }}
              color="#10151b"
              transparent
              opacity={0}
            />
          </mesh>
        </group>
      ))}

      {CHAIN_BLOCKS.slice(0, -1).map((b, i) => (
        <mesh
          key={`c${b.seq}`}
          geometry={GEOM.conn}
          position={[BLOCK_X(i) + PITCH / 2, 0, 0]}
          visible={false}
          ref={(el) => {
            conns.current[i] = el;
          }}
        >
          <meshBasicMaterial
            ref={(m) => {
              connMats.current[i] = m;
            }}
            color="#2e3a46"
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      <mesh
        geometry={GEOM.fract}
        position={[FRACTURE_X, 0, 0.05]}
        rotation={[0, 0, -0.12]}
        visible={false}
        ref={fracture}
      >
        <meshBasicMaterial
          ref={fractureMat}
          color="#0a0e12"
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}
