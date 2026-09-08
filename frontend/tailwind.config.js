/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#131316',
          dim: '#131316',
          bright: '#39393c',
          container: {
            lowest: '#0e0e11',
            low: '#1b1b1e',
            DEFAULT: '#1f1f22',
            high: '#2a2a2d',
            highest: '#353438',
          },
        },
        primary: {
          DEFAULT: '#c0c1ff',
          container: '#8083ff',
        },
        secondary: {
          DEFAULT: '#7bd0ff',
          container: '#00a6e0',
        },
        tertiary: {
          DEFAULT: '#4edea3',
          container: '#00885d',
        },
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
        },
      },
      fontFamily: {
        display: ['Geist', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
