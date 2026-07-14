'use client';

import { Canvas } from '@react-three/fiber';
import { HashChain } from './HashChain';
import type { ProgressStore } from './useScrollProgress';

// The lazy chunk boundary: three.js enters the bundle only through this
// module's dynamic import in ChainCanvas. Default export for next/dynamic.
//
// frameloop: 'always' only while the runway is on screen (ambient drift +
// scroll scrub); 'demand' with no invalidate() calls otherwise — offscreen
// means zero rAF work. DPR capped at 1.5: projector/battery budget.
export default function HashChainScene({
  progress,
  visible,
  onReady,
}: {
  progress: ProgressStore;
  visible: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={visible ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      camera={{ fov: 35, position: [0, 1.1, 9] }}
      onCreated={onReady}
      aria-hidden
    >
      <HashChain progress={progress} />
    </Canvas>
  );
}
