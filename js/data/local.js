// Backend LOCAL (modo demo): todo vive en el navegador. Implementa la misma API
// que el backend de Supabase para que la interfaz no note la diferencia.
import { bus, state, postKinds } from '../core/store.js';
import { uuid, extractTags, extractMentions, normalize, pick, shuffle, excerpt, slugify, sleep } from '../core/utils.js';
import { putBlob, clearBlobs } from './media-store.js';
import { BOTS, POSTS, GROUPS, PROJECTS, SHORT_VIDEOS } from './seed.js';

const DB_KEY = 'hype:db:v1';
const H = 3600e3, D = 24 * H;
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

const GAME_SEEDS = {
  reflex: { 'u-kai': 1180, 'u-sofia': 905, 'u-leo': 840, 'u-ana': 760, 'u-diego': 690 },
  dodge: { 'u-kai': 2840, 'u-diego': 1960, 'u-sofia': 1530, 'u-valen': 1210, 'u-leo': 980 },
  memory: { 'u-ana': 1840, 'u-kai': 1720, 'u-valen': 1590, 'u-maria': 1310 },
  typing: { 'u-sofia': 94, 'u-ana': 81, 'u-kai': 77, 'u-diego': 62 },
  colors: { 'u-valen': 48, 'u-kai': 44, 'u-leo': 37, 'u-maria': 29 },
};

const FOLLOWER_BASE = { 'u-hype': 10234, 'u-sofia': 3410, 'u-leo': 1820, 'u-maria': 5120, 'u-kai': 2290, 'u-valen': 2730, 'u-diego': 4105, 'u-ana': 3960 };

const AMBIENT = [
  { author: 'u-sofia', body: 'Pregunta rápida: ¿tabs o espacios? 👀 (no respondan "depende") #dev' },
  { author: 'u-leo', body: 'Subiendo un beat nuevo esta noche 🎧 ¿Qué mood quieren: 🌧️ lluvia o ☕ cafetería?' },
  { author: 'u-maria', body: 'Truco: congela el jengibre y rállalo directo. Dura meses y rinde más 🫚 #recetas' },
  { author: 'u-kai', body: 'Estoy probando un modo **difícil** para Esquiva Orbital. ¿Quién se apunta al playtest? 🛸 #juegos' },
  { author: 'u-valen', body: 'Recordatorio amable: el espacio en blanco **también** es diseño ✨ #diseño' },
  { author: 'u-ana', body: 'Paper interesante hoy: modelos pequeños bien afinados superan a gigantes en tareas concretas. Menos es más 🤏 #ia' },
  { author: 'u-diego', body: 'Día 12 construyendo en público: hoy 41 usuarios nuevos y 2 bugs feos. Seguimos 💪 #buildinpublic' },
  { author: 'u-hype', body: '¿Sabías que puedes **encadenar posts** en un hilo? En el editor toca “Añadir al hilo” ✨' },
];

const BOT_COMMENTS = {
  code: ['¡Qué buen tip! Guardado 🔖', 'Esto me habría ahorrado una tarde entera 😅', '¿Funciona también en Safari?', 'Clean code ✨'],
  food: ['¡Se ve delicioso! 😋', 'Lo pruebo este finde', 'Guardado en mi carpeta de Recetas 🍳', '¿Se puede hacer vegano?'],
  game: ['Acepto el reto 🎮', 'GG 🔥', 'Esa puntuación es ilegal 😂', 'Voy a por ese récord'],
  design: ['Esa paleta 😍', 'Me encanta la composición', 'La tipografía está 10/10'],
  generic: ['¡Esto merece más hype! 🔥', 'Totalmente de acuerdo 👏', 'Gran post', 'Interesante, cuéntanos más', '💯', '¡Qué bueno!', 'Me encanta esto ✨'],
};

const BOT_REPLIES = [
  '¡Hola! 👋 Qué bueno leerte por aquí.',
  'Jaja totalmente 😄',
  '¡Me encanta la idea! Cuéntame más.',
  'Dale, lo hablamos con calma 🙌',
  '¿Ya probaste los mini-juegos? Te reto en Esquiva Orbital 🛸',
  'Gracias por escribir 💜',
];

function nowIso(offset = 0) { return new Date(Date.now() - offset).toISOString(); }

function seedDb() {
  const users = {};
  for (const b of BOTS) {
    users[b.id] = {
      id: b.id, username: b.username, displayName: b.displayName, bio: b.bio, avatarUrl: '', avatarEmoji: b.avatarEmoji,
      bannerUrl: '', links: b.links || [], interests: b.interests || [], dmPolicy: 'everyone', verified: !!b.verified, isBot: true,
      createdAt: nowIso(120 * D + Math.random() * 200 * D), followersBase: FOLLOWER_BASE[b.id] || 100,
    };
  }
  const groups = GROUPS.map((g, i) => ({
    id: g.id, slug: g.slug, name: g.name, description: g.description, emoji: g.emoji, color: g.color, coverUrl: '',
    isPrivate: !!g.isPrivate, tags: g.tags, ownerId: g.ownerId, createdAt: nowIso((60 - i * 7) * D), memberBase: 40 + ((i * 137) % 900),
  }));
  const groupMembers = [];
  GROUPS.forEach((g) => g.members.forEach((uid) => groupMembers.push({ groupId: g.id, userId: uid, role: uid === g.ownerId ? 'owner' : 'member', status: 'active', createdAt: nowIso(30 * D) })));

  const projects = PROJECTS.map((p) => ({
    id: p.id, ownerId: p.ownerId, name: p.name, tagline: p.tagline, description: p.description, coverUrl: '', emoji: p.emoji, color: p.color,
    demoUrl: p.demoUrl, repoUrl: p.repoUrl, tags: p.tags, stage: p.stage, hypeCount: p.hype, commentCount: 0, createdAt: nowIso(p.age), updatedAt: nowIso(p.age),
  }));

  const posts = [];
  const comments = [];
  for (const sp of POSTS) {
    const created = nowIso(sp.ago);
    const parts = sp.thread || [sp.body];
    const rootId = sp.id;
    parts.forEach((body, idx) => {
      const id = idx === 0 ? rootId : `${rootId}-${idx}`;
      const post = {
        id, kind: idx === 0 ? (sp.kind || 'post') : 'post', authorId: sp.author, body,
        media: idx === 0 ? (sp.media || []) : [], poll: null,
        groupId: sp.group || null, projectId: idx === 0 ? (sp.project || null) : null, game: idx === 0 ? (sp.game || null) : null,
        threadRootId: parts.length > 1 ? rootId : null, threadIndex: idx, threadCount: idx === 0 ? parts.length : 1,
        visibility: 'public', sensitive: false, tags: extractTags(body),
        hypeCount: idx === 0 ? sp.hype : Math.round(sp.hype / (idx + 2)), commentCount: 0, createdAt: created, editedAt: null,
      };
      if (idx === 0 && sp.poll) {
        post.poll = {
          options: sp.poll.options, multiple: false,
          closesAt: new Date(Date.now() + sp.poll.hoursLeft * H).toISOString(),
          counts: sp.poll.counts.slice(), voters: sp.poll.counts.reduce((a, b) => a + b, 0),
        };
      }
      posts.push(post);
    });
    (sp.comments || []).forEach(([author, body], k) => {
      comments.push({ id: uuid(), postId: rootId, projectId: null, authorId: author, body, createdAt: nowIso(sp.ago - (k + 1) * 6 * 60e3) });
    });
  }
  SHORT_VIDEOS.forEach((s, i) => {
    posts.push({
      id: `short-${i}`, kind: 'short', authorId: s.author, body: s.body,
      media: [{ type: 'video', url: s.url, poster: s.poster, alt: '', filter: 'none', width: 360, height: 640 }],
      poll: null, groupId: null, projectId: null, game: null, threadRootId: null, threadIndex: 0, threadCount: 1,
      visibility: 'public', sensitive: false, tags: extractTags(s.body), hypeCount: 40 + ((i * 97) % 600), commentCount: 0,
      createdAt: nowIso((i + 1) * 3.3 * H), editedAt: null,
    });
  });
  for (const c of comments) { const p = posts.find((x) => x.id === c.postId); if (p) p.commentCount++; }
  projects.forEach((p) => {
    const extra = { 'p-pixel': [['u-sofia', '¡Lo estoy usando para mi juego! 👾'], ['u-valen', 'La UI está muy cuidada']], 'p-taskflow': [['u-ana', '¿Qué modelo usas para priorizar?']] }[p.id] || [];
    extra.forEach(([a, b], k) => { comments.push({ id: uuid(), postId: null, projectId: p.id, authorId: a, body: b, createdAt: nowIso(H * (k + 1)) }); p.commentCount++; });
  });

  const follows = [];
  for (const a of BOTS) for (const b of BOTS) if (a.id !== b.id && (a.id.length + b.id.length) % 3 !== 0) follows.push({ followerId: a.id, followingId: b.id, createdAt: nowIso(40 * D) });

  const scores = [];
  for (const [gameId, entries] of Object.entries(GAME_SEEDS)) {
    for (const [userId, score] of Object.entries(entries)) scores.push({ userId, gameId, score, createdAt: nowIso(Math.random() * 5 * D) });
  }

  return {
    version: 1, createdAt: nowIso(), me: null, localAccountId: null,
    users, posts, comments, follows, groups, groupMembers, projects, scores,
    myHypes: [], myVotes: {}, myProjectHypes: [],
    folders: [], bookmarks: [], notifications: [], conversations: [], messages: [],
    ambientIndex: 0,
  };
}

