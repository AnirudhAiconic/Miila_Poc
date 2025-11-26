Title: frontend/package.json – Frontend package configuration

Overview
- Defines dependencies, scripts, and tooling configuration for the React frontend.
- Used by npm and the create-react-app toolchain.

Key fields
- name, version, private: package metadata; private prevents accidental publish.
- dependencies:
  - react, react-dom: core React libraries.
  - react-router-dom: client-side routing.
  - react-scripts: CRA scripts for dev/build/test/eject.
  - axios: HTTP client used by components for API calls.
  - lucide-react: icon set used throughout the UI.
  - tailwindcss, postcss, autoprefixer: CSS tooling for utility classes and cross-browser prefixes.
- devDependencies:
  - @types/react and @types/react-dom: type definitions (useful in editors, optional).
- scripts:
  - start: runs the development server on port 3000.
  - build: creates a production build in the build/ directory.
  - test: runs the test runner.
  - eject: exposes CRA configuration for advanced customization (irreversible).
- eslintConfig and browserslist: lints and target browsers for dev/production.

Notes
- Tailwind is configured via frontend/tailwind.config.js and referenced in src/index.css.
- The backend dev server is expected at http://localhost:8000; proxies or Nginx can serve both under the same origin in production.


