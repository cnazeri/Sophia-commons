/* ═══════════════════════════════════════════════════════════
   Sophia Commons — Lightweight i18n Engine
   Zero dependencies. ~80 lines.
   ═══════════════════════════════════════════════════════════ */

var SC_I18N = (function () {
  var cache = {};
  var currentLang = 'en';
  var fallback = {};
  var active = {};
  var LOCALES = { en: 'en-US', de: 'de-DE', ru: 'ru-RU', es: 'es-ES' };

  function get(obj, key) {
    if (obj && obj[key] !== undefined) return obj[key];
    return key.split('.').reduce(function (o, k) { return o && o[k]; }, obj);
  }

  function t(key, def) {
    return get(active, key) || get(fallback, key) || def || key;
  }

  function localDate(date, opts) {
    // Date-only strings ('2026-09-29') are parsed as UTC midnight by JS, which shows the
    // previous day in the Americas. Anchor them at local noon instead.
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) date = date + 'T12:00:00';
    try { return new Date(date).toLocaleDateString(LOCALES[currentLang] || 'en-US', opts); }
    catch (e) { return String(date); }
  }

  function localTime(date, opts) {
    try { return new Date(date).toLocaleTimeString(LOCALES[currentLang] || 'en-US', opts); }
    catch (e) { return String(date); }
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (val !== key) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
        else el.textContent = val;
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = t(key);
      if (val !== key) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      var val = t(key);
      if (val !== key) el.setAttribute('aria-label', val);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var val = t(key);
      if (val !== key) el.innerHTML = val;
    });
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
    });
    document.documentElement.lang = currentLang;
  }

  function loadLang(code) {
    if (cache[code]) return Promise.resolve(cache[code]);
    return fetch('/lang/' + code + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { cache[code] = data; return data; })
      .catch(function () { console.warn('i18n: could not load lang/' + code + '.json'); return {}; });
  }

  function setLang(code, auto) {
    currentLang = code;
    // A language picked from the visitor's country is not saved, so only a real choice sticks
    if (!auto) { try { localStorage.setItem('sc-lang', code); } catch (e) {} }
    return loadLang(code).then(function (data) {
      active = data;
      applyTranslations();
      if (typeof rerenderForLang === 'function') rerenderForLang();
    });
  }

  var GEO_LANG = { DE: 'de' };

  function geoLang() {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve('en'); }, 1500); });
    var lookup = fetch('/api/geo', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { var code = GEO_LANG[(j && j.country) || '']; return code && LOCALES[code] ? code : 'en'; })
      .catch(function () { return 'en'; });
    return Promise.race([lookup, timeout]);
  }

  var _ready = false;

  function init() {
    return loadLang('en').then(function (data) {
      fallback = data;
      cache.en = data;
      var saved = null;
      try { saved = localStorage.getItem('sc-lang'); } catch (e) {}
      // German pages (/de/...) open in German (owner, 2026-10-29)
      if (/^\/de\//.test(location.pathname)) saved = 'de';
      if (saved) return setLang(LOCALES[saved] ? saved : 'en');
      // First visit with no language chosen: visitors in Germany get German (owner, 2026-11-17).
      // Waits at most 1.5 s for the lookup, then falls back to English.
      return geoLang().then(function (code) { return setLang(code, true); });
    }).then(function () {
      _ready = true;
      window.dispatchEvent(new Event('i18n-ready'));
    });
  }

  function getLang() { return currentLang; }
  function isReady() { return _ready; }

  return { t: t, localDate: localDate, localTime: localTime, setLang: setLang, init: init, getLang: getLang, applyTranslations: applyTranslations, get _ready() { return _ready; } };
})();

var t = SC_I18N.t;
var localDate = SC_I18N.localDate;
var localTime = SC_I18N.localTime;