export class LocalBackend {
  mode = 'local';

  constructor() {
    this.db = null;
    this._saveTimer = null;
    this._timers = new Set();
    this.botReplyHook = null; // (bot, history) => Promise<string> (lo conecta Hype IA)
  }

  // ---------------- infraestructura ----------------
  async init() {
    try { this.db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch { this.db = null; }
    if (!this.db || this.db.version !== 1) { this.db = seedDb(); this._persist(true); }
    this._startAmbient();
    return this.currentUser;
  }

  _persist(now = false) {
    clearTimeout(this._saveTimer);
    const write = () => {
      try { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); }
      catch (err) { console.warn('No se pudo guardar en localStorage', err); bus.emit('storage:full'); }
    };
    if (now) write(); else this._saveTimer = setTimeout(write, 250);
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
  }

  on(event, cb) { return bus.on(event, cb); }

  get me() { return this.db?.me ? this.db.users[this.db.me] : null; }
  get currentUser() { return this.me ? this._profile(this.me) : null; }
  _requireMe() { if (!this.me) throw new Error('Necesitas una cuenta para hacer esto'); return this.me; }

  // ---------------- normalización ----------------
  _followerCount(uid) { return (this.db.users[uid]?.followersBase || 0) + this.db.follows.filter((f) => f.followingId === uid).length; }

  _profile(u, { full = false } = {}) {
    if (!u) return null;
    const p = {
      id: u.id, username: u.username, displayName: u.displayName || u.username, bio: u.bio || '', avatarUrl: u.avatarUrl || '',
      avatarEmoji: u.avatarEmoji || '', bannerUrl: u.bannerUrl || '', links: u.links || [], interests: u.interests || [],
      dmPolicy: u.dmPolicy || 'everyone', verified: !!u.verified, isBot: !!u.isBot, createdAt: u.createdAt,
    };
    if (full) {
      const meId = this.db.me;
      p.followers = this._followerCount(u.id);
      p.following = this.db.follows.filter((f) => f.followerId === u.id).length;
      p.postsCount = this.db.posts.filter((x) => x.authorId === u.id && x.threadIndex === 0).length;
      p.hypeReceived = this.db.posts.filter((x) => x.authorId === u.id).reduce((a, x) => a + x.hypeCount, 0);
      p.isFollowing = !!meId && this.db.follows.some((f) => f.followerId === meId && f.followingId === u.id);
      p.followsYou = !!meId && this.db.follows.some((f) => f.followerId === u.id && f.followingId === meId);
      p.isMe = u.id === meId;
    }
    return p;
  }

  _groupSummary(g) { return g ? { id: g.id, slug: g.slug, name: g.name, emoji: g.emoji, color: g.color, isPrivate: g.isPrivate } : null; }

  _projectSummary(p) {
    return p ? { id: p.id, name: p.name, tagline: p.tagline, emoji: p.emoji, color: p.color, coverUrl: p.coverUrl, hypeCount: p.hypeCount, stage: p.stage } : null;
  }

  _post(p) {
    if (!p) return null;
    const meId = this.db.me;
    const bm = meId ? this.db.bookmarks.find((b) => b.postId === p.id) : null;
    const out = {
      ...structuredClone(p),
      author: this._profile(this.db.users[p.authorId]) || { id: p.authorId, username: 'eliminado', displayName: 'Usuario eliminado' },
      group: p.groupId ? this._groupSummary(this.db.groups.find((g) => g.id === p.groupId)) : null,
      project: p.projectId ? this._projectSummary(this.db.projects.find((x) => x.id === p.projectId)) : null,
      hyped: this.db.myHypes.includes(p.id),
      bookmarked: !!bm,
      folderId: bm?.folderId || null,
    };
    if (out.poll) {
      out.poll.myVotes = this.db.myVotes[p.id] || [];
      out.poll.closed = new Date(out.poll.closesAt).getTime() < Date.now();
    }
    return out;
  }

  _isMember(groupId, uid = this.db.me) {
    return !!uid && this.db.groupMembers.some((m) => m.groupId === groupId && m.userId === uid && m.status === 'active');
  }

  _canView(p) {
    if (p.groupId) {
      const g = this.db.groups.find((x) => x.id === p.groupId);
      if (g?.isPrivate && !this._isMember(g.id)) return false;
    }
    if (p.visibility === 'followers' && p.authorId !== this.db.me) {
      return this.db.follows.some((f) => f.followerId === this.db.me && f.followingId === p.authorId);
    }
    return true;
  }

  _notify(n) {
    const prefs = state.settings.notify || {};
    const kind = n.type.startsWith('project') ? 'project' : n.type.startsWith('group') ? 'group' : n.type;
    if (prefs[kind] === false) return;
    const item = { id: uuid(), readAt: null, createdAt: nowIso(), postId: null, projectId: null, groupId: null, body: '', ...n };
    this.db.notifications.unshift(item);
    this.db.notifications = this.db.notifications.slice(0, 200);
    this._persist();
    bus.emit('notification', this._notification(item));
    this._emitUnread();
  }

