Title: frontend/src/components/Dashboard.js – Main product dashboard

Overview
- The primary UI for the application after login.
- Manages API key entry, worksheet upload and analysis, results display, and tabs to switch views.
- Hosts the place where users can analyze worksheets or navigate to the tutoring features.

Technologies and libraries
- React functional component and hooks for state.
- lucide-react for icons.
- Tailwind CSS utility classes via index.css and tailwind.config.js.

Key state
- apiKey: stored in localStorage under miila_api_key.
- activeTab: one of upload, tutor, apikey, results.
- results: holds the last worksheet analysis data for display.
- user: derived from localStorage miila_user to show name and email in the UI.

Key behaviors
- Shows an initial API Key screen until a key is provided; then unlocks other tabs.
- Upload tab renders WorksheetUpload and captures results via onWorksheetAnalyzed to switch to the results tab.
- Results tab shows a side panel summary and delegates detailed rendering to ResultsDisplay.
- Tutor tab currently renders AskFromImage (ensure this component exists).
- Logout button clears auth state in App.

Inputs and outputs
- Input:
  - API key typed by user; stored locally for subsequent requests.
  - WorksheetUpload child emits analysis results back to the dashboard.
- Output:
  - Renders detailed results including counts for perfect, correct_no_steps, wrong, and empty.
  - Navigation between tabs and logout handling.

Notes
- The logo tries /logo.svg then falls back to /logo.png.
- The left-side navigation highlights the active tab using a small red bar.


