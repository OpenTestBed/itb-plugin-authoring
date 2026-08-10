/** @type {import('tailwindcss').Config} */
export default {
  // Without this the build emits no utilities and the app has to fall back to
  // the runtime CDN, which needs network access and flashes unstyled content.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // AppContext toggles `dark` on <html>, so dark: must key off the class.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