  _notification(n) {
    const post = n.postId ? this.db.posts.find((p) => p.id === n.postId) : null;
    const project = n.projectId ? this.db.projects.find((p) => p.id === n.projectId) : null;
    const group = n.groupId ? this.db.groups.find((g) => g.id === n.groupId) : null;
    return {
      ...n,
      actor: n.actorId ? this._profile(this.db.users[n.actorId]) : null,
      post: post ? { id: post.id, kind: post.kind, excerpt: excerpt(post.body, 120) } : null,
      project: project ? { id: project.id, name: project.name } : null,
      group: group ? { id: group.id, slug: group.slug, name: group.name } : null,
    };
  }

  async _emitUnread() {
    const c = await this.unreadCounts();
    bus.emit('unread:update', c);
  }

  // ---------------- cuenta ----------------
  hasLocalAccount() { return !!this.db?.localAccountId && !!this.db.users[this.db.localAccountId]; }
  localAccount() { return this.hasLocalAccount() ? this._profile(this.db.users[this.db.localAccountId]) : null; }

  async resumeLocalAccount() {
    if (!this.hasLocalAccount()) throw new Error('No hay cuenta local');
    this.db.me = this.db.localAccountId;
    this._persist();
    return this.currentUser;
  }

  async isUsernameAvailable(name, exceptId = null) {
    if (!USERNAME_RE.test(name || '')) return false;
    const n = name.toLowerCase();
    return !Object.values(this.db.users).some((u) => u.username.toLowerCase() === n && u.id !== exceptId);
  }

  async createLocalAccount({ username, displayName, avatarEmoji = '😎', bio = '', interests = [] }) {
    if (!USERNAME_RE.test(username || '')) throw new Error('El usuario debe tener 3-24 caracteres: letras, números, _ o .');
    if (!(await this.isUsernameAvailable(username))) throw new Error('Ese nombre de usuario ya existe');
    const id = 'me-' + uuid().slice(0, 8);
    this.db.users[id] = {
      id, username, displayName: displayName || username, bio, avatarUrl: '', avatarEmoji, bannerUrl: '', links: [], interests,
      dmPolicy: 'everyone', verified: false, isBot: false, createdAt: nowIso(), followersBase: 0,
    };
    this.db.me = id;
    this.db.localAccountId = id;
    // Carpetas de ejemplo con algún post guardado
    const recetas = { id: uuid(), name: 'Recetas', emoji: '🍳', createdAt: nowIso() };
    const trabajo = { id: uuid(), name: 'Trabajo', emoji: '💼', createdAt: nowIso() };
    this.db.folders.push(recetas, trabajo);
    if (this.db.posts.some((p) => p.id === 'post-ramen')) this.db.bookmarks.push({ postId: 'post-ramen', folderId: recetas.id, createdAt: nowIso() });
    if (this.db.posts.some((p) => p.id === 'post-css')) this.db.bookmarks.push({ postId: 'post-css', folderId: trabajo.id, createdAt: nowIso() });
    // Unirse a grupos afines
    for (const g of this.db.groups) {
      if (!g.isPrivate && g.tags.some((t) => interests.includes(t))) this.db.groupMembers.push({ groupId: g.id, userId: id, role: 'member', status: 'active', createdAt: nowIso() });
    }
    // Bienvenida
    const conv = { id: uuid(), members: [id, 'u-hype'], lastMessage: '', lastMessageAt: nowIso(), lastRead: { [id]: nowIso(1000) } };
    this.db.conversations.push(conv);
    this._pushMessage(conv, 'u-hype', `¡Hola @${username}! 👋 Bienvenido a Hype. Prueba a publicar tu primer post con **Markdown**, encadénalo en un hilo o reta a la comunidad en los juegos. Si necesitas ideas, Hype IA ✨ está en el menú.`);
    this._persist(true);
    this._later(() => this._notify({ type: 'system', actorId: 'u-hype', body: '¡Bienvenido a Hype! Completa tu perfil y publica tu primer post 🚀' }), 600);
    this._later(() => { if (this.db.me === id) { this.db.follows.push({ followerId: 'u-sofia', followingId: id, createdAt: nowIso() }); this._notify({ type: 'follow', actorId: 'u-sofia' }); } }, 9000);
    return this.currentUser;
  }

  async signOut() { this.db.me = null; this._persist(true); }

  async updateProfile(patch) {
    const me = this._requireMe();
    if (patch.username && patch.username !== me.username) {
      if (!(await this.isUsernameAvailable(patch.username, me.id))) throw new Error('Ese nombre de usuario no está disponible');
    }
    if (patch.avatarFile) { patch.avatarUrl = await this.uploadMedia(patch.avatarFile); }
    if (patch.bannerFile) { patch.bannerUrl = await this.uploadMedia(patch.bannerFile); }
    const allowed = ['username', 'displayName', 'bio', 'avatarUrl', 'avatarEmoji', 'bannerUrl', 'links', 'interests', 'dmPolicy'];
    for (const k of allowed) if (patch[k] !== undefined) me[k] = patch[k];
    this._persist();
    const p = this.currentUser;
    bus.emit('profile:update', p);
    return p;
  }

  async deleteAccount() { await this.resetAll(); }

  async resetAll() {
    this._timers.forEach(clearTimeout);
    this._timers.clear();
    localStorage.removeItem(DB_KEY);
    await clearBlobs().catch(() => {});
    this.db = seedDb();
    this._persist(true);
  }

  async exportData() {
    const meId = this.db.me;
    return {
      exportedAt: nowIso(), mode: 'local',
      profile: this.currentUser,
      posts: this.db.posts.filter((p) => p.authorId === meId),
      comments: this.db.comments.filter((c) => c.authorId === meId),
      bookmarks: this.db.bookmarks, folders: this.db.folders,
      projects: this.db.projects.filter((p) => p.ownerId === meId),
      groups: this.db.groups.filter((g) => this._isMember(g.id)).map((g) => g.name),
      scores: this.db.scores.filter((s) => s.userId === meId),
      messages: this.db.messages.filter((m) => this.db.conversations.find((c) => c.id === m.conversationId)?.members.includes(meId)),
    };
  }

  // ---------------- perfiles ----------------
  _userByName(username) {
    const n = String(username || '').toLowerCase();
    return Object.values(this.db.users).find((u) => u.username.toLowerCase() === n);
  }

  async getProfile(username) {
    const u = this._userByName(username);
    if (!u) throw new Error('Usuario no encontrado');
    return this._profile(u, { full: true });
  }

  async getProfileById(id) { return this._profile(this.db.users[id], { full: true }); }

  async searchProfiles(q = '', limit = 20) {
    const n = normalize(q);
    return Object.values(this.db.users)
      .filter((u) => !n || normalize(u.username).includes(n) || normalize(u.displayName).includes(n) || normalize(u.bio).includes(n))
      .slice(0, limit).map((u) => this._profile(u, { full: true }));
  }

  async suggestedProfiles(limit = 4) {
    const meId = this.db.me;
    const following = new Set(this.db.follows.filter((f) => f.followerId === meId).map((f) => f.followingId));
    return Object.values(this.db.users).filter((u) => u.id !== meId && !following.has(u.id)).sort((a, b) => this._followerCount(b.id) - this._followerCount(a.id)).slice(0, limit).map((u) => this._profile(u, { full: true }));
  }

