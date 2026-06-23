/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        apple: '0 4px 24px rgba(0, 0, 0, 0.05)',
        'apple-lg': '0 12px 40px rgba(0, 0, 0, 0.08)',
        glow: '0 8px 28px rgba(10, 132, 255, 0.22)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"PingFang SC"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#1d1d1f', soft: '#3a3a3c', mute: '#6e6e73', faint: '#a1a1a6' },
        brand: {
          50: '#eaf3ff',
          100: '#d6e8ff',
          200: '#aecfff',
          300: '#7fb2ff',
          400: '#4a93ff',
          500: '#0a84ff',
          600: '#0a6edb',
          700: '#0858ad',
        },
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        breathe: {
          '0%,100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
        breathe: 'breathe 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
