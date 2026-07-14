'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Gauge, GraduationCap, Bus, Users } from 'lucide-react';
import { browserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/brand/Wordmark';
import { SealHero } from '@/components/brand/SealHero';
import { Marquee } from '@/components/motion/Marquee';

// Role → home surface. Enforcement still lives in each layout's requireProfile();
// this is only where to send a freshly-authenticated user.
const ROLE_HOME: Record<string, string> = {
  rto_officer: '/rto',
  school_admin: '/school',
  driver: '/driver',
  attendant: '/driver',
  parent: '/parent',
  platform_admin: '/admin',
};

const DEMO_PASSWORD = 'Demo@1234';
const DEMO_ACCOUNTS: { email: string; label: string; Icon: typeof Gauge }[] = [
  { email: 'rto@demo.gov.in', label: 'RTO officer', Icon: Gauge },
  { email: 'schoolA@demo.gov.in', label: 'School admin', Icon: GraduationCap },
  { email: 'driver1@demo.gov.in', label: 'Driver', Icon: Bus },
  { email: 'parent@demo.gov.in', label: 'Parent', Icon: Users },
];

const INPUT =
  'w-full rounded-ops border border-ink-700 bg-ink-950/60 px-3 py-2.5 text-14 text-ink-100 placeholder:text-ink-500 outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 transition-colors duration-120';

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const forbidden = params.get('forbidden') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(withEmail: string, withPassword: string) {
    setError(null);
    setLoading(true);
    try {
      const supabase = browserClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: withEmail,
        password: withPassword,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      const userId = data.user?.id;
      if (!userId) {
        setError('Signed in, but no account could be resolved. Please try again.');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      const role = (profile as { role?: string } | null)?.role;
      const home = role ? ROLE_HOME[role] : undefined;
      if (!home) {
        setError('Signed in, but no dashboard is configured for this role.');
        return;
      }
      window.location.href = home;
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient black + drifting multi-colour aurora */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-aurora absolute -left-1/4 top-[-12%] h-[58vh] w-[58vh] rounded-full bg-viz-1/20 blur-[120px]" />
        <div className="animate-aurora absolute -right-1/4 top-[-6%] h-[52vh] w-[52vh] rounded-full bg-viz-3/20 blur-[120px]" style={{ animationDelay: '3s' }} />
        <div className="animate-aurora absolute bottom-[-14%] left-1/3 h-[56vh] w-[56vh] rounded-full bg-viz-2/20 blur-[130px]" style={{ animationDelay: '6s' }} />
      </div>

      <div className="relative w-full max-w-4xl">
        <div className="rise-in grid overflow-hidden rounded-counter border border-gold/20 shadow-lux md:grid-cols-2">
          {/* ── Brand column (desktop) ── */}
          <div className="relative hidden flex-col justify-between bg-gradient-to-br from-ink-900 to-ink-950 p-8 md:flex">
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[image:var(--foil)] opacity-50"
              aria-hidden
            />
            <div>
              <SealHero size={76} />
              <div className="mt-6">
                <Wordmark variant="text" size="lg" foil />
              </div>
              <p className="mt-3 font-display text-26 italic leading-tight text-ink-200">
                School Transport Integrity Platform
              </p>
              <p className="foil-text foil-anim mt-4 text-12 font-semibold uppercase tracking-[0.28em]">
                Every trip, verified.
              </p>
              <p className="mt-6 max-w-xs font-display text-20 italic leading-snug text-ink-300">
                Tracking is the input. Evidence is the product.
              </p>
            </div>
            <div className="mt-8 border-t border-gold/15 pt-4">
              <Marquee
                items={['SIGNAL', 'EVIDENCE', 'ALERTS', 'LEDGER', 'TAMPER-EVIDENT']}
                speed={26}
                itemClassName="text-11 font-medium uppercase tracking-[0.2em] text-ink-400"
              />
            </div>
          </div>

          {/* ── Form column (glass) ── */}
          <div className="glass p-6 sm:p-8">
            {/* Mobile brand header */}
            <div className="mb-6 flex flex-col items-center text-center md:hidden">
              <SealHero size={54} />
              <div className="mt-3">
                <Wordmark variant="text" size="lg" foil />
              </div>
              <p className="mt-1 text-12 text-ink-400">School Transport Integrity Platform</p>
            </div>

            <div className="hidden md:block">
              <h2 className="font-display text-34 font-semibold text-ink-100">Sign in</h2>
              <p className="mt-1 text-12 text-ink-400">Access your workspace.</p>
            </div>

            {forbidden && (
              <div className="mt-4 flex items-start gap-2 rounded-ops border border-sig-watch/40 bg-sig-watch/[0.06] px-3 py-2">
                <AlertTriangle
                  size={15}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-sig-watch"
                  aria-hidden
                />
                <p className="text-12 leading-relaxed text-ink-300">
                  That area is restricted to a different role. Sign in with an account that has
                  access.
                </p>
              </div>
            )}

            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void signIn(email, password);
              }}
            >
              <div>
                <label htmlFor="email" className="mb-1 block text-11 uppercase tracking-[0.1em] text-gold/70">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  className={INPUT}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@department.gov.in"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-11 uppercase tracking-[0.1em] text-gold/70">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className={INPUT}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <p className="tnum text-12 leading-relaxed text-sig-alert" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full py-2.5"
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in…
                  </span>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-gold/15 pt-4">
              <p className="text-11 font-medium uppercase tracking-[0.1em] text-gold/70">
                Demo logins
              </p>
              <p className="mt-1 text-11 leading-relaxed text-ink-500">
                One tap fills the form. Every demo account uses the password{' '}
                <span className="tnum text-ink-300">{DEMO_PASSWORD}</span>.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acct) => (
                  <button
                    key={acct.email}
                    type="button"
                    onClick={() => {
                      setError(null);
                      setEmail(acct.email);
                      setPassword(DEMO_PASSWORD);
                    }}
                    className="group flex items-center gap-2.5 rounded-ops border border-ink-700 bg-ink-800/60 px-2.5 py-2 text-left transition-colors duration-120 hover:border-gold/40 hover:bg-ink-800"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-ops border border-ink-600 bg-ink-900 transition-colors group-hover:border-gold/50">
                      <acct.Icon size={14} strokeWidth={1.5} className="text-gold/80" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-12 font-medium text-ink-200">{acct.label}</span>
                      <span className="tnum mt-0.5 block truncate text-11 text-ink-500">
                        {acct.email}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-12 text-ink-500 underline underline-offset-2 hover:text-ink-300">
            Back to overview
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-ink-950" />}>
      <LoginCard />
    </Suspense>
  );
}
