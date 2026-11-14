# Ambition Action Tracker

A local-first performance and promotion-readiness action tracker. It contains 20 strategic parent activities, each with editable personal action notes and any number of independently checkable subtasks.

## Current features
- Narrow, collapsible left sidebar with four activity groups
- 20 large action cards with original guidance always visible
- Editable "My actual action / work" field for each activity
- Add, edit, complete, and remove multiple subtasks per activity
- Independent completion checkbox for each parent activity and subtask
- Overall progress and category completion counts
- Automatic local browser storage
- JSON backup export
- Neon connection status endpoint, database name and database-size display when configured

## Local-first data storage
The browser stores activity notes, completion state, and subtasks in localStorage under `ambitionaction-data-v2`. Existing completion checkboxes from the previous tracker are migrated on first load. Data is local to the browser profile and is not yet synchronized to Neon.

Use **Export backup** regularly. Clearing browser site data or using a different browser/device can make local data unavailable.

## Neon connection (prepared, not yet configured)
The Vercel function at `/api/db-status` checks the Neon connection using the server-side `DATABASE_URL` environment variable. It returns only the current database name and database size; it never sends credentials to the browser.

To connect later:
1. Create or select the Neon project and database you want to use.
2. In Vercel, open the project **Settings → Environment Variables**.
3. Add `DATABASE_URL` with the Neon pooled connection string for the required deployment environments.
4. Redeploy the project.
5. Confirm that the sidebar shows the green **Neon connected** indicator and the actual database name and size.

No Neon schema has been created and no task data is written to Neon yet. The app remains local-only until the database schema, secure task API, and local-to-Neon sync workflow are deliberately implemented. The PostgreSQL package is included for the future server-side connection.

## Vercel
The root `index.html` is the frontend. The `api/` directory contains Vercel Node.js functions. Vercel installs the `pg` dependency from `package.json`.

No frontend build command is required.
