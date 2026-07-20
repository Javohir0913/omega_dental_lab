/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Yumshoq, uyg'un palitra — neon emas
        brand: {
          50: '#eef4fb', 100: '#d7e5f5', 200: '#b3cceb', 300: '#82abdc',
          400: '#5486c9', 500: '#3768b0', 600: '#2b5391', 700: '#254575',
          800: '#223b61', 900: '#203352',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f6f7f9',
          border: '#e4e7ec',
        },
        ink: {
          DEFAULT: '#1c2430',
          soft: '#5b6674',
          faint: '#8d96a3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)',
        pop: '0 8px 24px rgba(16,24,40,.12)',
      },
      borderRadius: { xl: '10px', '2xl': '14px' },
    },
  },
  plugins: [],
}
