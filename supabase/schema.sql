-- =====================================================================
-- HYPE — esquema de base de datos para Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es idempotente: puedes volver a ejecutarlo para actualizar funciones y políticas.
--
-- Si vienes de una versión anterior de Hype con tablas distintas (profiles,
-- posts, messages, friendships…), ejecuta antes supabase/reset.sql
-- (¡borra esos datos!).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  avatar_emoji text,
  banner_url text,
  links jsonb not null default '[]'::jsonb,
  interests text[] not null default '{}',
  dm_policy text not null default 'everyone',
  onboarded boolean not null default false,
  verified boolean not null default false,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  posts_count integer not null default 0,
  hype_received integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  constraint profiles_dm_policy check (dm_policy in ('everyone', 'followers', 'nobody')),
  constraint profiles_bio_len check (char_length(bio) <= 500),
  constraint profiles_name_len check (char_length(display_name) <= 60),
  constraint profiles_links_array check (jsonb_typeof(links) = 'array')
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  emoji text not null default '👥',
  color text[] not null default array['#8b5cf6', '#ec4899'],
  cover_url text,
  is_private boolean not null default false,
  tags text[] not null default '{}',
  owner_id uuid not null,
  member_count integer not null default 0,
  post_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint groups_owner_fk foreign key (owner_id) references public.profiles (id) on delete cascade,
  constraint groups_slug_format check (slug ~ '^[a-z0-9-]{3,48}$'),
  constraint groups_name_len check (char_length(name) between 3 and 60),
  constraint groups_desc_len check (char_length(description) <= 500)
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_user_fk foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint group_members_role check (role in ('owner', 'admin', 'member')),
  constraint group_members_status check (status in ('active', 'pending'))
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  cover_url text,
  emoji text not null default '🚀',
  color text[] not null default array['#8b5cf6', '#ec4899'],
  demo_url text,
  repo_url text,
  tags text[] not null default '{}',
  stage text not null default 'building',
  hype_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_owner_fk foreign key (owner_id) references public.profiles (id) on delete cascade,
  constraint projects_stage check (stage in ('idea', 'building', 'beta', 'launched')),
  constraint projects_name_len check (char_length(name) between 2 and 80),
  constraint projects_tagline_len check (char_length(tagline) <= 140),
  constraint projects_desc_len check (char_length(description) <= 10000)
);
create index if not exists projects_created_idx on public.projects (created_at desc);
create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists projects_tags_idx on public.projects using gin (tags);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  kind text not null default 'post',
  body text not null default '',
  media jsonb not null default '[]'::jsonb,
  poll jsonb,
  poll_counts integer[],
  poll_voters integer not null default 0,
  group_id uuid,
  project_id uuid,
  game jsonb,
  thread_root_id uuid,
  thread_index integer not null default 0,
  thread_count integer not null default 1,
  visibility text not null default 'public',
  sensitive boolean not null default false,
  tags text[] not null default '{}',
  hype_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint posts_author_fk foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint posts_group_fk foreign key (group_id) references public.groups (id) on delete cascade,
  constraint posts_project_fk foreign key (project_id) references public.projects (id) on delete set null,
  constraint posts_thread_fk foreign key (thread_root_id) references public.posts (id) on delete cascade,
  constraint posts_kind check (kind in ('post', 'short', 'game', 'project')),
  constraint posts_visibility check (visibility in ('public', 'followers')),
  constraint posts_body_len check (char_length(body) <= 4000),
  constraint posts_media_array check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 4),
  constraint posts_thread_index check (thread_index between 0 and 24)
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_group_idx on public.posts (group_id, created_at desc) where group_id is not null;
create index if not exists posts_thread_idx on public.posts (thread_root_id, thread_index) where thread_root_id is not null;
create index if not exists posts_tags_idx on public.posts using gin (tags);
create index if not exists posts_kind_idx on public.posts (kind, created_at desc);

create table if not exists public.hypes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists hypes_post_idx on public.hypes (post_id);

create table if not exists public.project_hypes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists project_hypes_project_idx on public.project_hypes (project_id);

create table if not exists public.poll_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_index smallint not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, option_index),
  constraint poll_votes_option check (option_index between 0 and 5)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_author_fk foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint comments_target check (num_nonnulls(post_id, project_id) = 1),
  constraint comments_body_len check (char_length(body) between 1 and 2000)
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_project_idx on public.comments (project_id, created_at);

