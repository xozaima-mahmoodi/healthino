/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: {
          DEFAULT: '#0e9f6e',
          dark: '#057a55',
          soft: '#def7ec'
        }
      }
    }
  },
  plugins: []
}
