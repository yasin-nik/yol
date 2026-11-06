const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: token('primary'),
        'on-primary': token('on-primary'),
        accent: token('accent'),
        surface: token('surface'),
        background: token('background'),
        foreground: token('foreground'),
        muted: token('muted'),
        line: token('border'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
      },
    },
  },
  plugins: [],
};
