import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0263E0",
          hover: "#1976D2",
        },
        surface: "#F8F9FA",
        border: "#E0E0E0",
      },
    },
  },
  plugins: [],
};
export default config;
