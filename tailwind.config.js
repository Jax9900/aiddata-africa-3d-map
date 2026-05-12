export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        paper: "#f8f3ed",
        oxblood: "#831d1c",
        brick: "#c4473d",
        cream: "#fff7ed",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Georgia", "ui-serif", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 18px 60px rgba(15, 23, 42, 0.18)",
      },
    },
  },
  plugins: [],
};
