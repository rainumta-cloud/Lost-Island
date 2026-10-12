/* =========================================================
 * engine.js — กติกาเกมล้วนๆ (ไม่มีโค้ด DOM) ทดสอบด้วย Node ได้
 *
 * ลำดับเฟสในหนึ่งวัน:
 *   'event'  → ผู้เล่นเลือกตัวเลือก (choose)
 *   'result' → แสดงผลลัพธ์       (endDay)
 *   'night'  → สรุปตอนกลางคืน     (startDay → วันถัดไป)
 *   'end'    → จบเกม
 * ========================================================= */
(function (root) {
  'use strict';
  const TBS = root.TBS = root.TBS || {};

  const STATS = ['hp', 'energy', 'food', 'mood'];
  const MAX_DAY = 10;
  const START = { hp: 100, energy: 80, food: 70, mood: 70 };
  const CAPS = { raft: 3, signal: 2, monkey: 2 };
  const DEATH = { starve: 'starve', exhaust: 'exhaust', madness: 'madness', injury: 'injury' };
  const EPOCH = Date.UTC(2026, 0, 1);

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const val = (v, s) => (typeof v === 'function' ? v(s) : v);

  let byId = null;
  function evById(id) {
    if (!byId) { byId = {}; TBS.EVENTS.forEach(e => { byId[e.id] = e; }); }
    return byId[id];
  }

  /* ---------- สุ่มแบบกำหนด seed ได้ (mulberry32) ---------- */
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rand(s) {
    const t = (s.r + 0x6D2B79F5) >>> 0;
    s.r = t;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  /* ---------- วันที่ ---------- */
  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function prevDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return dateStr(new Date(y, m - 1, d - 1));
  }
  function islandNo(str) {
    const [y, m, d] = str.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
  }

  /* ---------- เริ่มเกม ---------- */
  function newGame(mode, date, seed) {
    const sd = mode === 'daily' ? hashStr('tbs-island-' + date) : (seed >>> 0);
    return {
      v: 1, mode, date, seed: sd, r: sd,
      day: 1, phase: 'event', ev: 'intro', last: '',
      hp: START.hp, energy: START.energy, food: START.food, mood: START.mood,
      f: {}, used: [], log: [], res: null, night: null, end: null, rec: 0
    };
  }

  function isValidSave(s) {
    return !!(s && s.v === 1 && evById(s.ev) && STATS.every(k => typeof s[k] === 'number') &&
      ['event', 'result', 'night', 'end'].indexOf(s.phase) !== -1 && Array.isArray(s.log));
  }

  /* ---------- ตัวเลือก ---------- */
  function probs(c, s) {
    const ps = c.outcomes.map(o => (o.p == null ? null : clamp(val(o.p, s), 0, 1)));
    const known = ps.reduce((a, p) => a + (p || 0), 0);
    const blanks = ps.filter(p => p == null).length;
    const rest = Math.max(0, 1 - known);
    const arr = ps.map(p => (p == null ? rest / blanks : p));
    const tot = arr.reduce((a, b) => a + b, 0) || 1;
    return arr.map(p => p / tot);
  }

  /* ข้อมูลตัวเลือกสำหรับแสดงผล: ล็อกไหม + คำใบ้ว่าค่าไหนขึ้น/ลง
   * พลังงานไม่พอยังเลือกได้ แต่ส่วนที่ขาดจะหักจากพลังชีวิตแทน (strain) */
  function options(s) {
    const ev = evById(s.ev);
    return ev.choices.map((c, i) => {
      const hidden = c.show ? !c.show(s) : false;
      const locked = hidden || (c.req ? !c.req(s) : false);
      const lock = locked ? val(c.lock, s) : '';
      const ps = probs(c, s);
      const worstEnergy = Math.min(0, ...c.outcomes.map(o => (o.fx && o.fx.energy) || 0));
      const strain = !locked && s.energy + worstEnergy < 0 ? -(s.energy + worstEnergy) : 0;
      const hints = [];
      STATS.forEach(k => {
        const ev2 = c.outcomes.reduce((a, o, j) => a + ps[j] * ((o.fx && o.fx[k]) || 0), 0);
        if (Math.abs(ev2) >= 2.5) hints.push({ stat: k, dir: ev2 > 0 ? 1 : -1, big: Math.abs(ev2) >= 18 });
      });
      const risky = c.outcomes.length > 1 && !c.outcomes.some(o => o.end);
      const item = c.outcomes.some(o => (o.add && Object.keys(o.add).length) ||
        (o.set && Object.keys(o.set).some(k => o.set[k] && !(TBS.ITEMS[k] && TBS.ITEMS[k].bad))));
      return { i, text: c.text, hidden, locked, lock, hints, risky, item, strain, final: c.outcomes.some(o => o.end) };
    });
  }

  function snapshot(s) {
    const o = {}; STATS.forEach(k => { o[k] = s[k]; });
    o.f = Object.assign({}, s.f);
    return o;
  }
  function diff(a, s) {
    const d = {};
    STATS.forEach(k => { if (s[k] !== a[k]) d[k] = s[k] - a[k]; });
    const fc = {};
    const keys = new Set(Object.keys(a.f).concat(Object.keys(s.f)));
    keys.forEach(k => { if ((a.f[k] || 0) !== (s.f[k] || 0)) fc[k] = s.f[k] || 0; });
    return { d, fc };
  }

  /* คืนค่า = พลังงานที่ขาด (ถูกหักจากพลังชีวิตแทน) */
  function applyFx(s, o) {
    let strain = 0;
    if (o.fx && o.fx.energy < 0 && s.energy + o.fx.energy < 0) strain = -(s.energy + o.fx.energy);
    if (o.fx) STATS.forEach(k => { if (o.fx[k]) s[k] = clamp(s[k] + o.fx[k], 0, 100); });
    if (strain) s.hp = clamp(s.hp - strain, 0, 100);
    if (o.set) Object.keys(o.set).forEach(k => {
      if (o.set[k]) s.f[k] = Math.min(CAPS[k] || 99, Math.max(s.f[k] || 0, o.set[k]));
      else delete s.f[k];
    });
    if (o.add) Object.keys(o.add).forEach(k => { s.f[k] = Math.min(CAPS[k] || 99, (s.f[k] || 0) + o.add[k]); });
    return strain;
  }

  function finish(s, end) {
    s.end = end;
    s.phase = 'end';
    const last = s.log[s.log.length - 1];
    if (last) last.h = s.hp;
  }

  /* ผู้เล่นเลือกตัวเลือกที่ i */
  function choose(s, i) {
    if (s.phase !== 'event') return null;
    const opt = options(s)[i];
    if (!opt || opt.locked) return null;
    const ev = evById(s.ev);
    const c = ev.choices[i];
    const ps = probs(c, s);
    let x = rand(s), oi = 0;
    for (; oi < ps.length - 1; oi++) { x -= ps[oi]; if (x < 0) break; }
    const o = c.outcomes[oi];

    const before = snapshot(s);
    const strain = applyFx(s, o);
    const bonus = [];
    (o.bonus || []).forEach((b, bi) => { if (b.if(s)) { applyFx(s, b); bonus.push(bi); } });

    if (!ev.repeat && !o.keep && s.used.indexOf(ev.id) === -1) s.used.push(ev.id);
    s.last = ev.id;
    const ch = diff(before, s);
    s.res = { e: ev.id, c: i, o: oi, b: bonus, d: ch.d, fc: ch.fc, x: strain };
    s.log.push({ d: s.day, e: ev.id, c: i, o: oi, h: s.hp });

    let end = o.end ? val(o.end, s) : null;
    if (!end && s.hp <= 0) {
      const hit = -((o.fx && o.fx.hp) || 0);
      end = strain >= hit ? 'exhaust' : (DEATH[o.cause] || 'injury');
    }
    if (end) finish(s, end);
    else s.phase = 'result';
    return s.res;
  }

  /* ---------- กลางคืน: ค่าที่ลดตามเวลา + กฎพลังชีวิตหลายเงื่อนไข ---------- */
  function endDay(s) {
    if (s.phase !== 'result') return null;
    const lines = [];
    const add = (code, delta) => {
      const st = TBS.NIGHT[code].stat;
      const b = s[st];
      s[st] = clamp(b + delta, 0, 100);
      if (s[st] !== b) lines.push([code, s[st] - b]);
    };

    add('hunger', -10);
    if ((s.f.monkey || 0) >= 2) add('monkeyfood', 6);
    add('fatigue', -8);
    add('lonely', -8);
    if (s.f.fire) add('fire', 4);
    if (s.f.wilson) add('wilson', 3);

    // ตรวจสภาพร่างกายก่อนนอน (พลังงานยังไม่ฟื้น)
    const dmg = [];
    if (s.food <= 0) dmg.push(['starving', -22, 'starve']);
    else if (s.food < 15) dmg.push(['hungry', -8, 'starve']);
    if (s.energy <= 0) dmg.push(['collapse', -18, 'exhaust']);
    else if (s.energy < 15) dmg.push(['tired', -8, 'exhaust']);
    if (s.mood <= 0) dmg.push(['despair', -20, 'madness']);
    else if (s.mood < 15) dmg.push(['sad', -8, 'madness']);
    if (s.f.injured) dmg.push(['wound', -8, 'injury']);

    const fit = !dmg.length && s.food >= 40 && s.energy >= 40 && s.mood >= 40;
    dmg.forEach(([code, d]) => add(code, d));
    if (s.f.shelter) add('sleep_shelter', 14); else add('sleep_sand', 6);
    if (fit) add('healthy', 10);
    else if (!dmg.length) add('rest', 3);

    s.night = lines;
    const last = s.log[s.log.length - 1];
    if (last) last.h = s.hp;

    if (s.hp <= 0) {
      const worst = dmg.reduce((a, b) => (b[1] < a[1] ? b : a));
      finish(s, DEATH[worst[2]]);
    } else {
      s.phase = 'night';
    }
    return lines;
  }

  /* ---------- เช้าวันใหม่: สุ่มเหตุการณ์ตามเงื่อนไข ---------- */
  function eligible(s) {
    return TBS.EVENTS.filter(e => {
      if (e.id === 'intro' || e.id === 'finale') return false;
      if (!e.repeat && s.used.indexOf(e.id) !== -1) return false;
      if (e.id === s.last) return false;
      const [a, b] = e.days || [2, MAX_DAY - 1];
      if (s.day < a || s.day > b) return false;
      return !e.when || !!e.when(s);
    });
  }
  function pickEvent(s) {
    const pool = eligible(s);
    if (!pool.length) return 'routine';
    const ws = pool.map(e => Math.max(0, val(e.weight == null ? 1 : e.weight, s)));
    let x = rand(s) * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x < 0) return pool[i].id; }
    return pool[pool.length - 1].id;
  }
  function startDay(s) {
    if (s.phase !== 'night') return null;
    s.day += 1;
    s.res = null;
    s.night = null;
    s.ev = s.day >= MAX_DAY ? 'finale' : pickEvent(s);
    s.phase = 'event';
    return s.ev;
  }

  /* ---------- สถิติข้ามรอบ (สมุดฉากจบ / streak) ---------- */
  function newMeta() {
    return { v: 1, e: {}, runs: 0, wins: 0, streak: 0, best: 0, last: '', daily: null };
  }
  function recordEnd(meta, s) {
    if (s.rec) return false;
    s.rec = 1;
    const isNew = !meta.e[s.end];
    meta.e[s.end] = (meta.e[s.end] || 0) + 1;
    meta.runs += 1;
    if (!TBS.ENDINGS[s.end].dead) meta.wins += 1;
    if (s.mode === 'daily' && (!meta.last || s.date > meta.last)) {
      meta.streak = meta.last && meta.last === prevDate(s.date) ? meta.streak + 1 : 1;
      meta.best = Math.max(meta.best, meta.streak);
      meta.last = s.date;
      meta.daily = { d: s.date, e: s.end, day: s.day, h: s.log.map(l => l.h) };
    }
    return isNew;
  }
  function currentStreak(meta, today) {
    return meta.last === today || meta.last === prevDate(today) ? meta.streak : 0;
  }

  TBS.Engine = {
    STATS, MAX_DAY, START, CAPS,
    evById, newGame, isValidSave, options, probs, choose, endDay, startDay, eligible,
    newMeta, recordEnd, currentStreak, dateStr, prevDate, islandNo, hashStr
  };
})(globalThis);
