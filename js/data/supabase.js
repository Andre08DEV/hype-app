// Backend NUBE (Supabase): auth, Postgres con RLS, Storage y Realtime.
// Misma API que LocalBackend. Requiere haber ejecutado supabase/schema.sql.
import { bus, state } from '../core/store.js';
import { uuid, excerpt, slugify } from '../core/utils.js';

export const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

const PROFILE_COLS = 'id,username,display_name,avatar_url,avatar_emoji,verified';
const POST_SELECT = `*,author:profiles!posts_author_fk(${PROFILE_COLS}),group:groups!posts_group_fk(id,slug,name,emoji,color,is_private),project:projects!posts_project_fk(id,name,tagline,emoji,color,cover_url,hype_count,stage)`;
const PROJECT_SELECT = `*,owner:profiles!projects_owner_fk(${PROFILE_COLS})`;
const GROUP_SELECT = `*,owner:profiles!groups_owner_fk(${PROFILE_COLS})`;
const D = 24 * 3600e3;

const clean = (q) => String(q || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 80);
const like = (q) => `%${clean(q).replace(/_/g, '\\_')}%`;
const escapeLike = (s) => String(s || '').replace(/[\\%_]/g, (c) => '\\' + c);

export class SupabaseBackend {
  mode = 'cloud';

  constructor({ url, key, clientOptions = null, testUserId = null }) {
    this.url = url.replace(/\/+$/, '');
    this.key = key;
    this.clientOptions = clientOptions;
    this.testUserId = testUserId;
    this.sb = null;
    this.session = null;
    this.uid = null;
    this.profile = null;
    this.schemaReady = true;
    this.botReplyHook = null;
    this._channels = [];
  }

  get host() { try { return new URL(this.url).host; } catch { return this.url; } }
  get appUrl() { return location.origin + location.pathname; }
  get currentUser() { return this.profile; }

  on(event, cb) { return bus.on(event, cb); }