  async follow(userId) {
    const me = this._requireMe();
    if (userId === me.id) return;
    if (!this.db.follows.some((f) => f.followerId === me.id && f.followingId === userId)) {
      this.db.follows.push({ followerId: me.id, followingId: userId, createdAt: nowIso() });
      this._persist();
      const u = this.db.users[userId];
      if (u?.isBot && state.settings.simulateActivity && Math.random() < 0.6) {
        this._later(() => {
          if (!this.db.follows.some((f) => f.followerId === userId && f.followingId === me.id)) {
            this.db.follows.push({ followerId: userId, followingId: me.id, createdAt: nowIso() });
            this._notify({ type: 'follow', actorId: userId });
          }
        }, 4000 + Math.random() * 6000);
      }
    }
  }

  async unfollow(userId) {
    const meId = this._requireMe().id;
    this.db.follows = this.db.follows.filter((f) => !(f.followerId === meId && f.followingId === userId));
    this._persist();
  }

  async listFollowers(userId) { return this.db.follows.filter((f) => f.followingId === userId).map((f) => this._profile(this.db.users[f.followerId], { full: true })).filter(Boolean); }
  async listFollowing(userId) { return this.db.follows.filter((f) => f.followerId === userId).map((f) => this._profile(this.db.users[f.followingId], { full: true })).filter(Boolean); }

  // ---------------- posts ----------------
  _hot(p) {
    const ageH = (Date.now() - new Date(p.createdAt).getTime()) / H;
    return (p.hypeCount * 2 + p.commentCount * 3 + 1) / Math.pow(ageH + 2, 1.35);
  }

  _filterPosts(list, { kind, period, tag, q, groupId, authorId } = {}) {
    let out = list;
    if (groupId) out = out.filter((p) => p.groupId === groupId);
    if (authorId) out = out.filter((p) => p.authorId === authorId);
    if (kind && kind !== 'all') out = out.filter((p) => postKinds(p).includes(kind));
    if (period && period !== 'all') {
      const ms = { day: D, week: 7 * D, month: 30 * D }[period] || 0;
      if (ms) out = out.filter((p) => Date.now() - new Date(p.createdAt).getTime() <= ms);
    }
    if (tag) out = out.filter((p) => p.tags.includes(String(tag).toLowerCase()));
    if (q) {
      const n = normalize(q);
      out = out.filter((p) => normalize(p.body).includes(n) || normalize(this.db.users[p.authorId]?.displayName).includes(n) || normalize(this.db.users[p.authorId]?.username).includes(n));
    }
    return out;
  }

