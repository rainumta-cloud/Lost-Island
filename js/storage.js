/* =========================================================
 * storage.js — บันทึกเกมลง Cookie (ไม่ใช้ Database)
 *
 *   tbs_save : เกมที่กำลังเล่นอยู่ (ปิดเว็บแล้วกลับมาเล่นต่อได้)
 *   tbs_meta : สถิติข้ามรอบ — ฉากจบที่ปลดล็อก, streak, ผลเกาะประจำวัน
 *   tbs_pref : การตั้งค่า (ปิด/เปิดเสียง)
 *
 * ค่าใน cookie เป็น JSON → base64 (เก็บเฉพาะรหัส/ตัวเลข ขนาด ~1-2KB)
 * ถ้าเบราว์เซอร์ไม่ยอมเก็บ cookie (เช่น Chrome เปิดไฟล์ตรงจาก file://)
 * จะสลับไปใช้ localStorage ให้อัตโนมัติ
 * ========================================================= */
(function (root) {
  'use strict';
  const TBS = root.TBS = root.TBS || {};

  const KEY_SAVE = 'tbs_save';
  const KEY_META = 'tbs_meta';
  const KEY_PREF = 'tbs_pref';
  const MAX_AGE = 60 * 60 * 24 * 400; // ~13 เดือน (เพดานของเบราว์เซอร์ส่วนใหญ่)
  const memory = {};

  function cookieAttrs() {
    const secure = root.location && root.location.protocol === 'https:' ? '; Secure' : '';
    return '; path=/; SameSite=Lax' + secure;
  }

  function detect() {
    try {
      document.cookie = 'tbs_test=1' + cookieAttrs();
      if (document.cookie.indexOf('tbs_test=1') !== -1) {
        document.cookie = 'tbs_test=; max-age=0' + cookieAttrs();
        return 'cookie';
      }
    } catch (e) { /* ใช้ตัวเลือกถัดไป */ }
    try {
      localStorage.setItem('tbs_test', '1');
      localStorage.removeItem('tbs_test');
      return 'local';
    } catch (e) { /* ใช้ตัวเลือกถัดไป */ }
    return 'memory';
  }
  const mode = detect();

  function getRaw(key) {
    if (mode === 'cookie') {
      const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + key + '=([^;]*)'));
      return m ? m[1] : null;
    }
    if (mode === 'local') {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    return memory[key] || null;
  }
  function setRaw(key, value) {
    if (mode === 'cookie') document.cookie = key + '=' + value + '; max-age=' + MAX_AGE + cookieAttrs();
    else if (mode === 'local') { try { localStorage.setItem(key, value); } catch (e) { /* เต็ม/ถูกบล็อก */ } }
    else memory[key] = value;
  }
  function remove(key) {
    if (mode === 'cookie') document.cookie = key + '=; max-age=0' + cookieAttrs();
    else if (mode === 'local') { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
    else delete memory[key];
  }

  const encode = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  function decode(str) {
    if (!str) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch (e) { return null; }
  }

  TBS.Store = {
    mode: () => mode,
    loadSave() {
      const s = decode(getRaw(KEY_SAVE));
      return s && TBS.Engine.isValidSave(s) ? s : null;
    },
    save(s) { setRaw(KEY_SAVE, encode(s)); },
    clearSave() { remove(KEY_SAVE); },
    loadMeta() {
      const m = decode(getRaw(KEY_META));
      return m && m.v === 1 && m.e ? m : TBS.Engine.newMeta();
    },
    saveMeta(m) { setRaw(KEY_META, encode(m)); },
    loadPref() { return decode(getRaw(KEY_PREF)) || {}; },
    savePref(p) { setRaw(KEY_PREF, encode(p)); },
    clearAll() { remove(KEY_SAVE); remove(KEY_META); }
  };
})(globalThis);
