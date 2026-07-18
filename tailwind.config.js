/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: '#F7F8FA',
        'surface-elevated': '#FFFFFF',
        border: '#E5E7EB',
        'text-primary': '#111827',
        'text-secondary': '#6B7280',
        primary: '#174F3A',
        'primary-hover': '#103E2D',
        success: '#16A34A',
        warning: '#F59E0B',
        danger: '#DC2626'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif']
      },
      fontSize: {
        '2xl': ['32px', { lineHeight: '40px' }],
        xl: ['24px', { lineHeight: '32px' }],
        lg: ['20px', { lineHeight: '28px' }],
        base: ['16px', { lineHeight: '24px' }],
        sm: ['14px', { lineHeight: '20px' }],
        xs: ['12px', { lineHeight: '16px' }]
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px'
      },
      borderRadius: {
        DEFAULT: '8px',
        bubble: '16px'
      }
    }
  },
  plugins: []
};
