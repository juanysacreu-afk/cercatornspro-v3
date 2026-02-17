/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'fgc-green': 'rgb(var(--fgc-green) / <alpha-value>)', // Color corporativo adaptable (Mobile Brightness Boost)
        'fgc-green-dark': '#75990F', // Darker shade for text/contrast
        'fgc-grey': '#4D5358',
        'fgc-grey-dark': '#373C40', // 20% darker than corporate grey
        'fgc-dark': '#000000',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}

