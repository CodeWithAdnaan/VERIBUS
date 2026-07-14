'use client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type MapCanvas from './MapCanvas';

// Leaflet is client-only — load MapCanvas with ssr:false so it never runs on the server.
const MapCanvasDynamic = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-ops border border-ink-700 text-12 text-ink-500">
      Loading map…
    </div>
  ),
});

export function MapView(props: ComponentProps<typeof MapCanvas>) {
  return <MapCanvasDynamic {...props} />;
}
