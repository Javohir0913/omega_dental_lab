/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Zamonaviy, toza, ammo neon emas — yumshoq ko'k palitra
        brand: {
          50: '#eff5ff', 100: '#dbe8fe', 200: '#bfd6fe', 300: '#93b8fd',
          400: '#6094fa', 500: '#3b76f0', 600: '#2b5fd6', 700: '#2450b0',
          800: '#24448b', 900: '#233c6f',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f5f7fa',
          border: '#e5e8ee',
        },
        ink: {
          DEFAULT: '#131a24',
          soft: '#525c6b',
          faint: '#8a93a1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Ko'p qatlamli yumshoq elevatsiya — zamonaviy his
        xs: '0 1px 2px rgba(16,24,40,.05)',
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.07)',
        'card-hover': '0 2px 4px rgba(16,24,40,.05), 0 6px 16px -6px rgba(16,24,40,.14)',
        pop: '0 12px 32px -8px rgba(16,24,40,.18), 0 4px 12px -4px rgba(16,24,40,.10)',
        lg: '0 24px 56px -16px rgba(16,24,40,.28)',
      },
      borderRadius: { lg: '10px', xl: '13px', '2xl': '17px' },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(.4,0,.2,1)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'scale-in': 'scale-in .18s cubic-bezier(.4,0,.2,1)',
      },
    },
  },
  plugins: [],
}
