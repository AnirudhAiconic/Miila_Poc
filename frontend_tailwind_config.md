Title: frontend/tailwind.config.js – Tailwind CSS configuration

Overview
- Configures Tailwind to scan the src directory for class usage.
- Extends the default theme with a primary color palette, gray palette, Inter font, and a soft box shadow preset.

Key settings
- content: "./src/**/*.{js,jsx,ts,tsx}"
- theme.extend.colors:
  - primary shades: 50, 100, 500, 600, 700
  - gray shades: 50 through 900
- theme.extend.fontFamily.sans: Inter first, then system-ui and sans-serif fallback.
- theme.extend.boxShadow.soft: a gentle multi-stop shadow used by cards.

Notes
- No plugins configured. The defaults from Tailwind suffice for this UI.


