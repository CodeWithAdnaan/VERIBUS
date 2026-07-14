'use client';

import * as THREE from 'three';

// Hash labels rasterized to CanvasTextures with the page's own IBM Plex Mono
// (self-hosted by next/font) — WebGL cannot read CSS, so the family is resolved
// from the --font-plex-mono variable at runtime. Monospace means the tabular-
// numeral requirement is satisfied by construction.
//
// Hex literals map to design/tokens.css (CSS vars are unreachable in WebGL):
//   #10151b = --ink-900 (block face) · #6e8093 = --ink-400 (kind label)
//   #c7d1da = --ink-200 (hash)       · #c22b1f = --sig-alert (mismatch hash)
//   #0a0e12 = --ink-950 (hazard ground)

let monoFamily: string | null = null;

export async function resolveMonoFamily(): Promise<string> {
  if (monoFamily) return monoFamily;
  await document.fonts.ready;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-plex-mono')
    .trim();
  monoFamily = v !== '' ? v : 'ui-monospace, monospace';
  return monoFamily;
}

export function makeLabelTexture(
  kind: string,
  hash: string,
  family: string,
  hashColor = '#c7d1da',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#10151b';
    ctx.fillRect(0, 0, 512, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6e8093';
    ctx.font = `400 26px ${family}`;
    ctx.fillText(kind, 256, 34);
    ctx.fillStyle = hashColor;
    ctx.font = `500 44px ${family}`;
    ctx.fillText(hash, 256, 84);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The --hazard pattern as a texture: 45° #c22b1f / #0a0e12 stripes.
// Tamper is a pattern, not a colour — no glow.
export function makeHazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0a0e12';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#c22b1f';
    ctx.lineWidth = 18;
    for (let x = -128; x <= 256; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 140);
      ctx.lineTo(x + 140, 0);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