create table if not exists public.follows (
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_follower_fk foreign key (follower_id) references public.profiles (id) on delete cascade,
  constraint follows_following_fk foreign key (following_id) references public.profiles (id) on delete cascade,
  constraint follows_not_self check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

create table if not exists public.bookmark_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  emoji text not null default '📁',
  created_at timestamptz not null default now(),
  constraint bookmark_folders_name_len check (char_length(name) between 1 and 40)
);
create unique index if not exists bookmark_folders_name_key on public.bookmark_folders (user_id, lower(name));

create table if not exists public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  folder_id uuid references public.bookmark_folders (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists bookmarks_folder_idx on public.bookmarks (user_id, folder_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  type text not null,
  post_id uuid references public.posts (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_user_fk foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint notifications_actor_fk foreign key (actor_id) references public.profiles (id) on delete cascade,
  constraint notifications_type check (type in ('hype', 'comment', 'follow', 'mention', 'project_hype', 'project_comment', 'group_request', 'group_joined', 'system'))
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.game_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game_id text not null,
  score integer not null,
  created_at timestamptz not null default now(),
  constraint game_scores_game check (game_id ~ '^[a-z0-9-]{2,32}$'),
  constraint game_scores_score check (score between 0 and 10000000)
);
create index if not exists game_scores_board_idx on public.game_scores (game_id, score desc);
create index if not exists game_scores_user_idx on public.game_scores (user_id, game_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message text,
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_sender_fk foreign key (sender_id) references public.profiles (id) on delete cascade,
  constraint messages_body_len check (char_length(body) between 1 and 4000)
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- Registro de uso de Hype IA (lo escribe la Edge Function con la service role).
create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null default 'chat',
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_idx on public.ai_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES (security definer: evitan recursión en RLS)
-- ---------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'));
$$;

create or replace function public.can_view_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = gid and (not g.is_private or public.is_group_member(g.id)));
$$;

create or replace function public.is_following(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = target);
$$;

create or replace function public.can_view_post(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = pid
      and (p.group_id is null or public.can_view_group(p.group_id))
      and (p.visibility = 'public' or p.author_id = auth.uid() or public.is_following(p.author_id))
  );
$$;

create or replace function public.is_conversation_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = cid and m.user_id = auth.uid());
$$;

-- Puntuaciones "hot" (campos calculados que PostgREST puede usar en order=)
create or replace function public.post_hot_score(p public.posts)
returns double precision language sql stable as $$
  select (p.hype_count * 2 + p.comment_count * 3 + 1)::double precision
       / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.35);
$$;

create or replace function public.project_hot_score(p public.projects)
returns double precision language sql stable as $$
  select (p.hype_count * 2 + p.comment_count * 3 + 1)::double precision
       / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.2);
$$;

-- ---------------------------------------------------------------------
-- 3. PERFILES AUTOMÁTICOS
-- ---------------------------------------------------------------------

create or replace function public.create_profile_for(p_uid uuid, p_email text, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_candidate text;
  v_tries int := 0;
begin
  if exists (select 1 from public.profiles where id = p_uid) then return; end if;
  v_base := lower(regexp_replace(coalesce(nullif(p_meta->>'username', ''), split_part(coalesce(p_email, ''), '@', 1), 'user'), '[^a-zA-Z0-9_.]', '', 'g'));
  if char_length(v_base) < 3 then v_base := v_base || 'user'; end if;
  v_base := left(v_base, 18);
  v_candidate := v_base;
  while exists (select 1 from public.profiles where lower(username) = lower(v_candidate)) and v_tries < 25 loop
    v_tries := v_tries + 1;
    v_candidate := v_base || (floor(random() * 9000) + 1000)::int::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    p_uid,
    v_candidate,
    left(coalesce(nullif(p_meta->>'display_name', ''), nullif(p_meta->>'full_name', ''), nullif(p_meta->>'name', ''), v_candidate), 60),
    coalesce(nullif(p_meta->>'avatar_url', ''), nullif(p_meta->>'picture', ''))
  )
  on conflict (id) do nothing;
