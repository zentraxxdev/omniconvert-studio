/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      colors: {
        surface: {
          950: '#09090b', // zinc-950
          900: '#18181b', // zinc-900
          850: '#1f1f23', // matte mid-zinc
          800: '#27272a', // zinc-800
          700: '#3f3f46', // zinc-700
          600: '#52525b', // zinc-600
        },
      },
    },
  },
  plugins: [],
};
