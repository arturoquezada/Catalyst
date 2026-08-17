# Catalyst

Static MVP for Evolve CX Catalyst.

## Current modules
- Authentication with Supabase Auth
- Role-aware navigation
- Dashboard
- Requisitions
- Jobs / Candidates / Pipeline / Offers shells
- English / Spanish preferences
- Light / Dark appearance
- Responsive layout

## Deploy to Vercel
1. Upload the contents of this folder to the root of your GitHub repository.
2. Keep `index.html` at repository root.
3. In Vercel use Framework Preset: `Other`.
4. Root Directory: `./`
5. Build Command: empty
6. Output Directory: empty

## Important
The browser uses the Supabase anon key only. Never add a service-role key to frontend files.

## File ownership
- `css/app.css`: tokens, layout, global styles
- `css/dark.css`: dark theme overrides
- `css/components.css`: reusable component additions
- `css/responsive.css`: mobile/tablet behavior
- `js/supabase.js`: Supabase client and shared role constants
- `js/i18n.js`: English/Spanish text and preference behavior
- `js/theme.js`: appearance-specific behavior going forward
- `js/auth.js`: login, session and role checks
- `js/dashboard.js`: live dashboard queries
- `js/requisitions.js`: requisition CRUD/read behavior
- `js/app.js`: navigation, helpers and startup


## Troubleshooting
If Vercel loads the login screen but buttons do not work:
1. Open browser DevTools → Console.
2. Check the first red JavaScript error.
3. Catalyst JS files are loaded from `/js/`; `app.js` is the bootstrap file.

## Release candidate backend
Before deploying this release candidate, run `sql/catalyst_release_backend.sql` once in Supabase SQL Editor. It installs the operational RPCs for candidate creation, stage movement, interviews, feedback, offer workflow, automatic Hire creation and marking a provisioned Hire as started.

Then run `sql/release_validation.sql` (read-only) to confirm the expected functions are present.

Use `RELEASE_CHECKLIST.md` for the end-to-end launch test.
