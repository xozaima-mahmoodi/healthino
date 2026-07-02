/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      fontFamily: {
        // Resolves to the per-locale font set via the --app-font CSS variable
        // (Vazirmatn for fa/ckb, a clean Latin sans for en). See style.css.
        sans: ['var(--app-font)', 'Vazirmatn', 'system-ui', 'sans-serif']
      },
      colors: {
        surface: '#F8FAFC',
        brand: {
          DEFAULT: '#059669',
          dark:    '#047857',
          darker:  '#065f46',
          soft:    '#ecfdf5',
          ring:    'rgba(5, 150, 105, 0.30)'
        }
      },
      boxShadow: {
        glass:      '0 8px 40px rgba(2, 6, 23, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-dk': '0 8px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(16,185,129,0.10)',
        cta:        '0 10px 25px -5px rgba(5, 150, 105, 0.45), 0 6px 12px -6px rgba(5, 150, 105, 0.35)',
        // Ultra-soft ambient depth for premium cards and surfaces.
        soft:       '0 8px 30px rgba(2, 6, 23, 0.04)',
        'soft-md':  '0 12px 36px -8px rgba(2, 6, 23, 0.10), 0 2px 8px -2px rgba(2, 6, 23, 0.05)',
        'soft-lg':  '0 24px 60px -14px rgba(2, 6, 23, 0.18), 0 6px 18px -8px rgba(2, 6, 23, 0.08)',
        // Soft emerald glow for hover/active lifts on interactive elements.
        glow:       '0 14px 40px -10px rgba(5, 150, 105, 0.28), 0 4px 12px -4px rgba(5, 150, 105, 0.18)'
      },
      backdropBlur: {
        xs: '2px'
      },
      transitionTimingFunction: {
        bounceish: 'cubic-bezier(.2,.8,.2,1)'
      },
      keyframes: {
        // Slow, organic drift for the ambient mesh glows. Each blob pairs a
        // gentle translate with a subtle scale + opacity breathe so the light
        // feels alive and cinematic rather than mechanically looped.
        'aura-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0.9' },
          '50%':      { transform: 'translate3d(4%, -3%, 0) scale(1.08)', opacity: '1' }
        },
        'aura-drift-alt': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1.05)', opacity: '0.85' },
          '50%':      { transform: 'translate3d(-5%, 4%, 0) scale(0.95)', opacity: '1' }
        },
        'aura-breathe': {
          '0%, 100%': { transform: 'translate3d(-50%, 0, 0) scale(1)', opacity: '0.7' },
          '50%':      { transform: 'translate3d(-50%, -4%, 0) scale(1.12)', opacity: '0.95' }
        },
        // A skewed highlight bar sweeps across, then rests, giving CTAs a
        // continuous liquid-shimmer sheen with a premium pause between passes.
        shimmer: {
          '0%':        { transform: 'translateX(-160%) skewX(-12deg)' },
          '55%, 100%': { transform: 'translateX(320%) skewX(-12deg)' }
        }
      },
      animation: {
        // Long, offset durations keep the three glows perpetually out of sync.
        'aura-drift':     'aura-drift 22s ease-in-out infinite',
        'aura-drift-alt': 'aura-drift-alt 28s ease-in-out infinite',
        'aura-breathe':   'aura-breathe 19s ease-in-out infinite',
        shimmer:          'shimmer 3s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
