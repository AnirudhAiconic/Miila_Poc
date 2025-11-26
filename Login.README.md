Title: frontend/src/components/Login.js – Authentication form

Overview
- Displays the login form to collect email and password.
- Delegates actual login to the onLogin prop (wired in App.js).
- Provides a visual splash image via /uploads served by the backend.

Technologies and libraries
- React functional component and hooks.
- lucide-react for form icons.
- Tailwind CSS classes for styling.

Key behaviors
- Validates that email and password are entered before calling onLogin.
- Displays loading state and errors based on onLogin result.
- Loads a splash background using uploads/splash.jpg (falls back to case variant).
- Provides a show/hide password toggle and basic remember-me checkbox (local-only).

Inputs and outputs
- Inputs:
  - email and password typed by the user.
  - onLogin(email, password) provided via props.
- Outputs:
  - On success, parent sets auth state and navigates to the dashboard.
  - On failure, shows Invalid credentials.

Notes
- The image URL builder prefers http://localhost:8000/uploads in dev for reliability.
- The backend exposes /uploads via StaticFiles.


