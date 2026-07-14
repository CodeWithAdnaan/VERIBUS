'use client';
// Complaint form with the GUARANTEED privacy path (BUILD SPEC §7 §13, PilotGap
// "auto-face-blur"): if the parent says people are visible in a photo, they MUST paint
// blur over the faces on a <canvas> before the form will submit. The image that leaves
// the browser is the CANVAS export (already redacted) — the original file is never sent.
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Camera, Brush, RotateCcw, Trash2, CheckCircle2, Send, UserX, Info } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PilotGap } from '@/components/ui/PilotGap';

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

const CATEGORIES = [
  'Rash driving',
  'Overspeeding',
  'Missed stop',
  'Attendant absent',
  'Vehicle condition',
  'Other',
] as const;

const MAX_W = 460;
const BRUSH = 30;

export function ComplaintForm({
  vehicles,
  onSubmit,
}: {
  vehicles: { id: string; bus_code: string }[];
  onSubmit: (formData: FormData) => Promise<SubmitResult>;
}) {
  const [category, setCategory] = useState<string>('');
  const [body, setBody] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [peopleVisible, setPeopleVisible] = useState(false);
  const [hasPainted, setHasPainted] = useState(false);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const painting = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // ── load a chosen file; the actual draw happens in the effect below, once the
  // <canvas> has mounted (it is only rendered when imageLoaded flips to true). ──
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imgRef.current) URL.revokeObjectURL(imgRef.current.src);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.width);
      imgRef.current = img;
      setImgSize({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) });
      setHasPainted(false);
      setPeopleVisible(false);
      setImageLoaded(true);
    };
    img.src = URL.createObjectURL(file);
  }

  // Draw the base image once the canvas is in the DOM and sized.
  useEffect(() => {
    if (!imageLoaded || !imgSize) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = imgSize.w;
    canvas.height = imgSize.h;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0, imgSize.w, imgSize.h);
  }, [imageLoaded, imgSize]);

  function redrawBase() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    setHasPainted(false);
  }

  function removePhoto() {
    if (imgRef.current) URL.revokeObjectURL(imgRef.current.src);
    imgRef.current = null;
    setImgSize(null);
    setImageLoaded(false);
    setHasPainted(false);
    setPeopleVisible(false);
  }

  function pointFrom(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function paintTo(p: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#2b2b2b'; // opaque grey — a guaranteed redaction, not a soft blur
    ctx.fillStyle = '#2b2b2b';
    ctx.lineWidth = BRUSH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (last.current) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, BRUSH / 2, 0, Math.PI * 2);
    ctx.fill();
    last.current = p;
  }

  function onDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!imageLoaded) return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    painting.current = true;
    const p = pointFrom(e);
    if (p) {
      last.current = null;
      paintTo(p);
      setHasPainted(true);
    }
  }
  function onMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!painting.current) return;
    const p = pointFrom(e);
    if (p) paintTo(p);
  }
  function onUp() {
    painting.current = false;
    last.current = null;
  }

  // Blocked while a photo has admitted faces that have not been painted over.
  const photoBlocked = imageLoaded && peopleVisible && !hasPainted;
  const canSubmit = category !== '' && body.trim() !== '' && !photoBlocked && !pending;

  function submit() {
    const fd = new FormData();
    fd.set('category', category);
    fd.set('body', body);
    fd.set('vehicleId', vehicleId);
    if (anonymous) fd.set('anonymous', 'on');

    const send = (blob?: Blob | null) => {
      if (blob) fd.set('photo', blob, 'complaint.jpg');
      startTransition(async () => setResult(await onSubmit(fd)));
    };

    const canvas = canvasRef.current;
    if (imageLoaded && canvas) canvas.toBlob((b) => send(b), 'image/jpeg', 0.85);
    else send(null);
  }

  if (result?.ok) {
    return (
      <div className="rounded-counter border border-black/10 bg-paper-2 p-4 text-center">
        <CheckCircle2 size={30} strokeWidth={1.5} className="mx-auto text-sig-ok" aria-hidden />
        <p className="mt-2 text-14 font-semibold text-ink-900">Complaint recorded</p>
        <p className="mt-1 text-12 leading-relaxed text-ink-600">
          Thank you. A person will review this — the category is confirmed by a human, not decided
          automatically. {anonymous ? 'Your name was not attached.' : ''}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/parent" className="inline-flex items-center rounded-ops border border-black/15 px-3 py-1.5 text-13 text-ink-900 hover:bg-paper">
            Back to live view
          </Link>
          <Button
            variant="quiet"
            onClick={() => {
              setResult(null);
              setBody('');
              setCategory('');
              setVehicleId('');
              removePhoto();
            }}
          >
            Raise another
          </Button>
        </div>
      </div>
    );
  }

  const labelCls = 'mb-1 block text-12 font-medium text-ink-700';
  const fieldCls =
    'w-full rounded-ops border border-black/15 bg-white/70 px-3 py-2 text-14 text-ink-900 placeholder:text-ink-500 focus:border-sig-info';

  return (
    <div className="flex flex-col gap-4">
      {result && !result.ok && (
        <p className="rounded-ops border border-sig-alert/40 bg-sig-alert/[0.06] px-3 py-2 text-12 text-sig-alert">
          {result.error ?? 'Something went wrong.'}
        </p>
      )}

      <div>
        <label htmlFor="category" className={labelCls}>
          What is the concern?
        </label>
        <select id="category" className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="" disabled>
            Select a category…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* AI-suggested category seam — shown, never faked (classifier deferred). */}
      <div>
        <label htmlFor="ai-cat" className={labelCls}>
          AI-suggested category
        </label>
        <input
          id="ai-cat"
          disabled
          value="Pending human review"
          className="w-full cursor-not-allowed rounded-ops border border-dashed border-black/15 bg-paper px-3 py-2 text-14 text-ink-500"
        />
        <p className="mt-1 flex items-start gap-1 text-11 leading-relaxed text-ink-500">
          <Info size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          The automatic classifier is deferred for the pilot — a person confirms the category. We
          show the seam, not a guessed result.
        </p>
      </div>

      <div>
        <label htmlFor="vehicle" className={labelCls}>
          Bus (optional)
        </label>
        <select id="vehicle" className={fieldCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Not specified</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.bus_code}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="body" className={labelCls}>
          Describe what happened
        </label>
        <textarea
          id="body"
          rows={4}
          className={fieldCls}
          placeholder="What did you see, and when?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {/* ── Photo + manual face-blur brush (the guaranteed path) ── */}
      <div className="rounded-counter border border-black/10 bg-paper-2 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-12 font-medium text-ink-700">
          <Camera size={15} strokeWidth={1.75} aria-hidden />
          Photo (optional)
        </p>

        {!imageLoaded ? (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-ops border border-dashed border-black/20 bg-white/50 px-3 py-4 text-13 text-ink-600 hover:bg-white/70">
            <Camera size={16} strokeWidth={1.75} aria-hidden />
            Choose a photo
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        ) : (
          <div className="flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="w-full touch-none rounded-ops border border-black/15"
              style={{ cursor: 'crosshair' }}
            />
            <label className="flex items-start gap-2 text-12 leading-relaxed text-ink-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={peopleVisible}
                onChange={(e) => setPeopleVisible(e.target.checked)}
              />
              <span>
                People are visible in this photo.{' '}
                <span className="text-ink-500">
                  You cannot submit until every face is painted over.
                </span>
              </span>
            </label>

            {peopleVisible && (
              <p
                className={`flex items-center gap-1.5 text-11 ${hasPainted ? 'text-sig-ok' : 'text-sig-watch'}`}
              >
                <Brush size={13} strokeWidth={1.75} aria-hidden />
                {hasPainted
                  ? 'Faces covered. Add more strokes if any face is still visible.'
                  : 'Drag across each face to paint an opaque cover before you can submit.'}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="quiet" onClick={redrawBase} disabled={!hasPainted}>
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
                Start over
              </Button>
              <Button variant="quiet" onClick={removePhoto}>
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Remove photo
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3">
          <PilotGap id="auto-face-blur" />
        </div>
      </div>

      <label className="flex items-start gap-2 text-13 leading-relaxed text-ink-700">
        <input type="checkbox" className="mt-0.5" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span className="flex items-center gap-1.5">
          <UserX size={15} strokeWidth={1.75} className="text-ink-500" aria-hidden />
          Submit anonymously — do not attach my name.
        </span>
      </label>

      <Button variant="primary" onClick={submit} disabled={!canSubmit} className="justify-center">
        <Send size={15} strokeWidth={1.75} aria-hidden />
        {pending ? 'Submitting…' : 'Submit complaint'}
      </Button>
      {photoBlocked && (
        <p className="-mt-2 text-11 text-sig-watch">Paint over the visible faces to enable submit.</p>
      )}
    </div>
  );
}
