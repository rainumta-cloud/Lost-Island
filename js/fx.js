/* =========================================================
 * fx.js — เอฟเฟกต์ภาพทั้งหมด (พลุ, confetti, จอสั่น, พิมพ์ทีละตัว,
 * ฉากเปลี่ยนวัน, ป๊อปอัปได้ไอเท็ม, นก/ปลา/ดาวตก/ฟ้าแลบในฉาก)
 * ถ้าผู้เล่นตั้งค่า "ลดการเคลื่อนไหว" ในเครื่อง จะปิดเอฟเฟกต์ที่ขยับแรงๆ ให้เอง
 * ========================================================= */
(function (root) {
  'use strict';
  const TBS = root.TBS = root.TBS || {};
  const mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const calm = () => mq.matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const $ = id => document.getElementById(id);
  const COLORS = ['#ef6f4c', '#f6b443', '#3f9b5d', '#1b8a9e', '#8e5cd9', '#ff8fb1', '#ffe066'];

  /* ---------- อนุภาคบน canvas เต็มจอ ---------- */
  let cv = null, cx = null, parts = [], raf = 0, dpr = 1;
  function setup() {
    cv = $('fx-canvas');
    if (!cv) return false;
    cx = cv.getContext('2d');
    resize();
    root.addEventListener('resize', resize);
    return true;
  }
  function resize() {
    dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
  }
  function tick() {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (--p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g;
      p.vx *= p.drag;
      p.vy *= p.drag;
      if (p.wobble) { p.t += .08; p.vx += Math.sin(p.t) * p.wobble; }
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      cx.globalAlpha = Math.min(1, p.life / p.fade);
      cx.save();
      cx.translate(p.x, p.y);
      if (p.shape === 'line') {
        cx.strokeStyle = p.color;
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.moveTo(0, 0);
        cx.lineTo(p.vx * 2, p.vy * 2);
        cx.stroke();
      } else {
        cx.rotate(p.rot);
        if (p.emoji) {
          cx.font = p.size + 'px serif';
          cx.textAlign = 'center';
          cx.textBaseline = 'middle';
          cx.fillText(p.emoji, 0, 0);
        } else if (p.shape === 'rect') {
          cx.fillStyle = p.color;
          cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          cx.fillStyle = p.color;
          cx.beginPath();
          cx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          cx.fill();
        }
      }
      cx.restore();
    }
    cx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }
  function add(p) {
    if (!cv && !setup()) return;
    parts.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: .15, drag: .98, rot: 0, vr: 0, t: 0, wobble: 0,
      life: 60, fade: 20, size: 8, color: pick(COLORS), shape: 'circle', emoji: null
    }, p));
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function burst(x, y, o = {}) {
    if (calm()) return;
    const n = o.count || 14;
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(o.min || 2, o.speed || 6);
      add({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (o.lift || 0),
        g: o.g == null ? .12 : o.g, drag: .95, life: rand(30, o.life || 55), fade: 18,
        size: rand(o.sizeMin || 4, o.size || 9), vr: rand(-.2, .2),
        color: pick(o.colors || COLORS), emoji: o.emoji ? pick(o.emoji) : null
      });
    }
  }
  function burstAt(el, o) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, o);
  }
  function confetti(colors) {
    if (calm()) return;
    for (let i = 0; i < 160; i++) {
      add({
        x: rand(0, innerWidth), y: rand(-innerHeight * .7, -10), vx: rand(-1.5, 1.5), vy: rand(1.5, 4),
        g: .04, drag: .995, wobble: .06, t: rand(0, 6), life: 320, fade: 60, size: rand(7, 12),
        shape: 'rect', color: pick(colors || COLORS), vr: rand(-.2, .2)
      });
    }
  }
  function fireworks(n, colors) {
    if (calm()) return;
    for (let k = 0; k < n; k++) {
      setTimeout(() => burst(rand(innerWidth * .15, innerWidth * .85), rand(innerHeight * .12, innerHeight * .45),
        { count: 40, speed: 7, min: 2, g: .07, life: 75, size: 6, colors }), k * 420 + rand(0, 200));
    }
  }
  function gloom() {
    if (calm()) return;
    for (let i = 0; i < 90; i++) {
      add({ x: rand(0, innerWidth + 100), y: rand(-innerHeight, 0), vx: -1.2, vy: rand(6, 9), g: 0, drag: 1,
        life: 220, fade: 40, shape: 'line', color: 'rgba(170, 200, 235, .65)' });
    }
  }
  function leaves() {
    if (calm()) return;
    for (let i = 0; i < 18; i++) {
      add({ x: rand(0, innerWidth), y: rand(-300, -20), vx: rand(-.5, .5), vy: rand(.8, 1.6), g: .005, drag: 1,
        wobble: .04, t: rand(0, 6), life: 420, fade: 80, size: rand(18, 26), emoji: pick(['🍃', '🍂']), vr: rand(-.03, .03) });
    }
  }
  function celebrate(tone) {
    if (tone === 'good') { confetti(); fireworks(3); }
    else if (tone === 'secret') { confetti(['#8e5cd9', '#c39bff', '#f6b443', '#ffe066', '#ff8fb1']); fireworks(5, ['#c39bff', '#ffe066', '#ffffff']); }
    else if (tone === 'neutral') leaves();
    else gloom();
  }

  /* ---------- จอสั่น / แฟลช ---------- */
  function shake(hard) {
    if (calm()) return;
    const app = document.querySelector('.app');
    app.classList.remove('shake', 'shake-hard');
    void app.offsetWidth;
    app.classList.add(hard ? 'shake-hard' : 'shake');
    setTimeout(() => app.classList.remove('shake', 'shake-hard'), 650);
  }
  function flash(color, ms) {
    const el = $('fx-flash');
    if (!el || calm()) return;
    el.style.background = color;
    el.style.animationDuration = (ms || 500) + 'ms';
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }
  function hero(kind) {
    const h = $('hero');
    if (!h || calm()) return;
    h.classList.remove('jump', 'hurt', 'bump');
    void h.offsetWidth;
    h.classList.add(kind);
  }

  /* ---------- ตัวหนังสือพิมพ์ทีละตัว (ไม่ทำให้หน้ากระตุก) ---------- */
  function typewriter(el, text, o = {}) {
    const chars = Array.from(text);
    let shown = 0, timer = 0, finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      el.textContent = text;
      if (o.onDone) o.onDone();
    };
    if (calm()) { done(); return { skip: done, busy: () => false }; }
    el.innerHTML = '<span class="tw-on"></span><span class="tw-off"></span>';
    const on = el.firstChild, off = el.lastChild;
    off.textContent = text;
    const cps = o.cps || 70;
    let acc = 0, last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / 1000 * cps;
      last = now;
      const n = Math.floor(acc);
      if (!n) return;
      acc -= n;
      shown = Math.min(chars.length, shown + n);
      on.textContent = chars.slice(0, shown).join('');
      off.textContent = chars.slice(shown).join('');
      if (shown >= chars.length) done();
    }, 16);
    return { skip: done, busy: () => !finished };
  }

  /* ---------- ฉากเปลี่ยนวัน ---------- */
  let overlaySkip = null;
  function dayTransition(big, small, cb) {
    const ov = $('day-overlay');
    if (calm() || !ov) { cb(); return; }
    ov.querySelector('.do-big').textContent = big;
    ov.querySelector('.do-small').textContent = small;
    ov.hidden = false;
    ov.classList.remove('play');
    void ov.offsetWidth;
    ov.classList.add('play');
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      ov.hidden = true;
      ov.classList.remove('play');
      ov.onclick = null;
      overlaySkip = null;
      cb();
    };
    const timer = setTimeout(finish, 2000);
    ov.onclick = finish;
    overlaySkip = finish;
  }

  /* ---------- ป๊อปอัปได้ไอเท็ม ---------- */
  const queue = [];
  let popping = false;
  function itemGet(icon, label, sub) {
    queue.push({ icon, label, sub });
    if (!popping) nextItem();
  }
  function nextItem() {
    const box = $('item-pop');
    const it = queue.shift();
    if (!it || !box) { popping = false; return; }
    popping = true;
    box.querySelector('.ip-icon').textContent = it.icon;
    box.querySelector('.ip-sub').textContent = it.sub;
    box.querySelector('.ip-label').textContent = it.label;
    box.hidden = false;
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    setTimeout(() => burstAt(box.querySelector('.ip-icon'), { emoji: ['✨', '⭐', '🌟'], count: 12, g: .03, speed: 5, size: 20, sizeMin: 12 }), 150);
    setTimeout(() => { box.hidden = true; nextItem(); }, 1700);
  }

  /* ---------- ตัวเลขวิ่ง ---------- */
  function countTo(el, to) {
    const from = Number(el.textContent);
    if (calm() || isNaN(from) || from === to) { el.textContent = to; return; }
    if (el._raf) cancelAnimationFrame(el._raf);
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  /* ---------- ชีวิตในฉากเกาะ: ฝน นก ปลา ดาวตก ฟ้าแลบ ---------- */
  const BIRD = '<svg viewBox="0 0 24 10" width="22" height="9" aria-hidden="true"><path d="M1 7 Q6 0 12 6 Q18 0 23 7" fill="none" stroke="#24414b" stroke-width="2" stroke-linecap="round"/></svg>';
  const BOLT = '<svg viewBox="0 0 30 100" width="28" height="96" aria-hidden="true"><polyline points="19,0 8,44 17,46 5,100 27,36 16,34 25,0" fill="#fff8c4" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  function initRain(scene) {
    const box = scene.querySelector('.weather.rain');
    if (!box || box.childElementCount) return;
    let html = '';
    for (let i = 0; i < 70; i++) {
      html += `<i style="left:${rand(-5, 115).toFixed(1)}%;animation-delay:${rand(-1, 0).toFixed(2)}s;` +
        `animation-duration:${rand(.45, .8).toFixed(2)}s;opacity:${rand(.35, .85).toFixed(2)}"></i>`;
    }
    box.innerHTML = html;
  }
  function spawn(scene, cls, html, life, style) {
    const el = document.createElement('div');
    el.className = 'amb ' + cls;
    el.innerHTML = html;
    Object.assign(el.style, style);
    scene.appendChild(el);
    setTimeout(() => el.remove(), life);
  }
  function lightning(scene) {
    spawn(scene, 'bolt', BOLT, 650, { left: rand(8, 82) + '%' });
    scene.classList.remove('strike');
    void scene.offsetWidth;
    scene.classList.add('strike');
    if (TBS.Audio) TBS.Audio.thunder(rand(.15, 1));
  }
  let ambientTimer = 0;
  function startAmbient(scene) {
    initRain(scene);
    if (ambientTimer) return;
    ambientTimer = setInterval(() => {
      if (document.hidden || calm()) return;
      const c = scene.className;
      if (c.indexOf('t-storm') !== -1) { if (Math.random() < .3) lightning(scene); }
      else if (c.indexOf('t-rain') !== -1) { /* ฝนตกเฉยๆ */ }
      else if (c.indexOf('t-night') !== -1) {
        if (Math.random() < .15) spawn(scene, 'shooting', '', 1300, { top: rand(6, 45) + 'px', left: rand(5, 60) + '%' });
      } else {
        if (Math.random() < .14) spawn(scene, 'bird' + (Math.random() < .5 ? ' rtl' : ''), BIRD + (Math.random() < .6 ? BIRD : ''), 13000,
          { top: rand(14, 64) + 'px', animationDuration: rand(9, 13).toFixed(1) + 's' });
        if (Math.random() < .12) spawn(scene, 'fish', '<span>🐟</span>', 1700, { left: rand(6, 88) + '%' });
      }
    }, 1000);
  }

  TBS.FX = {
    calm, burst, burstAt, confetti, fireworks, celebrate, shake, flash, hero,
    typewriter, dayTransition, itemGet, countTo, startAmbient,
    skipOverlay: () => { if (overlaySkip) overlaySkip(); },
    overlayActive: () => !!overlaySkip
  };
})(globalThis);
