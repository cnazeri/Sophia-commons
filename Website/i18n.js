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
    return fetch('lang/' + code + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { cache[code] = data; return data; })
      .catch(function () { console.warn('i18n: could not load lang/' + code + '.json'); return {}; });
  }

  function setLang(code) {
    currentLang = code;
    localStorage.setItem('sc-lang', code);
    return loadLang(code).then(function (data) {
      active = data;
      applyTranslations();
      if (typeof rerenderForLang === 'function') rerenderForLang();
    });
  }

  function init() {
    return loadLang('en').then(function (data) {
      fallback = data;
      cache.en = data;
      var saved = localStorage.getItem('sc-lang') || 'en';
      return setLang(saved);
    });
  }

  function getLang() { return currentLang; }

  return { t: t, localDate: localDate, localTime: localTime, setLang: setLang, init: init, getLang: getLang, applyTranslations: applyTranslations };
})();

var t = SC_I18N.t;
var localDate = SC_I18N.localDate;
var localTime = SC_I18N.localTime;
