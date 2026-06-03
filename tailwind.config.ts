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
        'viva-verde': '#bfff00', // Verde Lima vibrante (70% da sua marca)
        'viva-roxo': '#4b0082',  // Roxo escuro para contraste e textos (30%)
        'viva-fundo': '#f8fafc', // Fundo clarinho e limpo
      },
    },
  },
  plugins: [],
};
export default config;