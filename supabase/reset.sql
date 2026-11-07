-- =====================================================================
-- HYPE — REINICIO (⚠️ DESTRUCTIVO)
--
-- Borra las tablas de Hype (y las de versiones anteriores: stories,
-- direct_messages, friendships…) con TODOS sus datos. Úsalo solo si tu
-- proyecto tiene un esquema viejo/incompatible y no te importa perder esos
-- datos. Los usuarios de auth.users NO se borran.
--
-- Después ejecuta supabase/schema.sql.
-- =====================================================================

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.story_views,
  public.stories,
  public.calls,
  public.ai_requests,
  public.messages,
  public.conversation_members,
  public.conversations,
  public.game_scores,
  public.notifications,
  public.bookmarks,
  public.bookmark_folders,
  public.follows,
  public.comments,
  public.poll_votes,
  public.project_hypes,
  public.hypes,
  public.posts,
  public.projects,
  public.group_members,
  public.groups,
  public.profiles,
  -- tablas de versiones antiguas de la app
  public.stories,
  public.direct_messages,
  public.friendships,
  public.likes
cascade;

drop function if exists
  public.handle_new_user(),
  public.create_profile_for(uuid, text, jsonb),
  public.ensure_profile(),
  public.delete_my_account(),
  public.is_group_member(uuid),
  public.is_group_admin(uuid),
  public.can_view_group(uuid),
  public.is_following(uuid),
  public.can_view_post(uuid),
  public.is_conversation_member(uuid),
  public.notify_mentions(text, uuid, uuid, uuid, uuid),
  public.create_post(jsonb, text, text, uuid, boolean, uuid, jsonb),
  public.create_post(jsonb, text, text, uuid, boolean, uuid, jsonb, uuid),
  public.vote_poll(uuid, int[]),
  public.get_or_create_dm(uuid),
  public.my_conversations(),
  public.game_leaderboard(text, int),
  public.trending_tags(int, int),
  public.tg_touch_updated_at(),
  public.tg_posts_before_insert(),
  public.tg_posts_before_update(),
  public.tg_posts_after(),
  public.tg_hypes(),
  public.tg_project_hypes(),
  public.tg_comments(),
  public.tg_follows(),
  public.tg_groups_before_insert(),
  public.tg_groups_after_insert(),
  public.tg_group_members(),
  public.tg_projects_before_insert(),
  public.tg_messages_after(),
  public.tg_calls_before_insert(),
  public.tg_stories_before_insert(),
  public.tg_profiles_pinned_check()
cascade;
