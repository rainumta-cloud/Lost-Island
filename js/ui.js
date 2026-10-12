/* =========================================================
 * ui.js — วาดหน้าจอและรับการกดของผู้เล่น
 * (กติกาทั้งหมดอยู่ใน engine.js — ไฟล์นี้แค่แสดงผลตาม state + เรียกเอฟเฟกต์/เสียง)
 * ========================================================= */
(function () {
  'use strict';
  const T = globalThis.TBS, E = T.Engine, Store = T.Store, FX = T.FX, Audio = T.Audio;
  const $ = id => document.getElementById(id);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = str => String(str).replace(/[&<>"']/g, c => ESC[c]);
  const signed = n => (n > 0 ? '+' : '') + n;
  const today = () => E.dateStr(new Date());
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const ENDING_KEYS = Object.keys(T.ENDINGS);
  const ITEM_KEYS = Object.keys(T.ITEMS);
  const TONE = { good: 'Good Ending', bad: 'Bad Ending', neutral: 'Okay Ending', secret: 'Secret Ending' };
  const END_FACE = { rescue: '🥳', raft: '😤', king: '🤴', rich: '🤑', monkey: '🙈', hermit: '🧔' };
  const SEA = ['#1b8a9e', '#7fd3ea', '#f6b443', '#ffffff'];

  let S = Store.loadSave();      // เกมที่กำลังเล่น (หรือ null)
  let meta = Store.loadMeta();   // สถิติข้ามรอบ
  let shown = {};                // ค่าที่แสดงอยู่ (ไว้ทำตัวเลขลอย +/-)
  let shownFlags = {};
  let endPending = false;        // กำลังโชว์ผลลัพธ์สุดท้ายก่อนเข้าหน้าฉากจบ
  let typing = null;             // ตัวพิมพ์ทีละตัวที่กำลังทำงาน
  let countdownTimer = null;

  const itemName = (k, v) => {
    const it = T.ITEMS[k];
    return typeof it.name === 'function' ? it.name(v) : it.name;
  };
  const persist = () => { if (S) Store.save(S); };
  const isTyping = () => !!(typing && typing.busy());

  /* ---------- สลับหน้าจอ ---------- */
  function showScreen(name) {
    ['title', 'game', 'end'].forEach(n => { $('screen-' + n).hidden = n !== name; });
    window.scrollTo(0, 0);
  }
  function scrollToGameTop() {
    const top = $('screen-game').getBoundingClientRect().top + window.scrollY - 8;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }

  /* ---------- หน้าแรก ---------- */
  function renderTitle() {
    stopCountdown();
    typing = null;
    showScreen('title');
    setScene(null);
    const t = today();

    const btnC = $('btn-continue');
    if (S && S.phase !== 'end') {
      btnC.hidden = false;
      $('continue-sub').textContent = (S.mode === 'daily' ? '🌅 Daily Island' : '🎲 Random Island') +
        ` · Day ${S.day}/10 · ❤️ ${S.hp}`;
    } else {
      btnC.hidden = true;
    }

    const doneToday = !!(meta.daily && meta.daily.d === t);
    const inProgress = !!(S && S.mode === 'daily' && S.date === t && S.phase !== 'end');
    $('daily-label').textContent = `Daily Island #${E.islandNo(t)}`;
    $('btn-daily').disabled = doneToday;
    $('daily-sub').textContent = doneToday ? 'Done for today! A new island comes at midnight.'
      : inProgress ? 'In progress — tap to keep playing'
        : 'Same island for everyone · Once a day · Build a streak!';

    const box = $('daily-done');
    if (doneToday) {
      const d = meta.daily, en = T.ENDINGS[d.e];
      box.hidden = false;
      box.innerHTML = `Today's result: <b>${en.icon} ${esc(en.title)}</b> ${grid(d.h, d.e)}<br>` +
        `New island in <span class="countdown" id="countdown">--:--:--</span>` +
        `<div class="row"><button class="btn-ghost" id="btn-share-daily">📋 Copy today's result</button></div>`;
      $('btn-share-daily').onclick = () => copyText(shareText({ mode: 'daily', date: d.d, end: d.e, day: d.day, h: d.h }));
      startCountdown();
    } else {
      box.hidden = true;
    }

    const found = ENDING_KEYS.filter(k => meta.e[k]).length;
    $('title-stats').innerHTML = [
      [E.currentStreak(meta, t), '🔥 Streak'],
      [meta.best, '🏅 Best'],
      [meta.runs ? Math.round(meta.wins / meta.runs * 100) + '%' : '–', '🛟 Survived'],
      [`${found}/${ENDING_KEYS.length}`, '🏆 Endings']
    ].map(([v, l]) => `<div class="tstat"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  function startCountdown() {
    const tick = () => {
      const el = $('countdown');
      if (!el) return stopCountdown();
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const sec = Math.max(0, Math.floor((next - now) / 1000));
      if (sec === 0) return renderTitle();
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
      const mm = String(Math.floor(sec % 3600 / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { if (countdownTimer) clearInterval(countdownTimer); countdownTimer = null; }

  /* ---------- เริ่ม / เล่นต่อ ---------- */
  function startGame(mode) {
    const t = today();
    if (mode === 'daily' && S && S.mode === 'daily' && S.date === t && S.phase !== 'end') return enterGame();
    const go = () => {
      S = E.newGame(mode, t, (Math.random() * 4294967296) >>> 0);
      persist();
      FX.dayTransition('Day 1', 'Can you survive 10 days?', enterGame);
    };
    if (S && S.phase !== 'end') {
      confirmBox('Start a new game?',
        `You have a game in progress (Day ${S.day}/10). If you start a new one, that progress will be lost.`,
        'Start New', go);
    } else {
      go();
    }
  }

  function enterGame() {
    showScreen('game');
    endPending = false;
    shown = {};
    shownFlags = Object.assign({}, S.f);
    renderGame(false);
  }

  function renderGame(animate) {
    if (S.phase === 'end' && !endPending) return renderEnding();
    renderTop();
    renderStats(animate);
    renderItems();
    setScene(S);
    renderCard();
  }

  /* ---------- ส่วนบน: วัน + โหมด ---------- */
  function renderTop() {
    $('day-label').textContent = S.day >= E.MAX_DAY ? `Day ${E.MAX_DAY} of ${E.MAX_DAY} · Last Day!` : `Day ${S.day} of ${E.MAX_DAY}`;
    let dots = '';
    for (let d = 1; d <= E.MAX_DAY; d++) dots += `<i class="${d < S.day ? 'done' : d === S.day ? 'now' : ''}"></i>`;
    $('day-dots').innerHTML = dots;
    $('mode-chip').textContent = S.mode === 'daily' ? `🌅 Island #${E.islandNo(S.date)}` : '🎲 Random';
  }

  /* ---------- แถบสถานะ: สี/ความยาว/ตัวเลขวิ่ง เปลี่ยนตามค่า ---------- */
  function renderStats(animate) {
    const wrap = $('stats');
    if (!wrap.children.length) {
      wrap.innerHTML = E.STATS.map(k => {
        const m = T.STAT_META[k];
        return `<div class="stat" id="st-${k}" role="progressbar" aria-label="${m.name}" aria-valuemin="0" aria-valuemax="100">` +
          `<div class="stat-top"><span class="stat-name">${m.icon} ${m.name}</span><span class="stat-val">0</span></div>` +
          `<div class="bar"><div class="bar-fill"></div></div></div>`;
      }).join('');
    }
    E.STATS.forEach(k => {
      const v = S[k], el = $('st-' + k), valEl = el.querySelector('.stat-val');
      el.querySelector('.bar-fill').style.width = v + '%';
      el.setAttribute('aria-valuenow', v);
      el.classList.toggle('lv-low', v < 30);
      el.classList.toggle('lv-mid', v >= 30 && v < 60);
      if (animate && shown[k] != null && shown[k] !== v) {
        const d = v - shown[k];
        floatDelta(el, d);
        el.classList.remove('gain', 'loss');
        void el.offsetWidth;
        el.classList.add(d > 0 ? 'gain' : 'loss');
        setTimeout(() => el.classList.remove('gain', 'loss'), 950);
        FX.countTo(valEl, v);
      } else {
        valEl.textContent = v;
      }
      shown[k] = v;
    });
  }
  function floatDelta(el, d) {
    const old = el.querySelector('.float');
    if (old) old.remove();
    const f = document.createElement('span');
    f.className = 'float ' + (d > 0 ? 'up' : 'down');
    f.textContent = signed(d);
    el.appendChild(f);
    setTimeout(() => f.remove(), 1700);
  }

  function renderItems() {
    const keys = ITEM_KEYS.filter(k => S.f[k]);
    $('items').innerHTML = keys.length ? keys.map(k => {
      const it = T.ITEMS[k];
      const isNew = shownFlags[k] !== S.f[k];
      return `<span class="item${it.bad ? ' bad' : ''}${isNew ? ' new' : ''}" title="${esc(it.desc)}">${it.icon} ${esc(itemName(k, S.f[k]))}</span>`;
    }).join('') : '<span class="items-empty">No items yet — go explore!</span>';
    shownFlags = Object.assign({}, S.f);
  }

  /* ---------- ฉากเกาะด้านบน + เสียงบรรยากาศตามฉาก ---------- */
  function heroFace(s) {
    if (!s) return '🙂';
    if (s.phase === 'end' && !endPending) return T.ENDINGS[s.end].dead ? '👻' : (END_FACE[s.end] || '😎');
    if (s.f.injured) return '🤕';
    if (s.hp < 30) return '😫';
    if (s.energy < 15) return '😪';
    if (s.food < 15) return '😖';
    if (s.mood < 20) return '😢';
    if (s.mood >= 75 && s.hp >= 70) return '😄';
    if (s.mood >= 45) return '🙂';
    return '😐';
  }
  function setScene(s) {
    const sc = $('scene');
    let t = 't-day';
    if (s) {
      if (s.phase === 'end' && !endPending) t = T.ENDINGS[s.end].dead ? 't-night' : 't-dusk';
      else if (s.phase === 'night' || (endPending && s.night)) t = 't-night';
      else {
        const w = E.evById(s.ev).weather;
        t = w ? 't-' + w : (s.day >= E.MAX_DAY ? 't-dusk' : 't-day');
      }
    }
    sc.className = 'scene ' + t + (s && s.f.fire ? ' has-fire' : '');
    sc.querySelectorAll('.prop').forEach(p => {
      const v = s ? (s.f[p.dataset.flag] || 0) : 0;
      p.classList.toggle('on', v > 0);
      if (p.dataset.flag === 'raft') p.classList.toggle('partial', v > 0 && v < 3);
    });
    const hero = $('hero'), face = heroFace(s);
    if (hero.textContent !== face) {
      hero.textContent = face;
      FX.hero('bump');
    }
    document.body.classList.toggle('danger', !!(s && s.phase !== 'end' && s.hp < 35));
    Audio.setMode(t === 't-storm' ? 'storm' : t === 't-rain' ? 'rain' : t === 't-night' ? 'night' : 'calm');
  }

  /* ---------- การ์ดเนื้อเรื่อง ---------- */
  function cardHead(icon, kicker, title) {
    return `<div class="card-head"><div class="card-icon">${icon}</div><div>` +
      `<div class="kicker">${kicker}</div><h2>${esc(title)}</h2></div></div>`;
  }

  /* ใส่ข้อความแบบพิมพ์ทีละตัว แล้วค่อยโชว์ส่วนที่ซ่อนไว้ (ตัวเลือก/ปุ่ม) */
  function typeInto(text, revealSel) {
    const card = $('card'), el = $('story-text'), rest = card.querySelector(revealSel);
    card.setAttribute('aria-busy', 'true');
    typing = FX.typewriter(el, text, {
      cps: 75,
      onDone: () => {
        card.setAttribute('aria-busy', 'false');
        if (rest) { rest.classList.remove('pending'); rest.classList.add('reveal'); }
      }
    });
    el.onclick = () => { if (isTyping()) typing.skip(); };
  }

  function renderCard() {
    const card = $('card');
    let text = null, reveal = null;
    if (S.phase === 'event') {
      card.innerHTML = eventHTML();
      text = E.evById(S.ev).text;
      reveal = '.choices';
    } else if (S.phase === 'night' || (endPending && S.night)) {
      card.innerHTML = nightHTML();
    } else {
      card.innerHTML = resultHTML();
      const r = S.res;
      text = E.evById(r.e).choices[r.c].outcomes[r.o].text;
      reveal = '.after';
    }
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
    card.querySelectorAll('.choice').forEach(b => { b.onclick = e => onChoose(Number(b.dataset.i), e); });
    const next = $('btn-next');
    if (next) next.onclick = onNext;
    typing = null;
    if (text != null) typeInto(text, reveal);
  }

  function hintsHTML(o) {
    if (o.locked) return `<span class="hint warn">🔒 ${esc(o.lock)}</span>`;
    const parts = o.hints.map(h => {
      const arrow = (h.dir > 0 ? '▲' : '▼').repeat(h.big ? 2 : 1);
      return `<span class="hint">${T.STAT_META[h.stat].icon}<span class="${h.dir > 0 ? 'up' : 'down'}">${arrow}</span></span>`;
    });
    if (o.item) parts.push('<span class="hint">🎁 Item</span>');
    if (o.risky) parts.push('<span class="hint">🎲 Luck</span>');
    if (o.final) {
      const c = E.evById(S.ev).choices[o.i];
      if (c.outcomes.length > 1) parts.push(`<span class="hint odds">🎯 ${Math.round(E.probs(c, S)[0] * 100)}% chance</span>`);
    }
    if (o.strain) parts.push(`<span class="hint warn">⚠️ Too tired! −${o.strain} ❤️</span>`);
    return parts.join('');
  }

  function eventHTML() {
    const ev = E.evById(S.ev);
    const opts = E.options(S).filter(o => !o.hidden);
    const kicker = S.day === 1 ? 'Day 1 · The Beginning' : S.day >= E.MAX_DAY ? 'Last Day · Big Decision' : `Day ${S.day}`;
    const btns = opts.map((o, n) =>
      `<button class="choice${o.locked ? ' locked' : ''}${o.strain ? ' strain' : ''}" data-i="${o.i}" data-n="${n + 1}" style="--i:${n}"${o.locked ? ' disabled' : ''}>` +
      `<span class="key">${o.locked ? '🔒' : n + 1}</span>` +
      `<span class="choice-text">${esc(o.text)}</span>` +
      `<span class="hints">${hintsHTML(o)}</span></button>`
    ).join('');
    return cardHead(ev.icon, kicker, ev.title) +
      `<p class="card-text" id="story-text"></p>` +
      `<div class="choices pending">${btns}<p class="kbd-tip">Tip: press 1–${opts.length} on your keyboard to choose</p></div>`;
  }

  function deltaChips(d, fc) {
    const chips = E.STATS.filter(k => d[k]).map(k =>
      `<span class="delta ${d[k] > 0 ? 'up' : 'down'}">${T.STAT_META[k].icon} ${signed(d[k])}</span>`);
    Object.keys(fc || {}).forEach(k => {
      const it = T.ITEMS[k], v = fc[k];
      if (!it) return;
      if (it.bad) chips.push(v ? `<span class="delta down">${it.icon} ${esc(it.name)}</span>` : '<span class="delta up">✨ Healed!</span>');
      else chips.push(v ? `<span class="delta item">${it.icon} ${esc(itemName(k, v))}</span>` : `<span class="delta down">➖ ${it.icon} ${esc(itemName(k, 1))}</span>`);
    });
    return chips.join('');
  }

  function resultHTML() {
    const r = S.res, ev = E.evById(r.e), c = ev.choices[r.c], o = c.outcomes[r.o];
    const bonus = r.b.map(bi => `<p class="bonus">${esc(o.bonus[bi].text)}</p>`).join('');
    const strain = r.x ? `<p class="strain-note">⚠️ You pushed yourself too hard! You didn't have enough energy, so you lost ${r.x} Health instead.</p>` : '';
    const btn = S.phase === 'end'
      ? '<button class="next-btn end" id="btn-next">See the ending ➜</button>'
      : '<button class="next-btn night" id="btn-next">🌙 Rest for the night</button>';
    return cardHead(ev.icon, `Day ${S.day} · What happened`, ev.title) +
      `<p class="result-choice">You chose: ${esc(c.text)}</p>` +
      `<p class="result-text" id="story-text"></p>` +
      `<div class="after pending">${bonus}${strain}<div class="deltas">${deltaChips(r.d, r.fc)}</div>${btn}` +
      `<p class="kbd-tip">Press Enter to continue</p></div>`;
  }

  /* คำเตือนแบบหลายเงื่อนไขก่อนเริ่มวันใหม่ */
  function nightTips() {
    const tips = [];
    if (S.food < 25) tips.push("🍖 You're almost out of food. Find something to eat tomorrow!");
    if (S.energy < 25) tips.push("⚡ You're very tired. Try to get some rest.");
    if (S.mood < 25) tips.push("😊 You're feeling sad. Do something fun!");
    if (S.f.injured) tips.push("🤕 You're still hurt. Look for healing herbs.");
    if (S.day + 1 === E.MAX_DAY) {
      const ways = [];
      if (S.f.signal) ways.push('🆘 Signal a ship');
      if ((S.f.raft || 0) >= 3) ways.push('🛶 Sail your raft');
      ways.push('🏝️ Stay on the island');
      tips.push(`🌅 Tomorrow is the last day! Your choices: ${ways.join(' · ')}`);
    }
    return tips.map(t => `<p class="bonus">${t}</p>`).join('');
  }

  function nightHTML() {
    const lines = S.night.map(([code, d], i) => {
      const n = T.NIGHT[code], st = T.STAT_META[n.stat];
      const cls = (d > 0 ? 'up' : 'down') + (n.stat === 'hp' && d < 0 ? ' danger' : '');
      return `<li class="${cls}" style="--i:${i}"><span>${esc(n.text)}</span><b>${st.icon} ${signed(d)}</b></li>`;
    }).join('');
    let btn;
    if (S.phase === 'end') btn = '<button class="next-btn end" id="btn-next">See the ending ➜</button>';
    else if (S.day + 1 >= E.MAX_DAY) btn = '<button class="next-btn" id="btn-next">🌅 Start the last day</button>';
    else btn = `<button class="next-btn" id="btn-next">☀️ Start Day ${S.day + 1}</button>`;
    return cardHead('🌙', `Night ${S.day}`, 'Night on the Island') +
      `<ul class="night-list">${lines}</ul>${S.phase === 'end' ? '' : nightTips()}${btn}<p class="kbd-tip">Press Enter to continue</p>`;
  }

  /* ---------- เอฟเฟกต์ตามผลลัพธ์ ---------- */
  function statFx(d) {
    if (d.hp < 0) {
      FX.shake(d.hp <= -15);
      FX.flash('rgba(214, 45, 45, .35)', 450);
      FX.burstAt($('st-hp'), { emoji: ['💔'], count: 5, g: .25, speed: 4, size: 22, sizeMin: 14 });
    } else if (d.hp > 0) {
      FX.burstAt($('st-hp'), { emoji: ['❤️', '💖'], count: 7, g: -.06, speed: 3, size: 20, sizeMin: 12 });
    }
    ['energy', 'food', 'mood'].forEach(k => {
      if (d[k] >= 10) FX.burstAt($('st-' + k), { emoji: ['✨'], count: 6, g: -.04, speed: 3, size: 16, sizeMin: 10 });
    });
  }
  function itemFx(fc) {
    Object.keys(fc || {}).forEach(k => {
      const it = T.ITEMS[k], v = fc[k];
      if (!it || it.bad || !v) return;
      const sub = k === 'raft' ? (v >= 3 ? 'RAFT COMPLETE!' : 'RAFT PIECE!') : k === 'signal' || k === 'monkey' ? 'LEVEL UP!' : 'NEW ITEM!';
      FX.itemGet(it.icon, itemName(k, v), sub);
    });
  }

  /* ---------- การกระทำของผู้เล่น ---------- */
  function onChoose(i, e) {
    if (!S || S.phase !== 'event') return;
    if (isTyping()) { typing.skip(); return; }
    if (e && e.clientX) FX.burst(e.clientX, e.clientY, { count: 12, colors: SEA, speed: 5, size: 7 });
    if (!E.choose(S, i)) return;
    if (S.phase === 'end') endPending = true;
    persist();
    const r = S.res, sum = E.STATS.reduce((a, k) => a + (r.d[k] || 0), 0);
    renderTop();
    renderStats(true);
    renderItems();
    setScene(S);
    renderCard();
    statFx(r.d);
    itemFx(r.fc);
    FX.hero(r.d.hp < 0 || sum < 0 ? 'hurt' : 'jump');
  }

  function onNext() {
    if (isTyping()) { typing.skip(); return; }
    if (endPending) { endPending = false; return renderEnding(); }
    if (S.phase === 'result') {
      E.endDay(S);
      if (S.phase === 'end') endPending = true;
      persist();
      FX.flash('rgba(5, 15, 40, .55)', 700);
      renderGame(true);
      const hp = S.night.filter(([code]) => T.NIGHT[code].stat === 'hp').reduce((a, [, d]) => a + d, 0);
      statFx({ hp });
      scrollToGameTop();
    } else if (S.phase === 'night') {
      E.startDay(S);
      persist();
      const left = E.MAX_DAY - S.day;
      FX.dayTransition(`Day ${S.day}`, S.day >= E.MAX_DAY ? 'The last day! Time for a big choice.' : `${plural(left, 'more day')} to go!`, () => {
        renderGame(true);
        scrollToGameTop();
      });
    }
  }

  /* ---------- ฉากจบ ---------- */
  function grid(hs, end) {
    return hs.map((h, i) => (i === hs.length - 1 ? T.ENDINGS[end].icon
      : h >= 60 ? '🟩' : h >= 30 ? '🟨' : h > 0 ? '🟥' : '💀')).join('');
  }

  function shareText(x) {
    const en = T.ENDINGS[x.end];
    const head = x.mode === 'daily' ? `🏝️ SOS Island · Daily #${E.islandNo(x.date)}` : '🏝️ SOS Island · Random Island';
    const status = en.dead ? `ended on Day ${x.day}/10` : 'survived all 10 days';
    const url = /^https?:/.test(location.protocol) ? '\n' + location.origin + location.pathname : '';
    return `${head}\n${en.icon} ${en.title} (${status})\n${grid(x.h, x.end)}${url}`;
  }

  function renderEnding() {
    stopCountdown();
    typing = null;
    let isNew = false;
    if (!S.rec) {
      isNew = E.recordEnd(meta, S);
      Store.saveMeta(meta);
      persist();
    }
    showScreen('end');
    setScene(S);

    const en = T.ENDINGS[S.end];
    const found = ENDING_KEYS.filter(k => meta.e[k]).length;
    let lead = '';
    if (S.night && en.dead) lead = `On night ${S.day}, you were just too weak to keep going...`;
    else if (S.res) {
      const r = S.res;
      lead = E.evById(r.e).choices[r.c].outcomes[r.o].text;
    }
    const journal = S.log.map(l => {
      const ev = E.evById(l.e), c = ev.choices[l.c];
      return `<li>Day ${l.d} · ${ev.icon} ${esc(ev.title)}<br><span>→ ${esc(c.text)}</span></li>`;
    }).join('');
    const hs = S.log.map(l => l.h);
    const again = S.mode === 'daily' ? '🎲 Try a Random Island' : '🎲 Play Again';

    $('end-card').className = 'end-card tone-' + en.tone;
    $('end-card').innerHTML =
      `<div class="end-icon">${en.icon}</div>` +
      `<span class="tone-badge">${TONE[en.tone]}</span>${isNew ? '<span class="new-badge" id="new-badge">✨ New!</span>' : ''}` +
      `<h2>${esc(en.title)}</h2>` +
      (lead ? `<p class="end-lead">${esc(lead)}</p>` : '') +
      `<p class="end-text">${esc(en.text)}</p>` +
      `<div class="end-stats">` + E.STATS.map(k => `<div><b>${S[k]}</b><span>${T.STAT_META[k].icon} ${T.STAT_META[k].name}</span></div>`).join('') + `</div>` +
      `<p class="end-grid" aria-label="Health each day">${grid(hs, S.end)}</p>` +
      `<p class="end-progress">${en.dead ? `Ended on Day ${S.day} of 10` : 'Survived all 10 days!'} · Endings found: ${found}/${ENDING_KEYS.length}</p>` +
      `<details class="journal"><summary>📔 Survival Journal</summary><ol>${journal}</ol></details>` +
      `<div class="end-actions">` +
      `<button class="next-btn end" id="btn-copy">📋 Copy my result to share</button>` +
      `<div class="row"><button class="next-btn" id="btn-again">${again}</button>` +
      `<button class="next-btn alt" id="btn-end-home">🏠 Home</button></div></div>`;

    $('btn-copy').onclick = () => copyText(shareText({ mode: S.mode, date: S.date, end: S.end, day: S.day, h: hs }));
    $('btn-again').onclick = () => startGame('free');
    $('btn-end-home').onclick = () => { Store.clearSave(); S = null; renderTitle(); };

    FX.celebrate(en.tone);
    if (isNew) setTimeout(() => FX.burstAt($('new-badge'), { emoji: ['✨', '⭐'], count: 10, g: .02, speed: 4, size: 18 }), 500);
  }

  /* ---------- กล่องข้อความ ---------- */
  function openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal').hidden = false;
    $('modal').querySelector('.modal-x').focus();
  }
  function closeModal() { $('modal').hidden = true; }

  function confirmBox(title, text, okText, onOk) {
    openModal(title, `<p>${esc(text)}</p><div class="modal-actions">` +
      `<button class="next-btn alt" data-close>Cancel</button>` +
      `<button class="next-btn end" id="btn-ok">${esc(okText)}</button></div>`);
    $('btn-ok').onclick = () => { closeModal(); onOk(); };
  }

  function showBook() {
    const found = ENDING_KEYS.filter(k => meta.e[k]).length;
    const cards = ENDING_KEYS.map(k => {
      const en = T.ENDINGS[k], n = meta.e[k] || 0;
      return n
        ? `<div class="book-item found tone-${en.tone}"><div class="bi">${en.icon}</div><b>${esc(en.title)}</b><small>${TONE[en.tone]} · ${plural(n, 'time')}</small></div>`
        : `<div class="book-item locked"><div class="bi">${en.icon}</div><b>???</b><small>💡 ${esc(en.hint)}</small></div>`;
    }).join('');
    openModal('🏆 Endings Book',
      `<p class="book-summary">You found ${found} of ${ENDING_KEYS.length} endings · Played ${plural(meta.runs, 'time')}</p>` +
      `<div class="book">${cards}</div><button class="danger-link" id="btn-reset">Reset all data</button>`);
    $('btn-reset').onclick = () => confirmBox('Reset everything?',
      "Your stats, endings, streak, and saved game will all be deleted. You can't undo this.", 'Delete All', () => {
        Store.clearAll();
        S = null;
        meta = E.newMeta();
        renderTitle();
        toast('All data has been reset');
      });
  }

  function showHelp() {
    openModal('❓ How to Play',
      '<p>Your ship sank, and now you are stuck on a lonely island! Try to survive for <b>10 days</b>. Every day, something happens and you pick what to do.</p>' +
      '<ul>' +
      '<li><b>❤️ Health</b> — if it hits 0, the game is over.</li>' +
      "<li><b>⚡ Energy</b> — you need it to do things. If you don't have enough, you lose Health instead.</li>" +
      '<li><b>🍖 Food</b> — goes down every night.</li>' +
      '<li><b>😊 Happy</b> — goes down every night because you feel lonely. A campfire or a friend helps!</li>' +
      '</ul>' +
      '<p><b>At night:</b> if you are hungry, tired, sad, or hurt, you lose Health. If everything is above 40, you get stronger!</p>' +
      '<p><b>Choice hints:</b> ▲ goes up, ▼ goes down (two arrows = a lot). 🎲 = luck. 🎁 = you get an item. 🔒 = you need something first.</p>' +
      '<p><b>Day 10:</b> Pick your ending! Signal a ship (needs a signal), sail away (needs 3 raft pieces), or stay. There are 11 endings to find, including secret ones!</p>' +
      '<p><b>🌅 Daily Island:</b> Everyone gets the same island each day. Play once a day to build your streak!</p>' +
      '<p><b>💾 Auto-save:</b> Your game saves every time you choose. Close the page and come back anytime.</p>' +
      '<div class="modal-actions"><button class="next-btn" data-close>Got it! Let\'s survive!</button></div>');
  }

  /* ---------- อื่นๆ ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function copyText(text) {
    const ok = '📋 Copied! Share it with your friends!';
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      toast(done ? ok : "Sorry, couldn't copy");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(ok), fallback);
    else fallback();
  }

  function renderFooter() {
    const mode = Store.mode();
    $('foot').textContent = mode === 'cookie'
      ? '💾 Auto-saved in your browser cookies'
      : mode === 'local'
        ? "💾 Saved in localStorage (browsers block cookies when you open the file directly — they work on a real website)"
        : '⚠️ Your browser is blocking saves — your progress will be lost if you close this page';
  }

  function renderSoundBtn() {
    const b = $('btn-sound'), m = Audio.isMuted();
    b.textContent = m ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', String(!m));
    b.title = m ? 'Sound is off — tap to turn on' : 'Sound is on — tap to turn off';
    b.hidden = !Audio.supported;
  }

  function onKey(e) {
    if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (FX.overlayActive()) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); FX.skipOverlay(); }
      return;
    }
    if ($('screen-game').hidden || !S) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button')) return;
    if (isTyping() && (e.key === 'Enter' || e.key === ' ' || /^[1-9]$/.test(e.key))) {
      e.preventDefault();
      typing.skip();
      return;
    }
    if (S.phase === 'event' && /^[1-9]$/.test(e.key)) {
      const b = document.querySelector(`.choice[data-n="${e.key}"]`);
      if (b && !b.disabled) b.click();
    } else if (e.key === 'Enter' || e.key === ' ') {
      const b = $('btn-next');
      if (b) { e.preventDefault(); b.click(); }
    }
  }

  function init() {
    $('btn-continue').onclick = () => enterGame();
    $('btn-daily').onclick = () => startGame('daily');
    $('btn-free').onclick = () => startGame('free');
    $('btn-endings').onclick = showBook;
    $('btn-help').onclick = showHelp;
    $('btn-home').onclick = () => renderTitle();
    $('btn-sound').onclick = () => { Audio.toggle(); renderSoundBtn(); };
    $('modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', onKey);
    // เสียงเริ่มได้หลังผู้เล่นแตะหน้าจอครั้งแรกเท่านั้น (กติกาของเบราว์เซอร์)
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => Audio.unlock(), { passive: true }));
    // ประกายเล็กๆ ตอนกดปุ่ม
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.btn, .next-btn, .btn-ghost');
      if (b && e.clientX) FX.burst(e.clientX, e.clientY, { count: 8, colors: SEA, speed: 4, size: 6 });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !$('screen-title').hidden) renderTitle();
    });
    renderFooter();
    renderSoundBtn();
    FX.startAmbient($('scene'));

    // ปิดเว็บตอนกำลังจะดูฉากจบ → บันทึกผลให้ แล้วเริ่มที่หน้าแรก
    if (S && S.phase === 'end') {
      if (!S.rec) { E.recordEnd(meta, S); Store.saveMeta(meta); }
      Store.clearSave();
      S = null;
    }
    renderTitle();
  }

  init();
})();