  async feed({ tab = 'foryou', offset = 0, limit = 10, ...filters } = {}) {
    const meId = this.db.me;
    let list = this.db.posts.filter((p) => p.threadIndex === 0 && p.kind !== 'short' && this._canView(p));
    list = this._filterPosts(list, filters);
    if (tab === 'following') {
      const following = new Set(this.db.follows.filter((f) => f.followerId === meId).map((f) => f.followingId));
      list = list.filter((p) => following.has(p.authorId) || p.authorId === meId);
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (tab === 'recent') {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (tab === 'top') {
      list.sort((a, b) => b.hypeCount - a.hypeCount);
    } else {
      const interests = new Set(this.me?.interests || []);
      const following = new Set(this.db.follows.filter((f) => f.followerId === meId).map((f) => f.followingId));
      const score = (p) => {
        let s = this._hot(p);
        if (p.tags.some((t) => interests.has(t))) s *= 1.5;
        if (following.has(p.authorId)) s *= 1.3;
        if (p.authorId === meId && Date.now() - new Date(p.createdAt).getTime() < 10 * 60e3) s *= 100; // tu post recién publicado arriba
        return s;
      };
      list.sort((a, b) => score(b) - score(a));
    }
    const page = list.slice(offset, offset + limit);
    await sleep(120);
    return { items: page.map((p) => this._post(p)), hasMore: offset + limit < list.length };
  }

  async shorts({ offset = 0, limit = 6, authorId = null, recycle = true } = {}) {
    let list = this.db.posts.filter((p) => p.kind === 'short' && (!authorId || p.authorId === authorId));
    list.sort((a, b) => this._hot(b) - this._hot(a));
    if (!list.length) return { items: [], hasMore: false };
    if (authorId || !recycle) return { items: list.slice(offset, offset + limit).map((p) => this._post(p)), hasMore: offset + limit < list.length };
    // Scroll infinito: al agotar, se reciclan en orden aleatorio.
    const items = [];
    for (let i = offset; i < offset + limit; i++) {
      const cycle = Math.floor(i / list.length);
      const order = cycle === 0 ? list : shuffle(list);
      items.push(this._post(order[i % list.length]));
    }
    await sleep(80);
    return { items, hasMore: true };
  }

  async getPost(id) {
    const p = this.db.posts.find((x) => x.id === id);
    if (!p || !this._canView(p)) throw new Error('Este post no existe o no tienes acceso');
    return this._post(p);
  }

  async getThread(rootId) {
    return this.db.posts.filter((p) => p.threadRootId === rootId).sort((a, b) => a.threadIndex - b.threadIndex).map((p) => this._post(p));
  }

  async uploadMedia(file, { onProgress } = {}) {
    const key = 'm-' + uuid();
    onProgress?.(0.3);
    await putBlob(key, file);
    onProgress?.(1);
    return 'idb:' + key;
  }

  async _storeMedia(items = [], onProgress) {
    const out = [];
    for (const m of items) {
      let url = m.url || '';
      let poster = typeof m.poster === 'string' ? m.poster : '';
      if (m.file) url = await this.uploadMedia(m.file, { onProgress: (p) => onProgress?.(m, p) });
      if (m.poster instanceof Blob) poster = await this.uploadMedia(m.poster);
      out.push({ type: m.type, url, poster, alt: m.alt || '', filter: m.filter || 'none', width: m.width || 0, height: m.height || 0, duration: m.duration || 0 });
    }
    return out;
  }

  async createPost({ parts, kind = 'post', visibility = 'public', groupId = null, sensitive = false, projectId = null, game = null }, { onProgress } = {}) {
    const me = this._requireMe();
    if (!parts?.length) throw new Error('El post está vacío');
    if (groupId && !this._isMember(groupId)) throw new Error('Únete al grupo para publicar en él');
    const rootId = uuid();
    const created = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const media = await this._storeMedia(part.media, onProgress);
      if (!part.body?.trim() && !media.length && !part.poll && !(created.length === 0 && (game || projectId))) continue;
      const first = created.length === 0;
      const post = {
        id: first ? rootId : uuid(), kind: first ? kind : 'post', authorId: me.id, body: (part.body || '').trim(), media,
        poll: part.poll ? {
          options: part.poll.options, multiple: !!part.poll.multiple,
          closesAt: new Date(Date.now() + (part.poll.durationHours || 24) * H).toISOString(),
          counts: part.poll.options.map(() => 0), voters: 0,
        } : null,
        groupId, projectId: first ? projectId : null, game: first ? game : null,
        threadRootId: parts.length > 1 ? rootId : null, threadIndex: created.length, threadCount: 1,
        visibility, sensitive, tags: extractTags(part.body), hypeCount: 0, commentCount: 0, createdAt: new Date(Date.now() + i).toISOString(), editedAt: null,
      };
      created.push(post);
    }
    if (!created.length) throw new Error('El post está vacío');
    created[0].threadCount = created.length;
    if (created.length === 1) created[0].threadRootId = null;
    this.db.posts.push(...created);
    this._persist(true);
    const root = this._post(created[0]);
    // Menciones
    for (const name of extractMentions(created.map((p) => p.body).join('\n'))) {
      const u = this._userByName(name);
      if (u && u.id !== me.id && u.isBot) this._later(() => this._botReact(created[0], u.id, true), 5000);
    }
    bus.emit('post:new', root);
    this._scheduleReactions(created[0]);
    return root;
  }

  async updatePost(id, { body }) {
    const p = this.db.posts.find((x) => x.id === id);
    if (!p || p.authorId !== this.db.me) throw new Error('No puedes editar este post');
    p.body = String(body || '').trim();
    p.tags = extractTags(p.body);
    p.editedAt = nowIso();
    this._persist();
    const out = this._post(p);
    bus.emit('post:update', out);
    return out;
  }

  async deletePost(id) {
    const p = this.db.posts.find((x) => x.id === id);
    if (!p || p.authorId !== this.db.me) throw new Error('No puedes borrar este post');
    const ids = new Set([id, ...this.db.posts.filter((x) => x.threadRootId === id).map((x) => x.id)]);
    this.db.posts = this.db.posts.filter((x) => !ids.has(x.id));
    this.db.comments = this.db.comments.filter((c) => !ids.has(c.postId));
    this.db.bookmarks = this.db.bookmarks.filter((b) => !ids.has(b.postId));
    this.db.myHypes = this.db.myHypes.filter((h) => !ids.has(h));
    this._persist();
    bus.emit('post:delete', { id });
  }

  async hypePost(id) {
    this._requireMe();
    const p = this.db.posts.find((x) => x.id === id);
    if (!p) throw new Error('Post no encontrado');
    if (!this.db.myHypes.includes(id)) { this.db.myHypes.push(id); p.hypeCount++; this._persist(); }
    return { hypeCount: p.hypeCount, hyped: true };
  }

  async unhypePost(id) {
    this._requireMe();
    const p = this.db.posts.find((x) => x.id === id);
    if (!p) throw new Error('Post no encontrado');
    if (this.db.myHypes.includes(id)) { this.db.myHypes = this.db.myHypes.filter((x) => x !== id); p.hypeCount = Math.max(0, p.hypeCount - 1); this._persist(); }
    return { hypeCount: p.hypeCount, hyped: false };
  }

  async votePoll(id, optionIndexes) {
    this._requireMe();
    const p = this.db.posts.find((x) => x.id === id);
    if (!p?.poll) throw new Error('Encuesta no encontrada');
    if (new Date(p.poll.closesAt).getTime() < Date.now()) throw new Error('La encuesta ya cerró');
    if (this.db.myVotes[id]?.length) throw new Error('Ya votaste en esta encuesta');
    const opts = [...new Set(optionIndexes)].filter((i) => i >= 0 && i < p.poll.options.length);
    if (!opts.length) throw new Error('Elige una opción');
    if (!p.poll.multiple && opts.length > 1) throw new Error('Solo puedes elegir una opción');
    opts.forEach((i) => { p.poll.counts[i]++; });
    p.poll.voters++;
    this.db.myVotes[id] = opts;
    this._persist();
    const out = this._post(p);
    // Votos simulados en vivo para que se vea la encuesta "dinámica"
    if (state.settings.simulateActivity) {
      for (let k = 1; k <= 3; k++) {
        this._later(() => {
          if (new Date(p.poll.closesAt).getTime() < Date.now()) return;
          const i = Math.floor(Math.random() * p.poll.options.length);
          p.poll.counts[i]++; p.poll.voters++;
          this._persist();
          bus.emit('post:update', this._post(p));
        }, 1500 * k + Math.random() * 2000);
      }
    }
    return out.poll;
  }

  _comment(c) { return { ...c, author: this._profile(this.db.users[c.authorId]) }; }

  async listComments(postId) {
    return this.db.comments.filter((c) => c.postId === postId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => this._comment(c));
  }

  async addComment(postId, body) {
    const me = this._requireMe();
    const p = this.db.posts.find((x) => x.id === postId);
    if (!p) throw new Error('Post no encontrado');
    const text = String(body || '').trim();
    if (!text) throw new Error('Escribe algo');
    const c = { id: uuid(), postId, projectId: null, authorId: me.id, body: text.slice(0, 2000), createdAt: nowIso() };
    this.db.comments.push(c);
    p.commentCount++;
    this._persist();
    bus.emit('post:update', this._post(p));
    const author = this.db.users[p.authorId];
    if (author?.isBot && state.settings.simulateActivity && Math.random() < 0.7) {
      this._later(() => this._botComment(p, author.id, `@${me.username} ${pick(['¡Gracias! 🙌', 'Jaja exacto 😄', '¡Buen punto!', 'Me alegra que te sirva 💜', 'Totalmente 🔥'])}`), 3000 + Math.random() * 5000);
    }
    return this._comment(c);
  }

  async deleteComment(id) {
    const c = this.db.comments.find((x) => x.id === id);
    if (!c) return;
    const meId = this.db.me;
    const p = c.postId ? this.db.posts.find((x) => x.id === c.postId) : null;
    if (c.authorId !== meId && p?.authorId !== meId) throw new Error('No puedes borrar este comentario');
    this.db.comments = this.db.comments.filter((x) => x.id !== id);
    if (p) { p.commentCount = Math.max(0, p.commentCount - 1); bus.emit('post:update', this._post(p)); }
    const pr = c.projectId ? this.db.projects.find((x) => x.id === c.projectId) : null;
    if (pr) pr.commentCount = Math.max(0, pr.commentCount - 1);
    this._persist();
  }

  async hypedPosts(userId, { offset = 0, limit = 10 } = {}) {
    if (userId !== this.db.me) return { items: [], hasMore: false };
    const list = this.db.myHypes.slice().reverse().map((id) => this.db.posts.find((p) => p.id === id)).filter((p) => p && this._canView(p));
    return { items: list.slice(offset, offset + limit).map((p) => this._post(p)), hasMore: offset + limit < list.length };
  }

  async trendingTags(limit = 8) {
    const counts = new Map();
    for (const p of this.db.posts) {
      if (!this._canView(p)) continue;
      const w = 1 + p.hypeCount / 50;
      for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + w);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag, score]) => ({ tag, count: Math.round(score * 7) }));
  }

  // ---------------- actividad simulada ----------------
  _botFor(p) {
    const others = BOTS.map((b) => b.id).filter((id) => id !== p.authorId);
    return pick(others);
  }

  _commentFor(p) {
    const b = normalize(p.body);
    if (/```|css|js|code|deploy|python|sql/.test(b)) return pick(BOT_COMMENTS.code);
    if (/receta|cocina|ramen|comida|desayuno/.test(b)) return pick(BOT_COMMENTS.food);
    if (p.kind === 'game' || /juego|record|reto|score/.test(b)) return pick(BOT_COMMENTS.game);
    if (/diseno|color|paleta|ui|tipograf/.test(b) || p.media?.length) return pick(BOT_COMMENTS.design.concat(BOT_COMMENTS.generic));
    return pick(BOT_COMMENTS.generic);
  }

  _botHype(p, botId) {
    if (!this.db.posts.includes(p)) return;
    p.hypeCount++;
    this._persist();
    bus.emit('post:update', this._post(p));
    if (p.authorId === this.db.me) this._notify({ type: 'hype', actorId: botId, postId: p.id });
  }

  _botComment(p, botId, text) {
    if (!this.db.posts.includes(p)) return;
    const c = { id: uuid(), postId: p.id, projectId: null, authorId: botId, body: text || this._commentFor(p), createdAt: nowIso() };
    this.db.comments.push(c);
    p.commentCount++;
    this._persist();
    bus.emit('post:update', this._post(p));
    bus.emit('comment:new', this._comment(c));
    if (p.authorId === this.db.me) this._notify({ type: 'comment', actorId: botId, postId: p.id, body: excerpt(c.body, 100) });
  }

  _botReact(p, botId, mention = false) {
    if (mention) {
      this._notify({ type: 'mention', actorId: botId, postId: p.id, body: '¡Gracias por mencionarme! 👀' });
      this._botComment(p, botId, pick(['¡Gracias por la mención! 🙌', '¡Aquí estoy! 👋', 'Me apunto 🔥']));
    } else this._botHype(p, botId);
  }

  _scheduleReactions(p) {
    if (!state.settings.simulateActivity) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) this._later(() => this._botHype(p, this._botFor(p)), 2500 + k * (2500 + Math.random() * 4000));
    if (Math.random() < 0.75) this._later(() => this._botComment(p, this._botFor(p)), 7000 + Math.random() * 6000);
  }

  _startAmbient() {
    const tick = () => {
      this._later(() => {
        if (state.settings.simulateActivity && this.db.me && document.visibilityState === 'visible') {
          const next = AMBIENT[this.db.ambientIndex % AMBIENT.length];
          if (this.db.ambientIndex < AMBIENT.length * 3) {
            this.db.ambientIndex++;
            const post = {
              id: uuid(), kind: 'post', authorId: next.author, body: next.body, media: [], poll: null, groupId: null, projectId: null, game: null,
              threadRootId: null, threadIndex: 0, threadCount: 1, visibility: 'public', sensitive: false, tags: extractTags(next.body),
              hypeCount: Math.floor(Math.random() * 12), commentCount: 0, createdAt: nowIso(), editedAt: null,
            };
            this.db.posts.push(post);
            this._persist();
            bus.emit('post:new', this._post(post));
          }
        }
        tick();
      }, 70000 + Math.random() * 60000);
    };
    tick();
  }

  // ---------------- marcadores ----------------
  async listFolders() {
    this._requireMe();
    const count = (fid) => this.db.bookmarks.filter((b) => b.folderId === fid && this.db.posts.some((p) => p.id === b.postId)).length;
    const valid = this.db.bookmarks.filter((b) => this.db.posts.some((p) => p.id === b.postId));
    return {
      total: valid.length,
      unfiled: valid.filter((b) => !b.folderId).length,
      folders: this.db.folders.map((f) => ({ ...f, count: count(f.id) })),
    };
  }

  async createFolder({ name, emoji = '📁' }) {
    this._requireMe();
    const n = String(name || '').trim().slice(0, 40);
    if (!n) throw new Error('Ponle un nombre a la carpeta');
    if (this.db.folders.some((f) => f.name.toLowerCase() === n.toLowerCase())) throw new Error('Ya tienes una carpeta con ese nombre');
    const f = { id: uuid(), name: n, emoji, createdAt: nowIso() };
    this.db.folders.push(f);
    this._persist();
    return { ...f, count: 0 };
  }

  async updateFolder(id, patch) {
    const f = this.db.folders.find((x) => x.id === id);
    if (!f) throw new Error('Carpeta no encontrada');
    if (patch.name !== undefined) f.name = String(patch.name).trim().slice(0, 40) || f.name;
    if (patch.emoji) f.emoji = patch.emoji;
    this._persist();
    return f;
  }

  async deleteFolder(id) {
    this.db.folders = this.db.folders.filter((f) => f.id !== id);
    this.db.bookmarks.forEach((b) => { if (b.folderId === id) b.folderId = null; });
    this._persist();
  }

  async listBookmarks({ folderId = 'all', offset = 0, limit = 20 } = {}) {
    this._requireMe();
    let list = this.db.bookmarks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (folderId === 'none') list = list.filter((b) => !b.folderId);
    else if (folderId !== 'all') list = list.filter((b) => b.folderId === folderId);
    const posts = list.map((b) => this.db.posts.find((p) => p.id === b.postId)).filter((p) => p && this._canView(p));
    return { items: posts.slice(offset, offset + limit).map((p) => this._post(p)), hasMore: offset + limit < posts.length };
  }

  async saveBookmark(postId, folderId = null) {
    this._requireMe();
    const existing = this.db.bookmarks.find((b) => b.postId === postId);
    if (existing) existing.folderId = folderId;
    else this.db.bookmarks.push({ postId, folderId, createdAt: nowIso() });
    this._persist();
    return { bookmarked: true, folderId };
  }

  async removeBookmark(postId) {
    this.db.bookmarks = this.db.bookmarks.filter((b) => b.postId !== postId);
    this._persist();
    return { bookmarked: false, folderId: null };
  }

  // ---------------- grupos ----------------
  _group(g) {
    const meId = this.db.me;
    const mine = meId ? this.db.groupMembers.find((m) => m.groupId === g.id && m.userId === meId) : null;
    const active = this.db.groupMembers.filter((m) => m.groupId === g.id && m.status === 'active').length;
    return {
      ...structuredClone(g), memberCount: (g.memberBase || 0) + active,
      postCount: this.db.posts.filter((p) => p.groupId === g.id && p.threadIndex === 0).length,
      myRole: mine?.role || null, myStatus: mine?.status || null,
      owner: this._profile(this.db.users[g.ownerId]),
    };
  }

  async listGroups({ q = '', mine = false, offset = 0, limit = 30 } = {}) {
    let list = this.db.groups.slice();
    if (mine) list = list.filter((g) => this.db.groupMembers.some((m) => m.groupId === g.id && m.userId === this.db.me));
    if (q) { const n = normalize(q); list = list.filter((g) => normalize(g.name + ' ' + g.description + ' ' + g.tags.join(' ')).includes(n)); }
    list = list.map((g) => this._group(g)).sort((a, b) => b.memberCount - a.memberCount);
    return { items: list.slice(offset, offset + limit), hasMore: offset + limit < list.length };
  }

  async getGroup(slug) {
    const g = this.db.groups.find((x) => x.slug === slug || x.id === slug);
    if (!g) throw new Error('Grupo no encontrado');
    return this._group(g);
  }

  async createGroup({ name, description = '', emoji = '👥', color = ['#8b5cf6', '#ec4899'], isPrivate = false, tags = [] }) {
    const me = this._requireMe();
    const n = String(name || '').trim();
    if (n.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres');
    let slug = slugify(n) || 'grupo';
    if (slug.length < 3) slug = (slug + '-grupo').slice(0, 40);
    while (this.db.groups.some((g) => g.slug === slug)) slug = `${slug.slice(0, 34)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const g = { id: uuid(), slug, name: n.slice(0, 60), description: description.slice(0, 500), emoji, color, coverUrl: '', isPrivate, tags, ownerId: me.id, createdAt: nowIso(), memberBase: 0 };
    this.db.groups.push(g);
    this.db.groupMembers.push({ groupId: g.id, userId: me.id, role: 'owner', status: 'active', createdAt: nowIso() });
    this._persist();
    return this._group(g);
  }

  async updateGroup(id, patch) {
    const g = this.db.groups.find((x) => x.id === id);
    const mine = this.db.groupMembers.find((m) => m.groupId === id && m.userId === this.db.me);
    if (!g || !['owner', 'admin'].includes(mine?.role)) throw new Error('Solo los admins pueden editar el grupo');
    for (const k of ['name', 'description', 'emoji', 'color', 'isPrivate', 'tags']) if (patch[k] !== undefined) g[k] = patch[k];
    this._persist();
    return this._group(g);
  }

  async deleteGroup(id) {
    const g = this.db.groups.find((x) => x.id === id);
    if (!g || g.ownerId !== this.db.me) throw new Error('Solo el creador puede borrar el grupo');
    this.db.groups = this.db.groups.filter((x) => x.id !== id);
    this.db.groupMembers = this.db.groupMembers.filter((m) => m.groupId !== id);
    this.db.posts = this.db.posts.filter((p) => p.groupId !== id);
    this._persist();
  }

  async joinGroup(id) {
    const me = this._requireMe();
    const g = this.db.groups.find((x) => x.id === id);
    if (!g) throw new Error('Grupo no encontrado');
    if (this.db.groupMembers.some((m) => m.groupId === id && m.userId === me.id)) return this._group(g);
    const status = g.isPrivate ? 'pending' : 'active';
    this.db.groupMembers.push({ groupId: id, userId: me.id, role: 'member', status, createdAt: nowIso() });
    this._persist();
    if (status === 'pending' && this.db.users[g.ownerId]?.isBot && state.settings.simulateActivity) {
      this._later(() => {
        const m = this.db.groupMembers.find((x) => x.groupId === id && x.userId === me.id);
        if (m && m.status === 'pending') { m.status = 'active'; this._persist(); this._notify({ type: 'group_joined', actorId: g.ownerId, groupId: id }); }
      }, 6000);
    }
    return this._group(g);
  }

  async leaveGroup(id) {
    const meId = this._requireMe().id;
    const g = this.db.groups.find((x) => x.id === id);
    if (g?.ownerId === meId) throw new Error('Eres el creador: borra el grupo o transfiere la propiedad');
    this.db.groupMembers = this.db.groupMembers.filter((m) => !(m.groupId === id && m.userId === meId));
    this._persist();
    return g ? this._group(g) : null;
  }

  async groupMembers(id, { status = 'active' } = {}) {
    return this.db.groupMembers.filter((m) => m.groupId === id && m.status === status)
      .map((m) => ({ user: this._profile(this.db.users[m.userId]), role: m.role, status: m.status, createdAt: m.createdAt }))
      .filter((m) => m.user);
  }

  async approveMember(groupId, userId) {
    const m = this.db.groupMembers.find((x) => x.groupId === groupId && x.userId === userId);
    if (m) { m.status = 'active'; this._persist(); }
  }

  async removeMember(groupId, userId) {
    this.db.groupMembers = this.db.groupMembers.filter((x) => !(x.groupId === groupId && x.userId === userId));
    this._persist();
  }

  // ---------------- proyectos ----------------
  _project(p) {
    return { ...structuredClone(p), owner: this._profile(this.db.users[p.ownerId]), hyped: this.db.myProjectHypes.includes(p.id) };
  }

  async listProjects({ sort = 'hot', tag = '', q = '', ownerId = null, offset = 0, limit = 20 } = {}) {
    let list = this.db.projects.slice();
    if (ownerId) list = list.filter((p) => p.ownerId === ownerId);
    if (tag) list = list.filter((p) => p.tags.includes(tag));
    if (q) { const n = normalize(q); list = list.filter((p) => normalize(`${p.name} ${p.tagline} ${p.tags.join(' ')}`).includes(n)); }
    if (sort === 'new') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === 'top') list.sort((a, b) => b.hypeCount - a.hypeCount);
    else list.sort((a, b) => this._hot(b) - this._hot(a));
    return { items: list.slice(offset, offset + limit).map((p) => this._project(p)), hasMore: offset + limit < list.length };
  }

  async getProject(id) {
    const p = this.db.projects.find((x) => x.id === id);
    if (!p) throw new Error('Proyecto no encontrado');
    return this._project(p);
  }

  async createProject(data) {
    const me = this._requireMe();
    const name = String(data.name || '').trim();
    if (name.length < 2) throw new Error('Ponle nombre al proyecto');
    const p = {
      id: uuid(), ownerId: me.id, name: name.slice(0, 80), tagline: String(data.tagline || '').slice(0, 140), description: String(data.description || '').slice(0, 10000),
      coverUrl: data.coverFile ? await this.uploadMedia(data.coverFile) : (data.coverUrl || ''), emoji: data.emoji || '🚀', color: data.color || ['#8b5cf6', '#ec4899'],
      demoUrl: data.demoUrl || '', repoUrl: data.repoUrl || '', tags: data.tags || [], stage: data.stage || 'building',
      hypeCount: 0, commentCount: 0, createdAt: nowIso(), updatedAt: nowIso(),
    };
    this.db.projects.push(p);
    this._persist();
    if (state.settings.simulateActivity) {
      for (let k = 0; k < 3; k++) this._later(() => { p.hypeCount++; this._persist(); this._notify({ type: 'project_hype', actorId: pick(BOTS).id, projectId: p.id }); }, 4000 + k * 5000);
    }
    return this._project(p);
  }

  async updateProject(id, data) {
    const p = this.db.projects.find((x) => x.id === id);
    if (!p || p.ownerId !== this.db.me) throw new Error('No puedes editar este proyecto');
    if (data.coverFile) data.coverUrl = await this.uploadMedia(data.coverFile);
    for (const k of ['name', 'tagline', 'description', 'coverUrl', 'emoji', 'color', 'demoUrl', 'repoUrl', 'tags', 'stage']) if (data[k] !== undefined) p[k] = data[k];
    p.updatedAt = nowIso();
    this._persist();
    return this._project(p);
  }

  async deleteProject(id) {
    const p = this.db.projects.find((x) => x.id === id);
    if (!p || p.ownerId !== this.db.me) throw new Error('No puedes borrar este proyecto');
    this.db.projects = this.db.projects.filter((x) => x.id !== id);
    this.db.posts.forEach((x) => { if (x.projectId === id) x.projectId = null; });
    this._persist();
  }

  async hypeProject(id) {
    this._requireMe();
    const p = this.db.projects.find((x) => x.id === id);
    if (!p) throw new Error('Proyecto no encontrado');
    if (!this.db.myProjectHypes.includes(id)) { this.db.myProjectHypes.push(id); p.hypeCount++; this._persist(); }
    return { hypeCount: p.hypeCount, hyped: true };
  }

  async unhypeProject(id) {
    const p = this.db.projects.find((x) => x.id === id);
    if (!p) throw new Error('Proyecto no encontrado');
    if (this.db.myProjectHypes.includes(id)) { this.db.myProjectHypes = this.db.myProjectHypes.filter((x) => x !== id); p.hypeCount = Math.max(0, p.hypeCount - 1); this._persist(); }
    return { hypeCount: p.hypeCount, hyped: false };
  }

  async listProjectComments(id) {
    return this.db.comments.filter((c) => c.projectId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => this._comment(c));
  }

  async addProjectComment(id, body) {
    const me = this._requireMe();
    const p = this.db.projects.find((x) => x.id === id);
    if (!p) throw new Error('Proyecto no encontrado');
    const text = String(body || '').trim();
    if (!text) throw new Error('Escribe algo');
    const c = { id: uuid(), postId: null, projectId: id, authorId: me.id, body: text.slice(0, 2000), createdAt: nowIso() };
    this.db.comments.push(c);
    p.commentCount++;
    this._persist();
    return this._comment(c);
  }

  // ---------------- juegos ----------------
  async submitScore(gameId, score) {
    const me = this._requireMe();
    const prev = Math.max(0, ...this.db.scores.filter((s) => s.userId === me.id && s.gameId === gameId).map((s) => s.score));
    this.db.scores.push({ userId: me.id, gameId, score: Math.round(score), createdAt: nowIso() });
    this._persist();
    return { best: Math.max(prev, score), isRecord: score > prev };
  }

  async leaderboard(gameId, limit = 10) {
    const best = new Map();
    for (const s of this.db.scores) {
      if (s.gameId !== gameId) continue;
      const cur = best.get(s.userId);
      if (!cur || s.score > cur.score) best.set(s.userId, s);
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
      .map((s) => ({ user: this._profile(this.db.users[s.userId]), score: s.score, achievedAt: s.createdAt })).filter((x) => x.user);
  }

  async userBestScores(userId) {
    const out = {};
    for (const s of this.db.scores) if (s.userId === userId) out[s.gameId] = Math.max(out[s.gameId] || 0, s.score);
    return out;
  }

  async myBestScores() { return this.db.me ? this.userBestScores(this.db.me) : {}; }

  // ---------------- notificaciones ----------------
  async listNotifications({ offset = 0, limit = 30, type = 'all' } = {}) {
    let list = this.db.notifications;
    if (type === 'mentions') list = list.filter((n) => n.type === 'mention' || n.type === 'comment');
    if (type === 'hype') list = list.filter((n) => n.type === 'hype' || n.type === 'project_hype');
    return { items: list.slice(offset, offset + limit).map((n) => this._notification(n)), hasMore: offset + limit < list.length };
  }

  async unreadCounts() {
    const meId = this.db.me;
    if (!meId) return { notifications: 0, messages: 0 };
    const notifications = this.db.notifications.filter((n) => !n.readAt).length;
    const messages = this.db.conversations.filter((c) => c.members.includes(meId) && this._convUnread(c)).length;
    return { notifications, messages };
  }

  async markNotificationsRead() {
    const t = nowIso();
    this.db.notifications.forEach((n) => { n.readAt ||= t; });
    this._persist();
    this._emitUnread();
  }

  // ---------------- mensajes ----------------
  _convUnread(c) {
    const meId = this.db.me;
    const last = this.db.messages.filter((m) => m.conversationId === c.id).at(-1);
    return !!last && last.senderId !== meId && (!c.lastRead?.[meId] || last.createdAt > c.lastRead[meId]);
  }

  _conversation(c) {
    const meId = this.db.me;
    const otherId = c.members.find((m) => m !== meId) || meId;
    return { id: c.id, other: this._profile(this.db.users[otherId]), lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt, unread: this._convUnread(c) };
  }

  async listConversations() {
    const meId = this._requireMe().id;
    return this.db.conversations.filter((c) => c.members.includes(meId)).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map((c) => this._conversation(c));
  }

  async openConversation(userId) {
    const meId = this._requireMe().id;
    if (userId === meId) throw new Error('No puedes escribirte a ti mismo');
    const other = this.db.users[userId];
    if (!other) throw new Error('Usuario no encontrado');
    if (other.dmPolicy === 'nobody') throw new Error('Este usuario no acepta mensajes');
    let c = this.db.conversations.find((x) => x.members.includes(meId) && x.members.includes(userId));
    if (!c) {
      c = { id: uuid(), members: [meId, userId], lastMessage: '', lastMessageAt: nowIso(), lastRead: {} };
      this.db.conversations.push(c);
      this._persist();
    }
    return c.id;
  }

  async getConversation(id) {
    const c = this.db.conversations.find((x) => x.id === id && x.members.includes(this.db.me));
    if (!c) throw new Error('Conversación no encontrada');
    return this._conversation(c);
  }

  async listMessages(conversationId) {
    return this.db.messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  _pushMessage(c, senderId, body) {
    const m = { id: uuid(), conversationId: c.id, senderId, body, createdAt: nowIso() };
    this.db.messages.push(m);
    c.lastMessage = excerpt(body, 120);
    c.lastMessageAt = m.createdAt;
    if (senderId === this.db.me) c.lastRead = { ...(c.lastRead || {}), [senderId]: m.createdAt };
    this._persist();
    bus.emit('message', { conversationId: c.id, message: m });
    return m;
  }

  async sendMessage(conversationId, body) {
    const me = this._requireMe();
    const c = this.db.conversations.find((x) => x.id === conversationId && x.members.includes(me.id));
    if (!c) throw new Error('Conversación no encontrada');
    const text = String(body || '').trim().slice(0, 4000);
    if (!text) throw new Error('Mensaje vacío');
    const m = this._pushMessage(c, me.id, text);
    const otherId = c.members.find((x) => x !== me.id);
    const bot = this.db.users[otherId];
    if (bot?.isBot && !/^[📹📞]/u.test(text)) {
      bus.emit('typing', { conversationId, userId: otherId, typing: true });
      const history = this.db.messages.filter((x) => x.conversationId === c.id).slice(-12);
      const reply = async () => {
        let text2 = null;
        try { if (this.botReplyHook) text2 = await this.botReplyHook(this._profile(bot), history.map((h) => ({ fromMe: h.senderId === me.id, body: h.body }))); } catch { text2 = null; }
        await sleep(text2 ? 300 : 1400 + Math.random() * 1600);
        bus.emit('typing', { conversationId, userId: otherId, typing: false });
        this._pushMessage(c, otherId, text2 || pick(BOT_REPLIES));
        this._emitUnread();
      };
      this._later(reply, 700);
    }
    return m;
  }

  // ---------------- llamadas (simuladas en modo demo) ----------------
  async startCall({ conversationId, calleeId, kind = 'video' }) {
    const me = this._requireMe();
    return { id: uuid(), conversationId, callerId: me.id, calleeId, kind, status: 'ringing', createdAt: nowIso(), simulated: true };
  }

  async updateCall() { /* sin servidor en modo demo */ }

  callSignal() { return null; }

  /** Simula una llamada entrante de un usuario de ejemplo (para probar la interfaz). */
  async simulateIncomingCall(kind = 'video', botId = 'u-hype') {
    const me = this._requireMe();
    const conversationId = await this.openConversation(botId);
    bus.emit('call:incoming', { id: uuid(), conversationId, callerId: botId, calleeId: me.id, kind, status: 'ringing', createdAt: nowIso(), simulated: true, other: this._profile(this.db.users[botId]) });
  }

  async markConversationRead(conversationId) {
    const c = this.db.conversations.find((x) => x.id === conversationId);
    if (!c) return;
    c.lastRead = { ...(c.lastRead || {}), [this.db.me]: nowIso() };
    this._persist();
    this._emitUnread();
  }
}
