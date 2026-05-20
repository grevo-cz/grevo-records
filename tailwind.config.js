/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0b',
          elev: '#131316',
          card: '#1a1a1e',
          border: '#26262c',
        },
        text: {
          primary: '#f5f5f7',
          secondary: '#a1a1aa',
          muted: '#6b6b75',
        },
        accent: {
          DEFAULT: '#7c6cff',
          hover: '#9180ff',
          subtle: '#7c6cff20',
        },
        danger: '#ef4444',
        success: '#22c55e',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: ['SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        soft: '0 4px 20px rgba(0,0,0,0.4)',
        glow: '0 0 24px rgba(124,108,255,0.25)',
      },
      animation: {
        'pulse-soft': 'pulse 2s ease-in-out infinite',
        'fade-in': 'fadeIn 200ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
