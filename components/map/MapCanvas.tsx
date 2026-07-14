'use client';
import 'leaflet/dist/leaflet.css';
import { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

export type LatLng = [number, number];
export interface TraceSegment {
  kind: 'normal' | 'overspeed' | 'deviation' | 'unmonitored';
  coords: LatLng[];
}
export interface MapStop {
  seq: number;
  name: string;
  lat: number;
  lng: number;
}
export interface BusMarker {
  lat: number;
  lng: number;
  heading?: number | null;
  ageSec?: number;
}

const CARTO = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

const SEG_STYLE: Record<TraceSegment['kind'], { color: string; weight: number; dash?: string }> = {
  normal: { color: '#1F6FEB', weight: 4 },
  overspeed: { color: '#C22B1F', weight: 6 },
  deviation: { color: '#B26A00', weight: 5 },
  unmonitored: { color: '#6E8093', weight: 4, dash: '4 8' },
};

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useMemo(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points).pad(0.15));
    }
  }, [map, points]);
  return null;
}

function busIcon(ageSec: number | undefined, heading: number | null | undefined): L.DivIcon {
  const stale = (ageSec ?? 0) > 60;
  const rot = heading ?? 0;
  const fill = stale ? '#6E8093' : '#1F6FEB';
  const halo = stale ? '' : `<circle cx="16" cy="16" r="14" fill="${fill}" opacity="0.25"><animate attributeName="opacity" values="0.35;0.9;0.35" dur="2s" repeatCount="indefinite"/></circle>`;
  const tag = stale ? `<text x="16" y="31" text-anchor="middle" font-size="7" fill="#6E8093" font-family="monospace">STALE</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 32 36">
    ${halo}
    <g transform="rotate(${rot} 16 16)">
      <rect x="10" y="7" width="12" height="18" rx="2" fill="${fill}" stroke="#0A0E12" stroke-width="1"/>
      <rect x="11.5" y="9" width="9" height="4" rx="1" fill="#0A0E12" opacity="0.5"/>
    </g>${tag}</svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
}

export default function MapCanvas({
  basemap = 'dark',
  route = [],
  corridor,
  segments = [],
  stops = [],
  bus,
  height = 420,
}: {
  basemap?: 'dark' | 'light';
  route?: LatLng[];
  corridor?: LatLng[];
  segments?: TraceSegment[];
  stops?: MapStop[];
  bus?: BusMarker | null;
  height?: number;
}) {
  const tiles = CARTO[basemap];
  const allPoints: LatLng[] = [
    ...route,
    ...segments.flatMap((s) => s.coords),
    ...stops.map((s) => [s.lat, s.lng] as LatLng),
    ...(bus ? [[bus.lat, bus.lng] as LatLng] : []),
  ];
  const center: LatLng = allPoints[0] ?? [34.08, 74.8];

  return (
    <div style={{ height }} className="overflow-hidden rounded-ops border border-ink-700">
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        {/* Attribution is mandatory and visible (§16). */}
        <TileLayer url={tiles.url} attribution={tiles.attribution} />
        <FitBounds points={allPoints} />

        {corridor && corridor.length > 2 && (
          <Polygon positions={corridor} pathOptions={{ color: '#48586A', weight: 1, fillColor: '#48586A', fillOpacity: 0.08 }} />
        )}
        {route.length > 1 && (
          <Polyline positions={route} pathOptions={{ color: '#48586A', weight: 3 }} />
        )}

        {segments.map((s, i) => {
          const st = SEG_STYLE[s.kind];
          return (
            <Polyline
              key={i}
              positions={s.coords}
              pathOptions={{ color: st.color, weight: st.weight, dashArray: st.dash }}
            >
              {s.kind === 'unmonitored' && <Tooltip sticky>Unmonitored</Tooltip>}
            </Polyline>
          );
        })}

        {stops.map((s) => (
          <CircleMarker
            key={s.seq}
            center={[s.lat, s.lng]}
            radius={5}
            pathOptions={{ color: '#9AA9B8', weight: 1.5, fillColor: '#171E26', fillOpacity: 1 }}
          >
            <Tooltip>{`${s.seq}. ${s.name}`}</Tooltip>
          </CircleMarker>
        ))}

        {bus && <Marker position={[bus.lat, bus.lng]} icon={busIcon(bus.ageSec, bus.heading)} />}
      </MapContainer>
    </div>
  );
}
