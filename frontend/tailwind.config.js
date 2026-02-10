/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-base': '#131722',
        'bg-panel': '#1E222D',
        'bg-hover': '#2A2E39',
        'border-subtle': '#2A2E39',
        'border-active': '#2962FF',
        'text-primary': '#D1D4DC',
        'text-muted': '#787B86',
        'text-inverse': '#FFFFFF',
        'brand-blue': '#2962FF',
        'signal-green': '#089981',
        'signal-red': '#F23645',
        'signal-warn': '#F6A90E',
      },
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Roboto Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
