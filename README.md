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
