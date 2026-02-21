/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: '#0B0D10',
        graphite: '#151A21',
        steel: '#2A313C',
        fog: '#C7CEDA',
        paper: '#F2F4F7',
        electric: '#2D6BFF',
        signal: '#FF3B3B',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-electric': '0 0 20px rgba(45, 107, 255, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
