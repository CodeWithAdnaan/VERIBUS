import type { Config } from 'tailwindcss';

/**
 * Tailwind maps to the CSS custom properties in design/tokens.css.
 * Colour is SEMANTIC ONLY (BUILD SPEC §16). Silence is the default; colour means
 * something is wrong. Do not add colour because a panel "looks empty".
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'var(--ink-950)',
          900: 'var(--ink-900)',
          800: 'var(--ink-800)',
          700: 'var(--ink-700)',
          600: 'var(--ink-600)',
          500: 'var(--ink-500)',
          400: 'var(--ink-400)',
          300: 'var(--ink-300)',
          200: 'var(--ink-200)',
          100: 'var(--ink-100)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          2: 'var(--paper-2)',
        },
        sig: {
          ok: 'var(--sig-ok)',
          watch: 'var(--sig-watch)',
          alert: 'var(--sig-alert)',
          critical: 'var(--sig-critical)',
          info: 'var(--sig-info)',
          unmonitored: 'var(--sig-unmonitored)',
        },
        // Luxury accents — champagne gold + deep emerald + warm ivory.
        gold: {
          DEFAULT: 'var(--gold)',
          deep: 'var(--gold-deep)',
          soft: 'var(--gold-soft)',
        },
        emerald: {
          DEFAULT: 'var(--emerald)',
          bright: 'var(--emerald-bright)',
        },
        ivory: 'var(--ivory)',
        // Vibrant, varied data/accent palette.
        viz: {
          1: 'var(--viz-1)',
          2: 'var(--viz-2)',
          3: 'var(--viz-3)',
          4: 'var(--viz-4)',
          5: 'var(--viz-5)',
          6: 'var(--viz-6)',
        },
      },
      fontFamily: {
        sans: ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-plex-serif)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'var(--font-plex-serif)', 'Georgia', 'serif'],
        deva: ['var(--font-noto-deva)', 'sans-serif'],
      },
      boxShadow: {
        // Colourful glow (blue → violet) — the old name is kept so existing
        // `shadow-gold` usages recolour automatically.
        gold: '0 0 0 1px rgba(91,140,255,0.35), 0 12px 40px -12px rgba(155,92,255,0.55)',
        lux: '0 24px 60px -24px rgba(0,0,0,0.8)',
      },
      // Keyframes live in app/globals.css (single source), so both these
      // animate-* utilities and the hand-written .marquee/.foil-anim/.sheen
      // classes resolve against the same @keyframes.
      animation: {
        marquee: 'marquee 34s linear infinite',
        'glow-pulse': 'glow-pulse 4.5s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        aurora: 'aurora 18s ease-in-out infinite',
      },
      fontSize: {
        // 8pt-derived scale (§16)
        '11': ['11px', { lineHeight: '1.2' }],
        '12': ['12px', { lineHeight: '1.2' }],
        '13': ['13px', { lineHeight: '1.45' }],
        '14': ['14px', { lineHeight: '1.4' }],
        '16': ['16px', { lineHeight: '1.55' }],
        '20': ['20px', { lineHeight: '1.3' }],
        '26': ['26px', { lineHeight: '1.2' }],
        '34': ['34px', { lineHeight: '1.15' }],
        '44': ['44px', { lineHeight: '1.1' }],
      },
      borderRadius: {
        // Ops surfaces cap at 4px; public surfaces use 12px explicitly.
        ops: '4px',
        counter: '12px',
      },
      backgroundImage: {
        // Tamper is a pattern, not a colour.
        hazard:
          'repeating-linear-gradient(45deg,#C22B1F 0 10px,#0A0E12 10px 20px)',
      },
      transitionTimingFunction: {
        instrument: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        // The interactive vocabulary: 120ms hover/state, 140ms entries.
        '120': '120ms',
        '140': '140ms',
      },
    },
  },
  plugins: [],
};

export default config;
