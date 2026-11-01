# Aftercode Share

Aftercode Share is a React + Vite app for discovering and sharing Scratch projects. GitHub Pages hosts the frontend and a Supabase Edge Function provides the API backed by Supabase Auth and PostgreSQL.

## Backend setup

1. Create a Supabase project and enable email/password sign-in under **Authentication → Providers**.
2. Run [`supabase/migrations/20261011000000_create_projects.sql`](./supabase/migrations/20261011000000_create_projects.sql) in the Supabase SQL Editor.
3. Run [`supabase/migrations/20261012000000_add_community_features.sql`](./supabase/migrations/20261012000000_add_community_features.sql) to add project interactions, activity, notifications, and events.
4. Run [`supabase/migrations/20261014000000_add_global_chat.sql`](./supabase/migrations/20261014000000_add_global_chat.sql) to add the shared community chat.
5. Run [`supabase/migrations/20261015000000_add_chat_media.sql`](./supabase/migrations/20261015000000_add_chat_media.sql) to enable public chat image and video attachments.
6. Run [`supabase/migrations/20261029000000_add_featured_projects.sql`](./supabase/migrations/20261029000000_add_featured_projects.sql) to add admin-managed featured projects.
7. Copy `.env.example` to `.env.local` and fill in the values:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public client settings. Use these with Supabase Auth in the browser.
   - `VITE_API_BASE_URL` is optional and is mainly useful for local Supabase Edge Function development. Production builds default to `${VITE_SUPABASE_URL}/functions/v1/api`.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only settings. Never expose or prefix the service role key with `VITE_`.
   - `EVENT_ADMIN_USER_IDS` is a comma-separated list of Supabase user UUIDs allowed to create events. Leave it unset to disable event creation through the API.
8. The Admin Panel and admin APIs allow the `katboizz` and `thinh1234231t` accounts, configured in `shared/adminUsers.js`. Apply `supabase/migrations/20261031170000_add_thinh_admin.sql` in the Supabase SQL Editor so both admins can send global announcements.
9. Deploy the API to Supabase Edge Functions as described below. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub Actions variables so the Pages workflow can build the frontend.

## Deploying the API to Supabase Edge Functions

The GitHub Pages frontend can use the `api` Supabase Edge Function instead of Vercel. The function reuses the existing API handlers, validates Supabase access tokens itself, and accepts browser requests from the GitHub Pages site.

1. In a terminal, install/use the Supabase CLI and link this repository to the existing Supabase project:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

2. Deploy the API function:

   ```sh
   npx supabase functions deploy api
   ```

   `supabase/config.toml` disables gateway JWT verification for this function because public read routes are allowed. Protected routes still verify bearer tokens in the API handlers.

3. In the GitHub repository, add Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions → Variables**. The Pages workflow uses these public client settings to build the frontend. Never add the Supabase service-role key to GitHub Pages or a `VITE_` variable; Supabase injects it into Edge Functions.

4. In Supabase **Authentication → URL Configuration**, add `https://aftercode-official.github.io/Aftercode-share/` to the allowed redirect URLs. Set the site URL to the Pages URL if this project no longer uses another production frontend.

5. Apply any unapplied SQL migrations to the Supabase project, including the chat reports/replies migration, then push the frontend workflow to `main`:

   ```sh
   git add README.md .env.example src/api.js serverless-handlers shared/adminUsers.js supabase/config.toml supabase/functions
   git commit -m "Deploy API with Supabase Edge Functions"
   git push origin main
   ```

The Edge Function URL is `${VITE_SUPABASE_URL}/functions/v1/api`. Production frontend API requests use this URL automatically. For local function development, set `VITE_API_BASE_URL=http://127.0.0.1:54321/functions/v1/api` in `.env.local`.

`npm run dev` starts the Vite frontend only. For local API development, start Supabase with `npx supabase start`, then run `npx supabase functions serve api --env-file .env.local`.

Use Node.js 22 LTS for local development. The repository pins Node 22 in `.nvmrc` and `package.json`.

## Uploading Scratch projects

Run the migrations in timestamp order. The final migration creates a public `project-files` Storage bucket with a 50 MB upload limit. Signed-in users can upload `.sb3` files only into their own user-ID folder. Uploaded projects are listed in Explore, run in an embedded TurboWarp player, and can be downloaded as `.sb3`.

## Using Supabase Auth

The frontend uses the public URL and anon key with Supabase Auth. After signing in, send the returned access token to the protected API:

```js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;

const response = await fetch("/api/projects", {
  headers: { Authorization: `Bearer ${data.session.access_token}` }
});
```

## API

All responses use JSON except a successful delete, which returns `204 No Content`. Authenticated requests must send the Supabase access token using the Bearer scheme in the `Authorization` header.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/me` | Validate the token and return the signed-in user |
| `GET` | `/api/projects` | List up to 100 public projects |
| `POST` | `/api/projects` | Create a project for the signed-in user |
| `GET` | `/api/projects/:id` | Get a public project, or the owner's private project |
| `PATCH` | `/api/projects/:id` | Update a project owned by the signed-in user |
| `DELETE` | `/api/projects/:id` | Delete a project owned by the signed-in user |
| `GET` | `/api/project-interactions?projectId=:id` | Get project likes, favorites, and comments |
| `POST` | `/api/project-interactions?projectId=:id` | Like/unlike, favorite/unfavorite, or comment |
| `GET` | `/api/activity` | Get recent activity for public projects (signed-in users) |
| `GET` | `/api/notifications` | Get notifications for the signed-in user |
| `PATCH` | `/api/notifications` | Mark the signed-in user's notifications as read |
| `GET` | `/api/events` | List upcoming public events |
| `POST` | `/api/events` | Create an upcoming public event (configured event administrators only) |
| `GET` | `/api/chat` | List the latest 100 messages in the global community chat |
| `POST` | `/api/chat` | Send a chat message as the signed-in user |

All API routes are handled by one Supabase Edge Function in `supabase/functions/api/index.ts` and dispatched by `serverless-handlers/dispatcher.js`.

Create a project with:

```json
{
  "title": "My Scratch game",
  "scratchProjectId": "123456789",
  "description": "A short description.",
  "category": "Games",
  "tags": ["game", "scratch"],
  "isPublic": true
}
```

To replace an uploaded Scratch project, upload the validated `.sb3` file into the signed-in user's `project-files` folder, then include its storage path as `assetPath` in `PATCH /api/projects/:id`. The API verifies the owner folder, switches the project source to the uploaded file, and removes the previous `.sb3` after the update succeeds.

The API derives the author from the authenticated Supabase user; clients cannot choose an owner. Database row-level security permits public reads while writes go through the ownership-checking API.

Project creation, likes, and comments automatically add community activity; likes and comments also notify the project owner. The frontend loads public projects and signed-in activity/notifications from the API. The API runs locally with `npx supabase functions serve api` or in production as a Supabase Edge Function.

The Community Chat is shared by all visitors. Anyone can read recent messages; signed-in users can post messages up to 1,000 characters. It refreshes automatically while the chat view is open. Share a project from its detail page to copy an `?projectId=` link; posting that link in chat creates a clickable card with the project thumbnail and details.

The header's **Sign In** and home page's **Get Started** buttons open the email sign-in / account creation dialog. Account creation may require email confirmation depending on the Supabase project's Authentication settings. Scratch account verification is not included yet.