  // ---------------- infraestructura ----------------
  async init() {
    const { createClient } = await import(SUPABASE_CDN);
    this.sb = createClient(this.url, this.key, this.clientOptions || {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'hype-auth' },
    });
    if (this.testUserId) {
      this.uid = this.testUserId;
      this.profile = await this._loadMyProfile();
    } else {
      const { data, error } = await this.sb.auth.getSession();
      if (error) console.warn('[supabase] getSession', error);
      await this._setSession(data?.session || null);
      this.sb.auth.onAuthStateChange((event, session) => {
        // No llamar a Supabase dentro del callback (puede bloquearse): diferimos.
        setTimeout(() => this._onAuthEvent(event, session), 0);
      });
    }
    this._subscribeRealtime();
    return this.currentUser;
  }

  async _onAuthEvent(event, session) {
    const prev = this.uid;
    if (event === 'TOKEN_REFRESHED') { this.session = session; return; }
    if (event === 'PASSWORD_RECOVERY') bus.emit('auth:recovery');
    if ((session?.user?.id || null) === prev && event !== 'USER_UPDATED') return;
    try { await this._setSession(session); } catch (err) { console.error(err); }
    this._subscribeRealtime();
    bus.emit('auth:change', this.currentUser);
  }

  async _setSession(session) {
    this.session = session;
    this.uid = session?.user?.id || null;
    this.profile = this.uid ? await this._loadMyProfile().catch((err) => { if (this._isSchemaError(err)) { this.schemaReady = false; return null; } throw err; }) : null;
  }

  _isSchemaError(err) {
    const code = err?.code || err?.cause?.code;
    return code === 'PGRST205' || code === '42P01' || code === 'PGRST202' || /does not exist|schema cache/i.test(err?.message || '');
  }

  _err(error) {
    if (!error) return new Error('Error desconocido');
    if (this._isSchemaError(error)) {
      this.schemaReady = false;
      const e = new Error('La base de datos no está configurada: ejecuta supabase/schema.sql en tu proyecto de Supabase.');
      e.code = 'SCHEMA';
      return e;
    }
    const map = {
      23505: 'Eso ya existe (dato duplicado)',
      42501: 'No tienes permiso para hacer esto',
      23503: 'El elemento relacionado ya no existe',
      23514: 'Algún dato no es válido',
      PGRST301: 'Tu sesión expiró. Vuelve a iniciar sesión',
    };
    const e = new Error(error.code === 'P0001' ? error.message : (map[error.code] || error.message || 'Error de Supabase'));
    e.code = error.code;
    return e;
  }

  async _q(promise) {
    const { data, error, count } = await promise;
    if (error) throw this._err(error);
    return count !== undefined && count !== null ? { data, count } : data;
  }

  _requireUser() { if (!this.uid) throw new Error('Inicia sesión para hacer esto'); return this.uid; }

  async _token() {
    if (this.clientOptions?.accessToken) return this.clientOptions.accessToken();
    const { data } = await this.sb.auth.getSession();
    return data?.session?.access_token || null;
  }

  async testConnection() {
    const { error } = await this.sb.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw this._err(error);
    return true;
  }

  // ---------------- normalización ----------------
  _profileLite(r) {
    if (!r) return { id: null, username: 'eliminado', displayName: 'Usuario eliminado', avatarUrl: '', avatarEmoji: '' };
    return { id: r.id, username: r.username, displayName: r.display_name || r.username, avatarUrl: r.avatar_url || '', avatarEmoji: r.avatar_emoji || '', verified: !!r.verified };
  }

  _profile(r) {
    if (!r) return null;
    return {
      ...this._profileLite(r), bio: r.bio || '', bannerUrl: r.banner_url || '', links: r.links || [], interests: r.interests || [],
      dmPolicy: r.dm_policy || 'everyone', onboarded: !!r.onboarded, createdAt: r.created_at,
      followers: r.followers_count || 0, following: r.following_count || 0, postsCount: r.posts_count || 0, hypeReceived: r.hype_received || 0,
    };
  }

  _post(r, v = {}) {
    if (!r) return null;
    const poll = r.poll ? {
      options: r.poll.options || [], multiple: !!r.poll.multiple, closesAt: r.poll.closes_at,
      counts: r.poll_counts || (r.poll.options || []).map(() => 0), voters: r.poll_voters || 0,
      myVotes: v.votes?.get(r.id) || [], closed: new Date(r.poll.closes_at).getTime() < Date.now(),
    } : null;
    const g = r.group;
    const pr = r.project;
    return {
      id: r.id, kind: r.kind, authorId: r.author_id, author: this._profileLite(r.author), body: r.body || '', media: r.media || [], poll,
      groupId: r.group_id, group: g ? { id: g.id, slug: g.slug, name: g.name, emoji: g.emoji, color: g.color, isPrivate: g.is_private } : null,
      projectId: r.project_id, project: pr ? { id: pr.id, name: pr.name, tagline: pr.tagline, emoji: pr.emoji, color: pr.color, coverUrl: pr.cover_url || '', hypeCount: pr.hype_count, stage: pr.stage } : null,
      game: r.game, threadRootId: r.thread_root_id, threadIndex: r.thread_index, threadCount: r.thread_count,
      visibility: r.visibility, sensitive: r.sensitive, tags: r.tags || [], hypeCount: r.hype_count || 0, commentCount: r.comment_count || 0,
      hyped: v.hyped?.has(r.id) || false, bookmarked: v.bm?.has(r.id) || false, folderId: v.bm?.get(r.id) || null,
      createdAt: r.created_at, editedAt: r.edited_at,
    };
  }

  async _viewerState(rows) {
    const ids = rows.map((r) => r.id);
    const v = { hyped: new Set(), bm: new Map(), votes: new Map() };
    if (!this.uid || !ids.length) return v;
    const pollIds = rows.filter((r) => r.poll).map((r) => r.id);
    const [h, b, p] = await Promise.all([
      this.sb.from('hypes').select('post_id').eq('user_id', this.uid).in('post_id', ids),
      this.sb.from('bookmarks').select('post_id,folder_id').eq('user_id', this.uid).in('post_id', ids),
      pollIds.length ? this.sb.from('poll_votes').select('post_id,option_index').eq('user_id', this.uid).in('post_id', pollIds) : Promise.resolve({ data: [] }),
    ]);
    (h.data || []).forEach((x) => v.hyped.add(x.post_id));
    (b.data || []).forEach((x) => v.bm.set(x.post_id, x.folder_id));
    (p.data || []).forEach((x) => { if (!v.votes.has(x.post_id)) v.votes.set(x.post_id, []); v.votes.get(x.post_id).push(x.option_index); });
    return v;
  }

  async _posts(rows) {
    const v = await this._viewerState(rows);
    return rows.map((r) => this._post(r, v));
  }

  _group(r, mine = null) {
    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description || '', emoji: r.emoji, color: r.color, coverUrl: r.cover_url || '',
      isPrivate: r.is_private, tags: r.tags || [], ownerId: r.owner_id, owner: this._profileLite(r.owner), memberCount: r.member_count || 0,
      postCount: r.post_count || 0, createdAt: r.created_at, myRole: mine?.role || null, myStatus: mine?.status || null,
    };
  }

  _project(r, hyped = false) {
    return {
      id: r.id, ownerId: r.owner_id, owner: this._profileLite(r.owner), name: r.name, tagline: r.tagline || '', description: r.description || '',
      coverUrl: r.cover_url || '', emoji: r.emoji, color: r.color, demoUrl: r.demo_url || '', repoUrl: r.repo_url || '', tags: r.tags || [],
      stage: r.stage, hypeCount: r.hype_count || 0, commentCount: r.comment_count || 0, hyped, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  _comment(r) { return { id: r.id, postId: r.post_id, projectId: r.project_id, authorId: r.author_id, author: this._profileLite(r.author), body: r.body, createdAt: r.created_at }; }

  _notification(r) {
    return {
      id: r.id, type: r.type, actorId: r.actor_id, actor: r.actor ? this._profileLite(r.actor) : null, body: r.body || '', readAt: r.read_at, createdAt: r.created_at,
      postId: r.post_id, projectId: r.project_id, groupId: r.group_id,
      post: r.post ? { id: r.post.id, kind: r.post.kind, excerpt: excerpt(r.post.body, 120) } : null,
      project: r.project ? { id: r.project.id, name: r.project.name } : null,
      group: r.group ? { id: r.group.id, slug: r.group.slug, name: r.group.name } : null,
    };
  }

  _message(r) { return { id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, body: r.body, createdAt: r.created_at }; }

  // ---------------- realtime ----------------
  _subscribeRealtime() {
    this._channels.forEach((c) => this.sb.removeChannel(c));
    this._channels = [];
    const live = this.sb.channel('hype-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async ({ new: row }) => {
        if (!row || row.thread_index !== 0 || row.author_id === this.uid) return;
        try { bus.emit('post:new', await this.getPost(row.id)); } catch { /* sin acceso */ }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, ({ new: r }) => {
        if (!r) return;
        bus.emit('post:update', {
          id: r.id, hypeCount: r.hype_count, commentCount: r.comment_count, body: r.body, editedAt: r.edited_at,
          ...(r.poll ? { poll: { counts: r.poll_counts, voters: r.poll_voters } } : {}),
        });
      })
      .subscribe();
    this._channels.push(live);
    if (!this.uid) return;
    const mine = this.sb.channel(`hype-user-${this.uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.uid}` }, async ({ new: row }) => {
        try {
          const data = await this._q(this.sb.from('notifications').select(this._notifSelect()).eq('id', row.id).single());
          bus.emit('notification', this._notification(data));
        } catch { /* ignore */ }
        this._emitUnread();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: row }) => {
        bus.emit('message', { conversationId: row.conversation_id, message: this._message(row) });
        this._emitUnread();
      })
      .subscribe();
    this._channels.push(mine);
  }

  async _emitUnread() {
    try { bus.emit('unread:update', await this.unreadCounts()); } catch { /* ignore */ }
  }

  // ---------------- auth ----------------
  async signUp({ email, password, username, displayName }) {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: { data: { username: (username || '').toLowerCase(), display_name: displayName || '' }, emailRedirectTo: this.appUrl },
    });
    if (error) throw new Error(this._authMsg(error));
    return { needsConfirmation: !data.session };
  }

  async signIn({ email, password }) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(this._authMsg(error));
  }

  async signInWithOtp(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: this.appUrl } });
    if (error) throw new Error(this._authMsg(error));
  }

  async signInWithProvider(provider) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: this.appUrl } });
    if (error) throw new Error(this._authMsg(error));
  }

  async resetPassword(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: this.appUrl });
    if (error) throw new Error(this._authMsg(error));
  }

  async updatePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error(this._authMsg(error));
  }

  async signOut() { await this.sb.auth.signOut(); this.profile = null; this.uid = null; }

  async deleteAccount() {
    await this._q(this.sb.rpc('delete_my_account'));
    await this.sb.auth.signOut().catch(() => {});
    this.profile = null; this.uid = null;
  }

  _authMsg(error) {
    const m = error?.message || '';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
    if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja)';
    if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta. Inicia sesión';
    if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un momento';
    if (/provider is not enabled|Unsupported provider/i.test(m)) return 'Ese proveedor no está activado en Supabase (Authentication → Providers)';
    return m || 'Error de autenticación';
  }

  async _loadMyProfile() {
    let data = await this._q(this.sb.from('profiles').select('*').eq('id', this.uid).maybeSingle());
    if (!data) data = await this._q(this.sb.rpc('ensure_profile'));
    return this._profile(data);
  }

  async isUsernameAvailable(name) {
    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(name || '')) return false;
    const rows = await this._q(this.sb.from('profiles').select('id').ilike('username', escapeLike(name)).limit(1));
    return !rows.length || rows[0].id === this.uid;
  }

  async updateProfile(patch) {
    this._requireUser();
    const row = {};
    if (patch.avatarFile) row.avatar_url = await this.uploadMedia(patch.avatarFile, { folder: 'avatars' });
    if (patch.bannerFile) row.banner_url = await this.uploadMedia(patch.bannerFile, { folder: 'banners' });
    const map = { username: 'username', displayName: 'display_name', bio: 'bio', avatarUrl: 'avatar_url', avatarEmoji: 'avatar_emoji', bannerUrl: 'banner_url', links: 'links', interests: 'interests', dmPolicy: 'dm_policy', onboarded: 'onboarded' };
    for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) row[col] = k === 'username' ? String(patch[k]).toLowerCase() : patch[k];
    const data = await this._q(this.sb.from('profiles').update(row).eq('id', this.uid).select('*').single());
    this.profile = this._profile(data);
    bus.emit('profile:update', this.profile);
    return this.profile;
  }

  async completeOnboarding(data) { return this.updateProfile({ ...data, onboarded: true }); }

  async exportData() {
    const uid = this._requireUser();
    const [posts, comments, bookmarks, folders, projects, scores] = await Promise.all([
      this._q(this.sb.from('posts').select('*').eq('author_id', uid)),
      this._q(this.sb.from('comments').select('*').eq('author_id', uid)),
      this._q(this.sb.from('bookmarks').select('*')),
      this._q(this.sb.from('bookmark_folders').select('*')),
      this._q(this.sb.from('projects').select('*').eq('owner_id', uid)),
      this._q(this.sb.from('game_scores').select('*').eq('user_id', uid)),
    ]);
    return { exportedAt: new Date().toISOString(), mode: 'cloud', project: this.host, profile: this.profile, posts, comments, bookmarks, folders, projects, scores };
  }

  // ---------------- perfiles ----------------
  async _relation(id) {
    if (!this.uid || id === this.uid) return { isFollowing: false, followsYou: false };
    const rows = await this._q(this.sb.from('follows').select('follower_id,following_id').or(`and(follower_id.eq.${this.uid},following_id.eq.${id}),and(follower_id.eq.${id},following_id.eq.${this.uid})`));
    return { isFollowing: rows.some((r) => r.follower_id === this.uid), followsYou: rows.some((r) => r.follower_id === id) };
  }

  async getProfile(username) {
    const rows = await this._q(this.sb.from('profiles').select('*').ilike('username', escapeLike(username)).limit(1));
    if (!rows.length) throw new Error('Usuario no encontrado');
    const p = this._profile(rows[0]);
    return { ...p, ...(await this._relation(p.id)), isMe: p.id === this.uid };
  }

  async getProfileById(id) {
    const r = await this._q(this.sb.from('profiles').select('*').eq('id', id).maybeSingle());
    if (!r) return null;
    const p = this._profile(r);
    return { ...p, ...(await this._relation(id)), isMe: id === this.uid };
  }

  async searchProfiles(q = '', limit = 20) {
    let query = this.sb.from('profiles').select('*').order('followers_count', { ascending: false }).limit(limit);
    if (clean(q)) query = query.or(`username.ilike.${like(q)},display_name.ilike.${like(q)}`);
    return (await this._q(query)).map((r) => this._profile(r));
  }

  async _followingIds() {
    if (!this.uid) return [];
    return (await this._q(this.sb.from('follows').select('following_id').eq('follower_id', this.uid).limit(1000))).map((r) => r.following_id);
  }

  async suggestedProfiles(limit = 4) {
    const exclude = [...(await this._followingIds()), this.uid].filter(Boolean);
    let q = this.sb.from('profiles').select('*').order('followers_count', { ascending: false }).limit(limit);
    if (exclude.length) q = q.not('id', 'in', `(${exclude.join(',')})`);
    return (await this._q(q)).map((r) => this._profile(r));
  }

  async follow(userId) {
    const uid = this._requireUser();
    const { error } = await this.sb.from('follows').insert({ follower_id: uid, following_id: userId });
    if (error && error.code !== '23505') throw this._err(error);
  }

  async unfollow(userId) {
    const uid = this._requireUser();
    await this._q(this.sb.from('follows').delete().eq('follower_id', uid).eq('following_id', userId));
  }

  async listFollowers(userId) {
    const rows = await this._q(this.sb.from('follows').select(`p:profiles!follows_follower_fk(*)`).eq('following_id', userId).order('created_at', { ascending: false }).limit(200));
    return rows.map((r) => this._profile(r.p)).filter(Boolean);
  }

  async listFollowing(userId) {
    const rows = await this._q(this.sb.from('follows').select(`p:profiles!follows_following_fk(*)`).eq('follower_id', userId).order('created_at', { ascending: false }).limit(200));
    return rows.map((r) => this._profile(r.p)).filter(Boolean);
  }

  // ---------------- media ----------------
  async uploadMedia(file, { onProgress, folder = 'posts' } = {}) {
    const uid = this._requireUser();
    const token = await this._token();
    const extFromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
    const ext = extFromType[file.type] || (file.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const path = `${uid}/${folder}/${Date.now()}-${uuid().slice(0, 8)}.${ext}`;
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.url}/storage/v1/object/media/${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', this.key);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); resolve(); return; }
        let msg = `Error ${xhr.status} al subir el archivo`;
        try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch { /* texto */ }
        if (xhr.status === 413 || /exceeded|too large/i.test(msg)) msg = 'El archivo supera el tamaño máximo permitido (50 MB por defecto en Supabase)';
        if (/bucket not found/i.test(msg)) msg = 'Falta el bucket "media": ejecuta supabase/schema.sql';
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('Error de red al subir el archivo'));
      xhr.send(file);
    });
    return this.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  async _uploadParts(parts, onProgress) {
    const out = [];
    for (const part of parts) {
      const media = [];
      for (const m of part.media || []) {
        let url = m.url || '';
        let poster = typeof m.poster === 'string' ? m.poster : '';
        if (m.file) url = await this.uploadMedia(m.file, { folder: m.type === 'video' ? 'videos' : 'images', onProgress: (p) => onProgress?.(m, p) });
        if (m.poster instanceof Blob) poster = await this.uploadMedia(m.poster, { folder: 'posters' });
        media.push({ type: m.type, url, poster, alt: m.alt || '', filter: m.filter || 'none', width: m.width || 0, height: m.height || 0, duration: m.duration || 0 });
      }
      const poll = part.poll ? { options: part.poll.options, multiple: !!part.poll.multiple, closes_at: new Date(Date.now() + (part.poll.durationHours || 24) * 3600e3).toISOString() } : null;
      out.push({ body: (part.body || '').trim(), media, poll });
    }
    return out;
  }

  // ---------------- posts ----------------
  _applyFilters(q, { kind, period, tag, q: text, groupId, authorId } = {}) {
    const has = (type) => q.filter('media', 'cs', JSON.stringify([{ type }]));
    switch (kind) {
      case 'image': q = has('image'); break;
      case 'video': q = has('video'); break;
      case 'gif': q = has('gif'); break;
      case 'poll': q = q.not('poll', 'is', null); break;
      case 'thread': q = q.gt('thread_count', 1); break;
      case 'project': q = q.eq('kind', 'project'); break;
      case 'game': q = q.eq('kind', 'game'); break;
      case 'code': q = q.like('body', '%```%'); break;
      case 'text': q = q.eq('media', '[]').is('poll', null).eq('kind', 'post'); break;
      default: break;
    }
    if (period && period !== 'all') {
      const ms = { day: D, week: 7 * D, month: 30 * D }[period];
      if (ms) q = q.gte('created_at', new Date(Date.now() - ms).toISOString());
    }
    if (tag) q = q.contains('tags', [String(tag).toLowerCase()]);
    if (clean(text)) q = q.ilike('body', like(text));
    if (groupId) q = q.eq('group_id', groupId);
    if (authorId) q = q.eq('author_id', authorId);
    return q;
  }

  async feed({ tab = 'foryou', offset = 0, limit = 10, ...filters } = {}) {
    const build = (orderHot) => {
      let q = this.sb.from('posts').select(POST_SELECT).eq('thread_index', 0).neq('kind', 'short');
      q = this._applyFilters(q, filters);
      if (tab === 'recent' || tab === 'following' || !orderHot) q = q.order('created_at', { ascending: false });
      else if (tab === 'top') q = q.order('hype_count', { ascending: false }).order('created_at', { ascending: false });
      else q = q.order('post_hot_score', { ascending: false });
      return q.range(offset, offset + limit);
    };
    let q = build(true);
    if (tab === 'following') {
      const ids = [...(await this._followingIds()), this.uid].filter(Boolean);
      if (!ids.length) return { items: [], hasMore: false };
      q = q.in('author_id', ids);
    }
    let { data, error } = await q;
    if (error && /post_hot_score/.test(error.message || '')) ({ data, error } = await build(false));
    if (error) throw this._err(error);
    const items = await this._posts(data.slice(0, limit));
    return { items, hasMore: data.length > limit };
  }

  async shorts({ offset = 0, limit = 6, authorId = null } = {}) {
    let q = this.sb.from('posts').select(POST_SELECT).eq('kind', 'short');
    if (authorId) q = q.eq('author_id', authorId).order('created_at', { ascending: false });
    else q = q.order('post_hot_score', { ascending: false });
    let { data, error } = await q.range(offset, offset + limit);
    if (error && /post_hot_score/.test(error.message || '')) ({ data, error } = await this.sb.from('posts').select(POST_SELECT).eq('kind', 'short').order('created_at', { ascending: false }).range(offset, offset + limit));
    if (error) throw this._err(error);
    return { items: await this._posts(data.slice(0, limit)), hasMore: data.length > limit };
  }

  async getPost(id) {
    const row = await this._q(this.sb.from('posts').select(POST_SELECT).eq('id', id).maybeSingle());
    if (!row) throw new Error('Este post no existe o no tienes acceso');
    return (await this._posts([row]))[0];
  }

  async getThread(rootId) {
    const rows = await this._q(this.sb.from('posts').select(POST_SELECT).eq('thread_root_id', rootId).order('thread_index'));
    return this._posts(rows);
  }

  async createPost({ parts, kind = 'post', visibility = 'public', groupId = null, sensitive = false, projectId = null, game = null }, { onProgress } = {}) {
    this._requireUser();
    const uploaded = await this._uploadParts(parts || [], onProgress);
    const prepared = uploaded.filter((p, i) => p.body || p.media.length || p.poll || (i === 0 && (game || projectId)));
    if (!prepared.length) throw new Error('El post está vacío');
    const rootId = await this._q(this.sb.rpc('create_post', {
      p_parts: prepared, p_kind: kind, p_visibility: visibility, p_group_id: groupId, p_sensitive: sensitive, p_project_id: projectId, p_game: game,
    }));
    const post = await this.getPost(rootId);
    return post;
  }

  async updatePost(id, { body }) {
    await this._q(this.sb.from('posts').update({ body: String(body || '').trim() }).eq('id', id));
    const post = await this.getPost(id);
    bus.emit('post:update', post);
    return post;
  }

  async deletePost(id) {
    await this._q(this.sb.from('posts').delete().eq('id', id));
    bus.emit('post:delete', { id });
  }

  async _hypeCount(id) {
    const r = await this._q(this.sb.from('posts').select('hype_count').eq('id', id).maybeSingle());
    return r?.hype_count || 0;
  }

  async hypePost(id) {
    const uid = this._requireUser();
    const { error } = await this.sb.from('hypes').insert({ user_id: uid, post_id: id });
    if (error && error.code !== '23505') throw this._err(error);
    return { hypeCount: await this._hypeCount(id), hyped: true };
  }

  async unhypePost(id) {
    const uid = this._requireUser();
    await this._q(this.sb.from('hypes').delete().eq('user_id', uid).eq('post_id', id));
    return { hypeCount: await this._hypeCount(id), hyped: false };
  }

  async votePoll(id, optionIndexes) {
    this._requireUser();
    const res = await this._q(this.sb.rpc('vote_poll', { p_post_id: id, p_options: optionIndexes }));
    const post = await this.getPost(id);
    return { ...post.poll, counts: res.counts, voters: res.voters, myVotes: res.my_votes };
  }

  async listComments(postId) {
    const rows = await this._q(this.sb.from('comments').select(`*,author:profiles!comments_author_fk(${PROFILE_COLS})`).eq('post_id', postId).order('created_at').limit(300));
    return rows.map((r) => this._comment(r));
  }

  async addComment(postId, body) {
    const uid = this._requireUser();
    const row = await this._q(this.sb.from('comments').insert({ post_id: postId, author_id: uid, body: String(body).trim().slice(0, 2000) }).select(`*,author:profiles!comments_author_fk(${PROFILE_COLS})`).single());
    return this._comment(row);
  }

  async deleteComment(id) { await this._q(this.sb.from('comments').delete().eq('id', id)); }

  async hypedPosts(userId, { offset = 0, limit = 10 } = {}) {
    const rows = await this._q(this.sb.from('hypes').select(`created_at,post:posts(${POST_SELECT})`).eq('user_id', userId).order('created_at', { ascending: false }).range(offset, offset + limit));
    const posts = rows.slice(0, limit).map((r) => r.post).filter(Boolean);
    return { items: await this._posts(posts), hasMore: rows.length > limit };
  }

  async trendingTags(limit = 8) {
    const rows = await this._q(this.sb.rpc('trending_tags', { p_limit: limit, p_days: 7 }));
    return rows.map((r) => ({ tag: r.tag, count: Number(r.uses) }));
  }

  // ---------------- marcadores ----------------
  async listFolders() {
    this._requireUser();
    const [folders, marks] = await Promise.all([
      this._q(this.sb.from('bookmark_folders').select('*').order('created_at')),
      this._q(this.sb.from('bookmarks').select('folder_id').limit(5000)),
    ]);
    const counts = new Map();
    marks.forEach((m) => counts.set(m.folder_id || 'none', (counts.get(m.folder_id || 'none') || 0) + 1));
    return {
      total: marks.length, unfiled: counts.get('none') || 0,
      folders: folders.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji, createdAt: f.created_at, count: counts.get(f.id) || 0 })),
    };
  }

  async createFolder({ name, emoji = '📁' }) {
    const uid = this._requireUser();
    const n = String(name || '').trim().slice(0, 40);
    if (!n) throw new Error('Ponle un nombre a la carpeta');
    const { data, error } = await this.sb.from('bookmark_folders').insert({ user_id: uid, name: n, emoji }).select('*').single();
    if (error?.code === '23505') throw new Error('Ya tienes una carpeta con ese nombre');
    if (error) throw this._err(error);
    return { id: data.id, name: data.name, emoji: data.emoji, createdAt: data.created_at, count: 0 };
  }

  async updateFolder(id, patch) {
    const row = {};
    if (patch.name !== undefined) row.name = String(patch.name).trim().slice(0, 40);
    if (patch.emoji) row.emoji = patch.emoji;
    const data = await this._q(this.sb.from('bookmark_folders').update(row).eq('id', id).select('*').single());
    return { id: data.id, name: data.name, emoji: data.emoji };
  }

  async deleteFolder(id) { await this._q(this.sb.from('bookmark_folders').delete().eq('id', id)); }

  async listBookmarks({ folderId = 'all', offset = 0, limit = 20 } = {}) {
    this._requireUser();
    let q = this.sb.from('bookmarks').select(`created_at,folder_id,post:posts(${POST_SELECT})`).order('created_at', { ascending: false }).range(offset, offset + limit);
    if (folderId === 'none') q = q.is('folder_id', null);
    else if (folderId !== 'all') q = q.eq('folder_id', folderId);
    const rows = await this._q(q);
    const posts = rows.slice(0, limit).map((r) => r.post).filter(Boolean);
    return { items: await this._posts(posts), hasMore: rows.length > limit };
  }

  async saveBookmark(postId, folderId = null) {
    const uid = this._requireUser();
    await this._q(this.sb.from('bookmarks').upsert({ user_id: uid, post_id: postId, folder_id: folderId }, { onConflict: 'user_id,post_id' }));
    return { bookmarked: true, folderId };
  }

  async removeBookmark(postId) {
    const uid = this._requireUser();
    await this._q(this.sb.from('bookmarks').delete().eq('user_id', uid).eq('post_id', postId));
    return { bookmarked: false, folderId: null };
  }

  // ---------------- grupos ----------------
  async _myMemberships(ids) {
    if (!this.uid) return new Map();
    let q = this.sb.from('group_members').select('group_id,role,status').eq('user_id', this.uid);
    if (ids) q = q.in('group_id', ids);
    return new Map((await this._q(q)).map((m) => [m.group_id, m]));
  }

  async listGroups({ q = '', mine = false, offset = 0, limit = 30 } = {}) {
    let query = this.sb.from('groups').select(GROUP_SELECT).order('member_count', { ascending: false }).range(offset, offset + limit);
    if (mine) {
      const memberships = await this._myMemberships();
      if (!memberships.size) return { items: [], hasMore: false };
      query = query.in('id', [...memberships.keys()]);
    }
    if (clean(q)) query = query.or(`name.ilike.${like(q)},description.ilike.${like(q)}`);
    const rows = await this._q(query);
    const mineMap = await this._myMemberships(rows.map((r) => r.id));
    return { items: rows.slice(0, limit).map((r) => this._group(r, mineMap.get(r.id))), hasMore: rows.length > limit };
  }

  async getGroup(slug) {
    const isId = /^[0-9a-f-]{36}$/i.test(slug);
    const row = await this._q(this.sb.from('groups').select(GROUP_SELECT).eq(isId ? 'id' : 'slug', slug).maybeSingle());
    if (!row) throw new Error('Grupo no encontrado');
    const mine = await this._myMemberships([row.id]);
    return this._group(row, mine.get(row.id));
  }

  async createGroup({ name, description = '', emoji = '👥', color = ['#8b5cf6', '#ec4899'], isPrivate = false, tags = [] }) {
    const uid = this._requireUser();
    const n = String(name || '').trim();
    if (n.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres');
    let base = slugify(n) || 'grupo';
    if (base.length < 3) base = `${base}-grupo`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 40)}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const { data, error } = await this.sb.from('groups').insert({ slug, name: n.slice(0, 60), description: description.slice(0, 500), emoji, color, is_private: isPrivate, tags, owner_id: uid }).select(GROUP_SELECT).single();
      if (!error) return this._group(data, { role: 'owner', status: 'active' });
      if (error.code !== '23505') throw this._err(error);
    }
    throw new Error('No se pudo crear el grupo, prueba otro nombre');
  }

  async updateGroup(id, patch) {
    const row = {};
    const map = { name: 'name', description: 'description', emoji: 'emoji', color: 'color', isPrivate: 'is_private', tags: 'tags', coverUrl: 'cover_url' };
    for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) row[col] = patch[k];
    await this._q(this.sb.from('groups').update(row).eq('id', id));
    return this.getGroup(id);
  }

  async deleteGroup(id) { await this._q(this.sb.from('groups').delete().eq('id', id)); }

  async joinGroup(id) {
    const uid = this._requireUser();
    const g = await this._q(this.sb.from('groups').select('is_private').eq('id', id).single());
    const { error } = await this.sb.from('group_members').insert({ group_id: id, user_id: uid, role: 'member', status: g.is_private ? 'pending' : 'active' });
    if (error && error.code !== '23505') throw this._err(error);
    return this.getGroup(id);
  }

  async leaveGroup(id) {
    const uid = this._requireUser();
    const mine = await this._myMemberships([id]);
    if (mine.get(id)?.role === 'owner') throw new Error('Eres el creador: borra el grupo o transfiere la propiedad');
    await this._q(this.sb.from('group_members').delete().eq('group_id', id).eq('user_id', uid));
    return this.getGroup(id);
  }

  async groupMembers(id, { status = 'active' } = {}) {
    const rows = await this._q(this.sb.from('group_members').select(`role,status,created_at,user:profiles!group_members_user_fk(${PROFILE_COLS})`).eq('group_id', id).eq('status', status).order('created_at').limit(300));
    return rows.map((r) => ({ user: this._profileLite(r.user), role: r.role, status: r.status, createdAt: r.created_at }));
  }

  async approveMember(groupId, userId) { await this._q(this.sb.from('group_members').update({ status: 'active' }).eq('group_id', groupId).eq('user_id', userId)); }
  async removeMember(groupId, userId) { await this._q(this.sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)); }

  // ---------------- proyectos ----------------
  async _projectsHyped(ids) {
    if (!this.uid || !ids.length) return new Set();
    return new Set((await this._q(this.sb.from('project_hypes').select('project_id').eq('user_id', this.uid).in('project_id', ids))).map((r) => r.project_id));
  }

  async listProjects({ sort = 'hot', tag = '', q = '', ownerId = null, offset = 0, limit = 20 } = {}) {
    const build = (hot) => {
      let query = this.sb.from('projects').select(PROJECT_SELECT);
      if (ownerId) query = query.eq('owner_id', ownerId);
      if (tag) query = query.contains('tags', [tag]);
      if (clean(q)) query = query.or(`name.ilike.${like(q)},tagline.ilike.${like(q)}`);
      if (sort === 'new' || !hot) query = query.order('created_at', { ascending: false });
      else if (sort === 'top') query = query.order('hype_count', { ascending: false });
      else query = query.order('project_hot_score', { ascending: false });
      return query.range(offset, offset + limit);
    };
    let { data, error } = await build(true);
    if (error && /project_hot_score/.test(error.message || '')) ({ data, error } = await build(false));
    if (error) throw this._err(error);
    const hyped = await this._projectsHyped(data.map((r) => r.id));
    return { items: data.slice(0, limit).map((r) => this._project(r, hyped.has(r.id))), hasMore: data.length > limit };
  }

  async getProject(id) {
    const row = await this._q(this.sb.from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle());
    if (!row) throw new Error('Proyecto no encontrado');
    const hyped = await this._projectsHyped([id]);
    return this._project(row, hyped.has(id));
  }

  _projectRow(data) {
    const map = { name: 'name', tagline: 'tagline', description: 'description', coverUrl: 'cover_url', emoji: 'emoji', color: 'color', demoUrl: 'demo_url', repoUrl: 'repo_url', tags: 'tags', stage: 'stage' };
    const row = {};
    for (const [k, col] of Object.entries(map)) if (data[k] !== undefined) row[col] = data[k] === '' && (k === 'demoUrl' || k === 'repoUrl' || k === 'coverUrl') ? null : data[k];
    return row;
  }

  async createProject(data) {
    const uid = this._requireUser();
    if (data.coverFile) data.coverUrl = await this.uploadMedia(data.coverFile, { folder: 'projects' });
    const row = await this._q(this.sb.from('projects').insert({ ...this._projectRow(data), owner_id: uid }).select(PROJECT_SELECT).single());
    return this._project(row);
  }

  async updateProject(id, data) {
    if (data.coverFile) data.coverUrl = await this.uploadMedia(data.coverFile, { folder: 'projects' });
    await this._q(this.sb.from('projects').update(this._projectRow(data)).eq('id', id));
    return this.getProject(id);
  }

  async deleteProject(id) { await this._q(this.sb.from('projects').delete().eq('id', id)); }

  async _projectHypeCount(id) {
    const r = await this._q(this.sb.from('projects').select('hype_count').eq('id', id).maybeSingle());
    return r?.hype_count || 0;
  }

  async hypeProject(id) {
    const uid = this._requireUser();
    const { error } = await this.sb.from('project_hypes').insert({ user_id: uid, project_id: id });
    if (error && error.code !== '23505') throw this._err(error);
    return { hypeCount: await this._projectHypeCount(id), hyped: true };
  }

  async unhypeProject(id) {
    const uid = this._requireUser();
    await this._q(this.sb.from('project_hypes').delete().eq('user_id', uid).eq('project_id', id));
    return { hypeCount: await this._projectHypeCount(id), hyped: false };
  }

  async listProjectComments(id) {
    const rows = await this._q(this.sb.from('comments').select(`*,author:profiles!comments_author_fk(${PROFILE_COLS})`).eq('project_id', id).order('created_at').limit(300));
    return rows.map((r) => this._comment(r));
  }

  async addProjectComment(id, body) {
    const uid = this._requireUser();
    const row = await this._q(this.sb.from('comments').insert({ project_id: id, author_id: uid, body: String(body).trim().slice(0, 2000) }).select(`*,author:profiles!comments_author_fk(${PROFILE_COLS})`).single());
    return this._comment(row);
  }

  // ---------------- juegos ----------------
  async submitScore(gameId, score) {
    const uid = this._requireUser();
    const prev = await this._q(this.sb.from('game_scores').select('score').eq('user_id', uid).eq('game_id', gameId).order('score', { ascending: false }).limit(1));
    await this._q(this.sb.from('game_scores').insert({ user_id: uid, game_id: gameId, score: Math.round(score) }));
    const best = prev[0]?.score || 0;
    return { best: Math.max(best, score), isRecord: score > best };
  }

  async leaderboard(gameId, limit = 10) {
    const rows = await this._q(this.sb.rpc('game_leaderboard', { p_game_id: gameId, p_limit: limit }));
    return rows.map((r) => ({ user: this._profileLite({ id: r.user_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url, avatar_emoji: r.avatar_emoji }), score: r.best, achievedAt: r.achieved_at }));
  }

  async userBestScores(userId) {
    const rows = await this._q(this.sb.from('game_scores').select('game_id,score').eq('user_id', userId).order('score', { ascending: false }).limit(500));
    const out = {};
    rows.forEach((r) => { out[r.game_id] = Math.max(out[r.game_id] || 0, r.score); });
    return out;
  }

  async myBestScores() { return this.uid ? this.userBestScores(this.uid) : {}; }

  // ---------------- notificaciones ----------------
  _notifSelect() {
    return `*,actor:profiles!notifications_actor_fk(${PROFILE_COLS}),post:posts(id,kind,body),project:projects(id,name),group:groups(id,slug,name)`;
  }

  async listNotifications({ offset = 0, limit = 30, type = 'all' } = {}) {
    const uid = this._requireUser();
    let q = this.sb.from('notifications').select(this._notifSelect()).eq('user_id', uid).order('created_at', { ascending: false }).range(offset, offset + limit);
    if (type === 'mentions') q = q.in('type', ['mention', 'comment', 'project_comment']);
    if (type === 'hype') q = q.in('type', ['hype', 'project_hype']);
    const rows = await this._q(q);
    const prefs = state.settings.notify || {};
    const kindOf = (t) => (t.startsWith('project') ? 'project' : t.startsWith('group') ? 'group' : t);
    const items = rows.slice(0, limit).map((r) => this._notification(r)).filter((n) => prefs[kindOf(n.type)] !== false);
    return { items, hasMore: rows.length > limit };
  }

  async unreadCounts() {
    if (!this.uid) return { notifications: 0, messages: 0 };
    const [n, convs] = await Promise.all([
      this.sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', this.uid).is('read_at', null),
      this.sb.rpc('my_conversations'),
    ]);
    return { notifications: n.count || 0, messages: (convs.data || []).filter((c) => c.unread).length };
  }

  async markNotificationsRead() {
    const uid = this._requireUser();
    await this._q(this.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null));
    this._emitUnread();
  }

  // ---------------- mensajes ----------------
  _conversation(r) {
    return {
      id: r.id, lastMessage: r.last_message || '', lastMessageAt: r.last_message_at, unread: !!r.unread,
      other: this._profileLite({ id: r.other_id, username: r.other_username, display_name: r.other_display_name, avatar_url: r.other_avatar_url, avatar_emoji: r.other_avatar_emoji }),
    };
  }

  async listConversations() {
    this._requireUser();
    return (await this._q(this.sb.rpc('my_conversations'))).map((r) => this._conversation(r));
  }

  async openConversation(userId) {
    this._requireUser();
    return this._q(this.sb.rpc('get_or_create_dm', { p_other: userId }));
  }

  async getConversation(id) {
    const c = (await this.listConversations()).find((x) => x.id === id);
    if (!c) throw new Error('Conversación no encontrada');
    return c;
  }

  async listMessages(conversationId) {
    const rows = await this._q(this.sb.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(200));
    return rows.reverse().map((r) => this._message(r));
  }

  async sendMessage(conversationId, body) {
    const uid = this._requireUser();
    const text = String(body || '').trim().slice(0, 4000);
    if (!text) throw new Error('Mensaje vacío');
    const row = await this._q(this.sb.from('messages').insert({ conversation_id: conversationId, sender_id: uid, body: text }).select('*').single());
    return this._message(row);
  }

  async markConversationRead(conversationId) {
    if (!this.uid) return;
    await this.sb.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', this.uid);
    this._emitUnread();
  }

  // compatibilidad con la API local
  hasLocalAccount() { return false; }
  async resetAll() { throw new Error('No disponible en modo nube'); }
}

