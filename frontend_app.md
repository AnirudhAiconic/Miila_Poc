Title: frontend/src/App.js – React application shell and routing

Overview
- Sets up the React Router and top-level application state.
- Provides login, dashboard, ask-from-image, and student-publisher routes (the latter two must exist in components to render).
- Manages simple client-side authentication via localStorage.

Technologies and libraries
- React and react-router-dom for SPA routing.
- LocalStorage for storing a session token and user object.
- CSS via src/index.css and Tailwind classes rendered by the config.

Key behaviors
- On load, checks for stored token and user in localStorage; sets isAuthenticated accordingly.
- handleLogin(email, password) posts credentials to /auth/login and, on success, stores token and user in localStorage.
- handleLogout clears local auth state and storage keys.
- Routes:
  - /login: renders Login when not authenticated; otherwise redirects to /dashboard.
  - /dashboard: renders Dashboard when authenticated; otherwise redirects to /login.
  - /ask: guarded route for AskFromImage (component import present; file must be present to render).
  - /student-publish: guarded route for StudentPublisher (component import present; file must be present to render).
  - / redirects to the appropriate page based on auth state.

Inputs and outputs
- Inputs:
  - User email and password in the Login view.
  - Stored token and user json under keys miila_token and miila_user.
- Outputs:
  - Navigation to appropriate pages after login/logout.
  - Passes callbacks to child components via props.

Notes
- If a referenced component file is missing, the build or runtime may fail; ensure imported components exist.
- The backend CORS settings allow http://localhost:3000 to call the API during local development.


