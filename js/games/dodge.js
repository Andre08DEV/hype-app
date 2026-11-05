// Esquiva Orbital: esquiva meteoritos con tu nave y recoge energía ⚡.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function start(area, { onScore, onEnd }) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:none';
  canvas.setAttribute('aria-label', 'Juego Esquiva Orbital');
  area.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = area.clientWidth; H = area.clientHeight;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(area);

  const ship = { x: W / 2, y: H - 70, r: 15, tx: W / 2 };
  let meteors = [], bolts = [], particles = [];
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 1.6 + 0.3 }));
  let t = 0, score = 0, alive = true, raf = 0, last = performance.now(), spawnT = 0.6, boltT = 2.5, ended = false;
  const keys = {};
  const speed = () => 1 + t / 22;

  const spawnMeteor = () => {
    const r = 10 + Math.random() * 22;
    meteors.push({ x: r + Math.random() * Math.max(1, W - 2 * r), y: -r, r, vy: (90 + Math.random() * 120) * speed(), vx: (Math.random() - 0.5) * 70, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, hue: 250 + Math.random() * 90 });
  };
  const burst = (x, y, color, n = 16) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.6, color });
    }
  };
  const explode = () => {
    alive = false;
    burst(ship.x, ship.y, '#ff7a2f', 46);
    burst(ship.x, ship.y, '#ffd166', 24);
    setTimeout(() => { if (!ended) { ended = true; onEnd(score, { detail: `${Math.round(t)} s en órbita` }); } }, 900);
  };

  function update(dt) {
    t += dt;
    score += dt * 10 * speed();
    spawnT -= dt;
    if (spawnT <= 0) { spawnMeteor(); spawnT = Math.max(0.16, 0.72 - t * 0.012); }
    boltT -= dt;
    if (boltT <= 0) { bolts.push({ x: 20 + Math.random() * Math.max(1, W - 40), y: -20, vy: 130 * speed(), r: 13 }); boltT = 2.5 + Math.random() * 3; }
    if (keys.ArrowLeft || keys.a) ship.tx -= 460 * dt;
    if (keys.ArrowRight || keys.d) ship.tx += 460 * dt;
    ship.tx = clamp(ship.tx, ship.r, W - ship.r);
    ship.x += (ship.tx - ship.x) * Math.min(1, dt * 14);
    ship.y = H - 70;
    for (const m of meteors) { m.y += m.vy * dt; m.x += m.vx * dt; m.rot += m.vr * dt; if (m.x < m.r || m.x > W - m.r) m.vx *= -1; }
    meteors = meteors.filter((m) => m.y < H + 50);
    for (const b of bolts) b.y += b.vy * dt;
    bolts = bolts.filter((b) => {
      if (dist(b, ship) < b.r + ship.r) { score += 50; burst(b.x, b.y, '#ffd166', 14); return false; }
      return b.y < H + 30;
    });
    for (const m of meteors) if (dist(m, ship) < m.r * 0.82 + ship.r * 0.75) { explode(); break; }
    onScore(score);
  }

  function draw(dt) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0620');
    g.addColorStop(1, '#1a0b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      s.y += s.z * 40 * speed() * dt;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
      ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.4})`;
      ctx.fillRect(s.x, s.y, s.z * 1.4, s.z * 1.4);
    }
    for (const b of bolts) {
      ctx.save();
      ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 18;
      ctx.font = '22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚡', b.x, b.y);
      ctx.restore();
    }
    for (const m of meteors) {
      ctx.save();
      ctx.translate(m.x, m.y); ctx.rotate(m.rot);
      ctx.shadowColor = `hsl(${m.hue} 90% 60%)`; ctx.shadowBlur = 14;
      ctx.fillStyle = `hsl(${m.hue} 45% 32%)`;
      ctx.strokeStyle = `hsl(${m.hue} 90% 65%)`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const rr = m.r * (0.82 + ((i * 37) % 7) / 30); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.arc(m.r * 0.25, -m.r * 0.2, m.r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (alive) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 22;
      const fl = 10 + Math.random() * 8;
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath(); ctx.moveTo(-6, 14); ctx.lineTo(0, 14 + fl); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill();
      const sg = ctx.createLinearGradient(0, -20, 0, 16);
      sg.addColorStop(0, '#e0f2fe'); sg.addColorStop(1, '#7c3aed');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(16, 14); ctx.lineTo(0, 7); ctx.lineTo(-16, 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (alive) update(dt);
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  const point = (e) => { const r = canvas.getBoundingClientRect(); ship.tx = clamp(e.clientX - r.left, ship.r, W - ship.r); };
  const kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { keys[e.key] = true; e.preventDefault(); } };
  const ku = (e) => { keys[e.key] = false; };
  canvas.addEventListener('pointermove', point);
  canvas.addEventListener('pointerdown', point);
  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      ended = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('keydown', kd);
      document.removeEventListener('keyup', ku);
      canvas.remove();
    },
  };
}
