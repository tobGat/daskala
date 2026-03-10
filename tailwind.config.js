/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './renderer/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fd',
          300: '#a5bbfb',
          400: '#8097f6',
          500: '#5f73ef',
          600: '#4a56e3',
          700: '#3b43cc',
          800: '#3138a5',
          900: '#2d3382',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
