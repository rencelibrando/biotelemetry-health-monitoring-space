/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--background)', surface: 'var(--surface)', accent: 'rgb(var(--accent-rgb) / <alpha-value>)', primary: 'rgb(var(--accent-rgb) / <alpha-value>)',
        content: 'var(--text)', muted: 'var(--muted)', success: 'var(--success)', warning: 'var(--warning)', critical: 'var(--critical)',
        space: { 950: 'var(--background)', 900: 'var(--surface)', 800: 'var(--surface-raised)', accent: 'rgb(var(--accent-rgb) / <alpha-value>)', alert: 'var(--critical)', warning: 'var(--warning)', success: 'var(--success)' },
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};


