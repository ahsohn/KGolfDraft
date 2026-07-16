/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // "Clubhouse" palette — Masters-scoreboard aesthetic
        clubhouse: "#0a2b1d", // page background
        sheet: "#10412c", // raised surfaces (mobile chat sheet, peek bar)
        sheethead: "#0f3524", // sticky table headers
        cream: "#f3edda", // primary text
        gold: {
          DEFAULT: "#c9a227", // accent
          bright: "#dfb52e", // hover
        },
        clock: "#f2d16b", // on-the-clock yellow
        rosewood: "#d98b7c", // destructive
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
