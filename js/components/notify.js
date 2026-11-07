// Texto e iconos de notificaciones (compartido por la vista y los avisos en vivo).
export function describeNotification(n) {
  const who = n.actor ? `@${n.actor.username}` : 'Alguien';
  const postHref = n.post ? (n.post.kind === 'short' ? `#/shorts?id=${n.post.id}` : `#/post/${n.post.id}`) : '';
  switch (n.type) {
    case 'hype': return { emoji: '🔥', cls: 'n-hype', text: `${who} le dio hype a tu ${n.post?.kind === 'short' ? 'short' : 'post'}`, href: postHref };
    case 'comment': return { emoji: '💬', cls: 'n-comment', text: `${who} comentó tu post`, href: postHref ? `${postHref}` : '' };
    case 'mention': return { emoji: '📣', cls: 'n-mention', text: `${who} te mencionó`, href: postHref || (n.project ? `#/p/${n.project.id}` : '') };
    case 'repost': return { emoji: '🔁', cls: 'n-repost', text: `${who} reposteó tu ${n.post?.kind === 'short' ? 'short' : 'post'}`, href: postHref };
    case 'quote': return { emoji: '💬', cls: 'n-comment', text: `${who} citó tu post`, href: postHref };
    case 'follow': return { emoji: '👋', cls: 'n-follow', text: `${who} empezó a seguirte`, href: n.actor ? `#/u/${encodeURIComponent(n.actor.username)}` : '' };
    case 'project_hype': return { emoji: '🚀', cls: 'n-hype', text: `${who} le dio hype a tu proyecto${n.project ? ` «${n.project.name}»` : ''}`, href: n.project ? `#/p/${n.project.id}` : '' };
    case 'project_comment': return { emoji: '💡', cls: 'n-comment', text: `${who} dejó feedback en${n.project ? ` «${n.project.name}»` : ' tu proyecto'}`, href: n.project ? `#/p/${n.project.id}` : '' };
    case 'group_request': return { emoji: '🙋', cls: 'n-group', text: `${who} quiere unirse a ${n.group?.name || 'tu grupo'}`, href: n.group ? `#/g/${encodeURIComponent(n.group.slug)}?tab=solicitudes` : '' };
    case 'group_joined': return { emoji: '✅', cls: 'n-group', text: `Te aceptaron en ${n.group?.name || 'el grupo'}`, href: n.group ? `#/g/${encodeURIComponent(n.group.slug)}` : '' };
    default: return { emoji: '⚡', cls: 'n-system', text: n.body || 'Novedades en Hype', href: '' };
  }
}
