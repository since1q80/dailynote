import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FEFDFA',
        canvas: '#F4F2EC',
        ink: {
          DEFAULT: '#1F1E1B',
          soft: '#5F5E5A',
          faint: '#88857D',
          ghost: '#B4B1A8',
        },
        line: '#DCDAD3',
        accent: {
          DEFAULT: '#534AB7',
          dark: '#3C3489',
          soft: '#EEEDFE',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