end $$;
revoke execute on function public.create_profile_for(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.create_profile_for(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Crea el perfil si falta (usuarios creados antes de instalar el esquema).
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_user record;
  v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if found then return v_profile; end if;
  select id, email, raw_user_meta_data into v_user from auth.users where id = auth.uid();
  perform public.create_profile_for(v_user.id, v_user.email, coalesce(v_user.raw_user_meta_data, '{}'::jsonb));
  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end $$;

-- Perfiles para usuarios que ya existían.
insert into public.profiles (id, username, display_name)
select u.id,
       'user' || substr(replace(u.id::text, '-', ''), 1, 10),
       left(coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, ''), '@', 1), ''), 60)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 4. TRIGGERS: validación, contadores y notificaciones
-- ---------------------------------------------------------------------

create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.tg_touch_updated_at();
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.tg_touch_updated_at();

-- Posts: saneado al insertar (contadores a cero, hashtags, encuestas, hilos)
create or replace function public.tg_posts_before_insert()
returns trigger language plpgsql as $$
declare
  v_opts int;
  v_closes timestamptz;
  v_root record;
begin
  new.hype_count := 0;
  new.comment_count := 0;
  new.poll_voters := 0;
  new.created_at := now();
  new.edited_at := null;
  new.tags := coalesce((
    select array_agg(distinct lower(m[1]))
    from regexp_matches(new.body, '(?:^|[^[:alnum:]_&#/])#([[:alnum:]_]{2,40})', 'g') as m
  ), '{}');
  if new.poll is not null then
    if jsonb_typeof(new.poll->'options') <> 'array' then raise exception 'Encuesta inválida'; end if;
    v_opts := jsonb_array_length(new.poll->'options');
    if v_opts < 2 or v_opts > 6 then raise exception 'Una encuesta necesita entre 2 y 6 opciones'; end if;
    if exists (select 1 from jsonb_array_elements_text(new.poll->'options') o where char_length(trim(o)) not between 1 and 80) then
      raise exception 'Cada opción debe tener entre 1 y 80 caracteres';
    end if;
    begin
      v_closes := (new.poll->>'closes_at')::timestamptz;
    exception when others then
      v_closes := null;
    end;
    if v_closes is null or v_closes <= now() or v_closes > now() + interval '8 days' then
      v_closes := now() + interval '1 day';
    end if;
    new.poll := jsonb_build_object('options', new.poll->'options', 'multiple', coalesce((new.poll->>'multiple')::boolean, false), 'closes_at', v_closes);
    new.poll_counts := array_fill(0, array[v_opts]);
  else
    new.poll_counts := null;
  end if;
  if new.thread_root_id is not null and new.thread_root_id <> new.id then
    select author_id, group_id, visibility into v_root from public.posts where id = new.thread_root_id;
    if not found or v_root.author_id <> new.author_id then raise exception 'Hilo inválido'; end if;
    new.group_id := v_root.group_id;
    new.visibility := v_root.visibility;
  end if;
  if new.thread_index > 0 then new.thread_count := 1; end if;
  return new;
end $$;

drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert before insert on public.posts for each row execute function public.tg_posts_before_insert();

create or replace function public.tg_posts_before_update()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
    new.tags := coalesce((
      select array_agg(distinct lower(m[1]))
      from regexp_matches(new.body, '(?:^|[^[:alnum:]_&#/])#([[:alnum:]_]{2,40})', 'g') as m
    ), '{}');
  end if;
  return new;
end $$;

drop trigger if exists posts_before_update on public.posts;
create trigger posts_before_update before update on public.posts for each row execute function public.tg_posts_before_update();

