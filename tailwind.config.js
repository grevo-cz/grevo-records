/** @type {import('tailwindcss').Config} */
//
// Records By Grevo — design tokens
//
// Identita: studiová technika. Vrstvený teplý grafit (ne čistá černá),
// wolframová jantarová jako akční barva (studiové lampy, VU metry),
// REC červená vyhrazená pro nahrávání a destruktivní akce, monospace
// timecode pro všechna čísla. Ostřejší rádiusy než výchozí blob-look.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#111013', // warm near-black, lehce fialovohnědý nádech
          elev: '#18171B',
          card: '#1D1B20',
          border: '#2A272E',
        },
        text: {
          primary: '#EDEAE4', // teplá papírová bílá
          secondary: '#9B96A0',
          muted: '#6C6772',
        },
        // Akční barva: wolframová jantarová (studiové osvětlení)
        accent: {
          DEFAULT: '#E8A33D',
          hover: '#F2B45C',
          subtle: 'rgba(232, 163, 61, 0.13)',
        },
        // REC červená — nahrávání + destruktivní akce (tally light)
        danger: '#F5453C',
        success: '#4FBF67',
      },
      fontFamily: {
        display: [
          '"Bricolage Grotesque Variable"',
          '-apple-system',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SF Mono',
          'JetBrains Mono',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        lg: '8px',
        xl: '10px',
        '2xl': '14px',
      },
      boxShadow: {
        soft: '0 4px 20px rgba(0, 0, 0, 0.45)',
        glow: '0 0 0 1px rgba(232, 163, 61, 0.25), 0 4px 24px rgba(232, 163, 61, 0.12)',
        rec: '0 0 0 1px rgba(245, 69, 60, 0.35), 0 0 32px rgba(245, 69, 60, 0.25)',
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
