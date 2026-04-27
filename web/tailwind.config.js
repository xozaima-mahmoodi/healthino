/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif']
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
        cta:        '0 10px 25px -5px rgba(5, 150, 105, 0.45), 0 6px 12px -6px rgba(5, 150, 105, 0.35)'
      },
      backdropBlur: {
        xs: '2px'
      },
      transitionTimingFunction: {
        bounceish: 'cubic-bezier(.2,.8,.2,1)'
      }
    }
  },
  plugins: []
}