-- Notifica menciones @usuario de un texto
create or replace function public.notify_mentions(p_text text, p_actor uuid, p_post uuid, p_project uuid, p_skip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_uid uuid;
begin
  for v_name in
    select distinct rtrim(lower(m[1]), '.')
    from regexp_matches(coalesce(p_text, ''), '(?:^|[^[:alnum:]_@.])@([a-zA-Z0-9_.]{3,24})', 'g') as m
  loop
    select id into v_uid from public.profiles where lower(username) = v_name;
    if v_uid is not null and v_uid <> p_actor and v_uid is distinct from p_skip then
      insert into public.notifications (user_id, actor_id, type, post_id, project_id)
      values (v_uid, p_actor, 'mention', p_post, p_project);
    end if;
  end loop;
end $$;
revoke execute on function public.notify_mentions(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_posts_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.thread_index = 0 then
      update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
      if new.group_id is not null then
        update public.groups set post_count = post_count + 1 where id = new.group_id;
      end if;
    end if;
    perform public.notify_mentions(new.body, new.author_id, coalesce(new.thread_root_id, new.id), null, null);
    return new;
  end if;
  if old.thread_index = 0 then
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = old.author_id;
    if old.group_id is not null then
      update public.groups set post_count = greatest(post_count - 1, 0) where id = old.group_id;
    end if;
  end if;
  return old;
end $$;

drop trigger if exists posts_after on public.posts;
create trigger posts_after after insert or delete on public.posts for each row execute function public.tg_posts_after();

create or replace function public.tg_hypes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set hype_count = hype_count + 1 where id = new.post_id returning author_id into v_author;
    if v_author is not null then
      update public.profiles set hype_received = hype_received + 1 where id = v_author;
      if v_author <> new.user_id and not exists (
        select 1 from public.notifications n where n.user_id = v_author and n.actor_id = new.user_id and n.type = 'hype' and n.post_id = new.post_id
      ) then
        insert into public.notifications (user_id, actor_id, type, post_id) values (v_author, new.user_id, 'hype', new.post_id);
      end if;
    end if;
    return new;
  end if;
  update public.posts set hype_count = greatest(hype_count - 1, 0) where id = old.post_id returning author_id into v_author;
  if v_author is not null then
    update public.profiles set hype_received = greatest(hype_received - 1, 0) where id = v_author;
  end if;
  return old;
end $$;

drop trigger if exists hypes_after on public.hypes;
create trigger hypes_after after insert or delete on public.hypes for each row execute function public.tg_hypes();

create or replace function public.tg_project_hypes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.projects set hype_count = hype_count + 1 where id = new.project_id returning owner_id into v_owner;
    if v_owner is not null and v_owner <> new.user_id and not exists (
      select 1 from public.notifications n where n.user_id = v_owner and n.actor_id = new.user_id and n.type = 'project_hype' and n.project_id = new.project_id
    ) then
      insert into public.notifications (user_id, actor_id, type, project_id) values (v_owner, new.user_id, 'project_hype', new.project_id);
    end if;
    return new;
  end if;
  update public.projects set hype_count = greatest(hype_count - 1, 0) where id = old.project_id;
  return old;
end $$;

drop trigger if exists project_hypes_after on public.project_hypes;
create trigger project_hypes_after after insert or delete on public.project_hypes for each row execute function public.tg_project_hypes();

create or replace function public.tg_comments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    if new.post_id is not null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id returning author_id into v_owner;
      if v_owner is not null and v_owner <> new.author_id then
        insert into public.notifications (user_id, actor_id, type, post_id, body) values (v_owner, new.author_id, 'comment', new.post_id, left(new.body, 140));
      end if;
    else
      update public.projects set comment_count = comment_count + 1 where id = new.project_id returning owner_id into v_owner;
      if v_owner is not null and v_owner <> new.author_id then
        insert into public.notifications (user_id, actor_id, type, project_id, body) values (v_owner, new.author_id, 'project_comment', new.project_id, left(new.body, 140));
      end if;
    end if;
    perform public.notify_mentions(new.body, new.author_id, new.post_id, new.project_id, v_owner);
    return new;
  end if;
  if old.post_id is not null then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  else
    update public.projects set comment_count = greatest(comment_count - 1, 0) where id = old.project_id;
  end if;
  return old;
end $$;

drop trigger if exists comments_after on public.comments;
create trigger comments_after after insert or delete on public.comments for each row execute function public.tg_comments();

create or replace function public.tg_follows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    if not exists (select 1 from public.notifications n where n.user_id = new.following_id and n.actor_id = new.follower_id and n.type = 'follow') then
      insert into public.notifications (user_id, actor_id, type) values (new.following_id, new.follower_id, 'follow');
    end if;
    return new;
  end if;
  update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
  return old;
end $$;

drop trigger if exists follows_after on public.follows;
create trigger follows_after after insert or delete on public.follows for each row execute function public.tg_follows();

create or replace function public.tg_groups_before_insert()
returns trigger language plpgsql as $$
begin
  new.member_count := 0;
  new.post_count := 0;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists groups_before_insert on public.groups;
create trigger groups_before_insert before insert on public.groups for each row execute function public.tg_groups_before_insert();

create or replace function public.tg_groups_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists groups_after_insert on public.groups;
create trigger groups_after_insert after insert on public.groups for each row execute function public.tg_groups_after_insert();

create or replace function public.tg_group_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      update public.groups set member_count = member_count + 1 where id = new.group_id;
    else
      insert into public.notifications (user_id, actor_id, type, group_id)
      select m.user_id, new.user_id, 'group_request', new.group_id
      from public.group_members m
      where m.group_id = new.group_id and m.status = 'active' and m.role in ('owner', 'admin');
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'active' and new.status = 'active' then
      update public.groups set member_count = member_count + 1 where id = new.group_id;
      insert into public.notifications (user_id, actor_id, type, group_id) values (new.user_id, auth.uid(), 'group_joined', new.group_id);
    elsif old.status = 'active' and new.status <> 'active' then
      update public.groups set member_count = greatest(member_count - 1, 0) where id = new.group_id;
    end if;
    return new;
  end if;
  if old.status = 'active' then
    update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  end if;
  return old;
end $$;

drop trigger if exists group_members_after on public.group_members;
create trigger group_members_after after insert or update or delete on public.group_members for each row execute function public.tg_group_members();

create or replace function public.tg_projects_before_insert()
returns trigger language plpgsql as $$
begin
  new.hype_count := 0;
  new.comment_count := 0;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists projects_before_insert on public.projects;
create trigger projects_before_insert before insert on public.projects for each row execute function public.tg_projects_before_insert();

create or replace function public.tg_messages_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message = left(new.body, 140), last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;

drop trigger if exists messages_after on public.messages;
create trigger messages_after after insert on public.messages for each row execute function public.tg_messages_after();

-- ---------------------------------------------------------------------
-- 5. RPCs (funciones que llama la app)
-- ---------------------------------------------------------------------

-- Publica un post o un hilo completo en una sola transacción.
create or replace function public.create_post(
  p_parts jsonb,
  p_kind text default 'post',
  p_visibility text default 'public',
  p_group_id uuid default null,
  p_sensitive boolean default false,
  p_project_id uuid default null,
  p_game jsonb default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_root uuid := gen_random_uuid();
  v_n int := jsonb_array_length(coalesce(p_parts, '[]'::jsonb));
  v_part jsonb;
  v_i int := 0;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para publicar'; end if;
  if v_n < 1 or v_n > 25 then raise exception 'Un hilo admite entre 1 y 25 posts'; end if;
  for v_part in select value from jsonb_array_elements(p_parts) loop
    insert into public.posts (id, author_id, kind, body, media, poll, group_id, project_id, game, thread_root_id, thread_index, thread_count, visibility, sensitive)
    values (
      case when v_i = 0 then v_root else gen_random_uuid() end,
      auth.uid(),
      case when v_i = 0 then p_kind else 'post' end,
      coalesce(v_part->>'body', ''),
      coalesce(v_part->'media', '[]'::jsonb),
      case when jsonb_typeof(v_part->'poll') = 'object' then v_part->'poll' end,
      p_group_id,
      case when v_i = 0 then p_project_id end,
      case when v_i = 0 then p_game end,
      case when v_n > 1 then v_root end,
      v_i,
      case when v_i = 0 then v_n else 1 end,
      p_visibility,
      p_sensitive
    );
    v_i := v_i + 1;
  end loop;
  return v_root;
end $$;

-- Vota en una encuesta (valida cierre, voto único y opción múltiple).
create or replace function public.vote_poll(p_post_id uuid, p_options int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_post public.posts;
  v_n int;
  v_opts int[];
  v_counts int[];
begin
  if auth.uid() is null then raise exception 'Inicia sesión para votar'; end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.poll is null or not public.can_view_post(p_post_id) then raise exception 'Encuesta no encontrada'; end if;
  if (v_post.poll->>'closes_at')::timestamptz <= now() then raise exception 'La encuesta ya cerró'; end if;
  if exists (select 1 from public.poll_votes where post_id = p_post_id and user_id = auth.uid()) then raise exception 'Ya votaste en esta encuesta'; end if;
  v_n := jsonb_array_length(v_post.poll->'options');
  select array_agg(distinct o) into v_opts from unnest(p_options) as o where o >= 0 and o < v_n;
  if v_opts is null then raise exception 'Elige una opción válida'; end if;
  if not coalesce((v_post.poll->>'multiple')::boolean, false) and array_length(v_opts, 1) > 1 then
    raise exception 'Solo puedes elegir una opción';
  end if;
  insert into public.poll_votes (post_id, user_id, option_index) select p_post_id, auth.uid(), o from unnest(v_opts) as o;
  select array_agg(coalesce(c.cnt, 0)::int order by g.i) into v_counts
  from generate_series(0, v_n - 1) as g(i)
  left join (select option_index, count(*) as cnt from public.poll_votes where post_id = p_post_id group by option_index) c on c.option_index = g.i;
  update public.posts set poll_counts = v_counts, poll_voters = poll_voters + 1 where id = p_post_id;
  return jsonb_build_object('counts', to_jsonb(v_counts), 'voters', v_post.poll_voters + 1, 'my_votes', to_jsonb(v_opts));
end $$;

-- Abre (o crea) una conversación privada con otra persona.
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
  v_policy text;
begin
  if v_me is null then raise exception 'Inicia sesión'; end if;
  if p_other = v_me then raise exception 'No puedes escribirte a ti mismo'; end if;
  select dm_policy into v_policy from public.profiles where id = p_other;
  if not found then raise exception 'Usuario no encontrado'; end if;
  select a.conversation_id into v_conv
  from public.conversation_members a
  join public.conversation_members b on b.conversation_id = a.conversation_id and b.user_id = p_other
  where a.user_id = v_me
  limit 1;
  if v_conv is not null then return v_conv; end if;
  if v_policy = 'nobody' then raise exception 'Este usuario no acepta mensajes'; end if;
  if v_policy = 'followers' and not exists (select 1 from public.follows where follower_id = p_other and following_id = v_me) then
    raise exception 'Este usuario solo acepta mensajes de quienes sigue';
  end if;
  insert into public.conversations default values returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_me), (v_conv, p_other);
  return v_conv;
end $$;

create or replace function public.my_conversations()
returns table (
  id uuid, last_message text, last_message_at timestamptz, unread boolean,
  other_id uuid, other_username text, other_display_name text, other_avatar_url text, other_avatar_emoji text
) language sql stable security definer set search_path = public as $$
  select c.id, c.last_message, c.last_message_at,
         exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at),
         p.id, p.username, p.display_name, p.avatar_url, p.avatar_emoji
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_members o on o.conversation_id = c.id and o.user_id <> me.user_id
  join public.profiles p on p.id = o.user_id
  where me.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

create or replace function public.game_leaderboard(p_game_id text, p_limit int default 10)
returns table (user_id uuid, username text, display_name text, avatar_url text, avatar_emoji text, best integer, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.user_id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_emoji, t.score, t.created_at
  from (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at
    from public.game_scores s
    where s.game_id = p_game_id
    order by s.user_id, s.score desc, s.created_at asc
  ) t
  join public.profiles pr on pr.id = t.user_id
  order by t.score desc, t.created_at asc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.trending_tags(p_limit int default 8, p_days int default 7)
returns table (tag text, uses bigint)
language sql stable security invoker set search_path = public as $$
  select t.tag, count(*) as uses
  from public.posts p, unnest(p.tags) as t(tag)
  where p.created_at > now() - make_interval(days => p_days)
  group by t.tag
  order by uses desc, t.tag
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------
-- 6. SEGURIDAD: RLS + permisos por columna
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.projects enable row level security;
alter table public.posts enable row level security;
alter table public.hypes enable row level security;
alter table public.project_hypes enable row level security;
alter table public.poll_votes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.bookmark_folders enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.game_scores enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.ai_requests enable row level security;

-- Perfiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update on public.profiles from anon, authenticated;
grant update (username, display_name, bio, avatar_url, avatar_emoji, banner_url, links, interests, dm_policy, onboarded) on public.profiles to authenticated;

-- Grupos
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select using (true);
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated using (owner_id = auth.uid());
revoke update on public.groups from anon, authenticated;
grant update (name, description, emoji, color, cover_url, is_private, tags) on public.groups to authenticated;

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select using (user_id = auth.uid() or public.can_view_group(group_id));
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members for insert to authenticated with check (
  user_id = auth.uid()
  and role = 'member'
  and status = (case when (select g.is_private from public.groups g where g.id = group_id) then 'pending' else 'active' end)
);
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (role in ('admin', 'member'));
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members for delete to authenticated
  using ((user_id = auth.uid() or public.is_group_admin(group_id)) and role <> 'owner');
revoke update on public.group_members from anon, authenticated;
grant update (role, status) on public.group_members to authenticated;

-- Proyectos
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using (true);
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using (owner_id = auth.uid());
revoke update on public.projects from anon, authenticated;
grant update (name, tagline, description, cover_url, emoji, color, demo_url, repo_url, tags, stage) on public.projects to authenticated;

-- Posts
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select using (
  (group_id is null or public.can_view_group(group_id))
  and (visibility = 'public' or author_id = auth.uid() or public.is_following(author_id))
);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check (
  author_id = auth.uid() and (group_id is null or public.is_group_member(group_id))
);
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (
  author_id = auth.uid() or (group_id is not null and public.is_group_admin(group_id))
);
revoke update on public.posts from anon, authenticated;
grant update (body, sensitive) on public.posts to authenticated;

-- Hype
drop policy if exists hypes_select on public.hypes;
create policy hypes_select on public.hypes for select using (user_id = auth.uid() or public.can_view_post(post_id));
drop policy if exists hypes_insert on public.hypes;
create policy hypes_insert on public.hypes for insert to authenticated with check (user_id = auth.uid() and public.can_view_post(post_id));
drop policy if exists hypes_delete on public.hypes;
create policy hypes_delete on public.hypes for delete to authenticated using (user_id = auth.uid());
revoke update on public.hypes from anon, authenticated;

drop policy if exists project_hypes_select on public.project_hypes;
create policy project_hypes_select on public.project_hypes for select using (true);
drop policy if exists project_hypes_insert on public.project_hypes;
create policy project_hypes_insert on public.project_hypes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists project_hypes_delete on public.project_hypes;
create policy project_hypes_delete on public.project_hypes for delete to authenticated using (user_id = auth.uid());
revoke update on public.project_hypes from anon, authenticated;

-- Votos de encuestas: privados (cada quien ve los suyos); se crean con vote_poll()
drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select using (user_id = auth.uid());
revoke insert, update, delete on public.poll_votes from anon, authenticated;

-- Comentarios
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (
  project_id is not null or (post_id is not null and public.can_view_post(post_id))
);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check (
  author_id = auth.uid() and (project_id is not null or (post_id is not null and public.can_view_post(post_id)))
);
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using (
  author_id = auth.uid()
  or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  or exists (select 1 from public.projects pr where pr.id = project_id and pr.owner_id = auth.uid())
);
revoke update on public.comments from anon, authenticated;

-- Seguidores
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());
revoke update on public.follows from anon, authenticated;

-- Marcadores y carpetas: 100% privados
drop policy if exists bookmark_folders_all on public.bookmark_folders;
create policy bookmark_folders_all on public.bookmark_folders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists bookmarks_all on public.bookmarks;
create policy bookmarks_all on public.bookmarks for all to authenticated using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (folder_id is null or exists (select 1 from public.bookmark_folders f where f.id = folder_id and f.user_id = auth.uid()))
);

-- Notificaciones
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Juegos
drop policy if exists game_scores_select on public.game_scores;
create policy game_scores_select on public.game_scores for select using (true);
drop policy if exists game_scores_insert on public.game_scores;
create policy game_scores_insert on public.game_scores for insert to authenticated with check (user_id = auth.uid());
revoke update, delete on public.game_scores from anon, authenticated;

-- Mensajes privados
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated using (public.is_conversation_member(id));
revoke insert, update, delete on public.conversations from anon, authenticated;
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.conversation_members from anon, authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
revoke update on public.messages from anon, authenticated;

-- ai_requests: sin políticas → solo la service role (Edge Function) puede leer/escribir.
revoke all on public.ai_requests from anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. STORAGE: bucket público "media" (cada usuario sube a su carpeta <uid>/)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hype media read" on storage.objects;
create policy "hype media read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "hype media insert" on storage.objects;
create policy "hype media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "hype media update" on storage.objects;
create policy "hype media update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "hype media delete" on storage.objects;
create policy "hype media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 8. REALTIME (posts nuevos, contadores en vivo, notificaciones y mensajes)
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['posts', 'notifications', 'messages'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end $$;

-- Listo ✅  Ahora copia la URL y la anon key del proyecto en config.js
-- (o en la app: Ajustes → Nube).
