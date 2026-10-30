# Aftercode Share

Aftercode Share is a React + Vite app for discovering and sharing Scratch projects. Its API is deployed as Vercel Functions and uses Supabase Auth and PostgreSQL.

## Backend setup

1. Create a Supabase project and enable email/password sign-in under **Authentication → Providers**.
2. Run [`supabase/migrations/20261011000000_create_projects.sql`](./supabase/migrations/20261011000000_create_projects.sql) in the Supabase SQL Editor.
3. Run [`supabase/migrations/20261012000000_add_community_features.sql`](./supabase/migrations/20261012000000_add_community_features.sql) to add project interactions, activity, notifications, and events.
4. Run [`supabase/migrations/20261014000000_add_global_chat.sql`](./supabase/migrations/20261014000000_add_global_chat.sql) to add the shared community chat.
5. Run [`supabase/migrations/20261015000000_add_chat_media.sql`](./supabase/migrations/20261015000000_add_chat_media.sql) to enable public chat image and video attachments.
6. Run [`supabase/migrations/20261029000000_add_featured_projects.sql`](./supabase/migrations/20261029000000_add_featured_projects.sql) to add admin-managed featured projects.
7. Copy `.env.example` to `.env.local` and fill in the values:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public client settings. Use these with Supabase Auth in the browser.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only settings used by Vercel Functions. Never expose or prefix the service role key with `VITE_`.
   - `EVENT_ADMIN_USER_IDS` is a comma-separated list of Supabase user UUIDs allowed to create events. Leave it unset to disable event creation through the API.
8. The Admin Panel and admin APIs allow the `katboizz` and `thinh1234231t` accounts, configured in `shared/adminUsers.js`. Apply `supabase/migrations/20261031170000_add_thinh_admin.sql` in the Supabase SQL Editor so both admins can send global announcements.
9. Add the same variables to the Vercel project's Environment Variables. Deploy the project to make the `api/` functions available.

`npm run dev` starts the Vite frontend only. To run the Vercel Functions locally, use `npx vercel dev` after configuring the Vercel project and its local environment variables.

Use Node.js 22 LTS for local development and the Vercel CLI. Node 24 can trigger a Windows libuv assertion in some Vercel CLI runs. The repository pins Node 22 in `.nvmrc` and `package.json`.

For local Vercel Functions, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Vercel project's Development environment, then run `npx vercel pull --environment=development` to sync them into `.vercel/`. `vercel dev` does not read the Vite-only `VITE_` settings as server secrets.

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

All API URLs are rewritten to a single Vercel function in `api/index.js` and dispatched by `serverless-handlers/dispatcher.js`, keeping the deployment within the Hobby plan's serverless-function limit.

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

Project creation, likes, and comments automatically add community activity; likes and comments also notify the project owner. The frontend loads public projects and signed-in activity/notifications from the API. Vercel Functions are not served by plain `npm run dev`; use `npx vercel dev` locally or deploy the project to Vercel.

The Community Chat is shared by all visitors. Anyone can read recent messages; signed-in users can post messages up to 1,000 characters. It refreshes automatically while the chat view is open. Share a project from its detail page to copy an `?projectId=` link; posting that link in chat creates a clickable card with the project thumbnail and details.

The header's **Sign In** and home page's **Get Started** buttons open the email sign-in / account creation dialog. Account creation may require email confirmation depending on the Supabase project's Authentication settings. Scratch account verification is not included yet.
