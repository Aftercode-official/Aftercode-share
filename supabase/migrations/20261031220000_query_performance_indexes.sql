-- Keep the chat's newest-first page and timestamp/id cursor scans efficient.
create index if not exists chat_messages_created_id_idx
  on public.chat_messages (created_at desc, id desc);

-- Profiles load a user's favorites in newest-first order. The primary key is
-- project_id/user_id, so it cannot efficiently serve this user_id-led query.
create index if not exists project_favorites_user_created_idx
  on public.project_favorites (user_id, created_at desc)
  include (project_id);

-- Follower/following counts and lists filter by each side of the relationship.
create index if not exists follows_following_id_idx
  on public.follows (following_id)
  include (follower_id);

create index if not exists follows_follower_id_idx
  on public.follows (follower_id)
  include (following_id);
