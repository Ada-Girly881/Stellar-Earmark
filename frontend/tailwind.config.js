/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:       '#070b12',
        card:     '#0e1420',
        'card-2': '#151d2c',
        liner:    'rgba(255,255,255,0.07)',
        text:     '#eef3f8',
        muted:    '#8a98ac',
        teal:     '#2fd6b0',
        sky:      '#5bb8ff',
        indigo:   '#8b9cff',
        amber:    '#ffc55c',
        rose:     '#ff7a8a',
        // institution category accents
        cat: {
          school:   '#5bb8ff',
          clinic:   '#2fd6b0',
          landlord: '#ffc55c',
          utility:  '#8b9cff',
          merchant: '#ff7a8a',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(47,214,176,0.08) 0%, rgba(91,184,255,0.05) 50%, transparent 100%)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
