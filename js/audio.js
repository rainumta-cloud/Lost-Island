/* =========================================================
 * audio.js — เสียงบรรยากาศ สังเคราะห์สดด้วย Web Audio (ไม่ใช้ไฟล์เสียง)
 *   calm  : คลื่นทะเลเบาๆ (กลางวัน)
 *   night : คลื่นเบาลง
 *   rain  : คลื่น + เสียงฝน
 *   storm : คลื่นแรง + ฝนหนัก + ลมหวีด + เสียงครืน + ฟ้าร้อง
 * เบราว์เซอร์ไม่ให้เล่นเสียงก่อนผู้เล่นแตะหน้าจอ → เริ่มเมื่อ unlock()
 * ========================================================= */
(function (root) {
  'use strict';
  const TBS = root.TBS = root.TBS || {};
  const AC = root.AudioContext || root.webkitAudioContext;
  const MASTER = .6;
  const MIX = {
    calm:  { sea: .55, foam: .22, rain: 0,   wind: .03, rumble: 0 },
    night: { sea: .38, foam: .12, rain: 0,   wind: .02, rumble: 0 },
    rain:  { sea: .32, foam: .1,  rain: .32, wind: .07, rumble: .05 },
    storm: { sea: .6,  foam: .3,  rain: .5,  wind: .32, rumble: .3 }
  };

  let ctx = null, master = null, layers = null, brown = null, white = null;
  let mode = 'calm';
  let muted = !!TBS.Store.loadPref().m;

  function noise(kind, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w * .5;
    }
    // ไล่ปลายบัฟเฟอร์ให้ต่อกับต้นบัฟเฟอร์เนียนๆ จะได้ไม่มีเสียงคลิกตอนวนลูป
    const fade = Math.floor(ctx.sampleRate * .25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
    return buf;
  }
  function loop(buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }
  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }
  function lfo(rate, depth, target) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }
  function layer(src, chain, swell) {
    const g = ctx.createGain();
    g.gain.value = 0;
    const amp = ctx.createGain();
    amp.gain.value = 1;
    let node = src;
    chain.forEach(f => { node.connect(f); node = f; });
    node.connect(amp).connect(g).connect(master);
    if (swell) lfo(swell[0], swell[1], amp.gain); // คลื่นซัดเข้า-ออก
    return g;
  }

  function build() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    brown = noise('brown', 6);
    white = noise('white', 4);

    const windBand = filter('bandpass', 420, 1.4);
    lfo(.05, 260, windBand.frequency);
    layers = {
      sea:    layer(loop(brown), [filter('lowpass', 520)], [.11, .55]),
      foam:   layer(loop(white), [filter('bandpass', 1100, .6), filter('lowpass', 2600)], [.08, .7]),
      rain:   layer(loop(white), [filter('highpass', 1300), filter('lowpass', 7500)], [.35, .12]),
      wind:   layer(loop(white), [windBand], [.13, .4]),
      rumble: layer(loop(brown), [filter('lowpass', 140)], [.07, .5])
    };
    applyMix(.01);
  }

  function applyMix(time) {
    if (!layers) return;
    const m = MIX[mode] || MIX.calm, now = ctx.currentTime;
    Object.keys(layers).forEach(k => layers[k].gain.setTargetAtTime(m[k], now, time));
  }

  function fadeMaster() {
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, muted ? .15 : .8);
  }

  /* เรียกเมื่อผู้เล่นแตะหน้าจอครั้งแรก */
  function unlock() {
    if (!AC || muted) return;
    try {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      fadeMaster();
    } catch (e) { /* เบราว์เซอร์ไม่รองรับ — เงียบไป */ }
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    if (ctx) applyMix(1.2);
  }

  function toggle() {
    muted = !muted;
    TBS.Store.savePref({ m: muted ? 1 : 0 });
    if (muted) {
      fadeMaster();
      setTimeout(() => { if (muted && ctx) ctx.suspend(); }, 500);
    } else {
      unlock();
    }
    return muted;
  }

  function thunder(delay) {
    if (!ctx || muted || mode !== 'storm' || ctx.state !== 'running') return;
    const t = ctx.currentTime + (delay || 0);
    // เสียงแตกเปรี้ยง
    const crack = ctx.createBufferSource(), cg = ctx.createGain(), hp = filter('highpass', 1800);
    crack.buffer = white;
    cg.gain.setValueAtTime(0, t);
    cg.gain.linearRampToValueAtTime(.5, t + .01);
    cg.gain.exponentialRampToValueAtTime(.001, t + .35);
    crack.connect(hp).connect(cg).connect(master);
    crack.start(t, Math.random() * 2, .5);
    // เสียงครืนยาว
    const boom = ctx.createBufferSource(), bg = ctx.createGain(), lp = filter('lowpass', 420);
    boom.buffer = brown;
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 2.6);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(1.1, t + .08);
    bg.gain.exponentialRampToValueAtTime(.001, t + 3);
    boom.connect(lp).connect(bg).connect(master);
    boom.start(t, Math.random() * 3, 3.2);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx || muted) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  TBS.Audio = {
    supported: !!AC,
    unlock, setMode, toggle, thunder,
    isMuted: () => muted,
    state: () => ({ ctx: ctx ? ctx.state : 'none', mode, muted })
  };
})(globalThis);
