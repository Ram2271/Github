/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gh: {
          bg: '#0d1117',
          surface: '#161b22',
          subtle: '#21262d',
          border: '#30363d',
          text: '#c9d1d9',
          muted: '#8b949e',
          link: '#58a6ff',
          green: '#238636',
          greenHover: '#2ea043',
          red: '#da3633',
          purple: '#8957e5',
          gold: '#d29922'
        }
      }
    },
  },
  plugins: [],
}
