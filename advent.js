// ══════════════════════════════════════════
//  Advent and the Holy Nights: /advent (owner, 2026-11-13)
//  Seasonal page: the four weeks, festival dates, a daily Advent calendar with a picture behind each door,
//  Advent gatherings from the calendar (with "near me" and add-to-calendar), the Holy Nights, Steiner's
//  lectures, the Calendar of the Soul and books. The menu tab and home banner appear from SHOW_FROM to
//  SHOW_UNTIL; before that the page opens only with ?advent=preview (for review).
//  Uses globals from sophia_commons_v9.js: _sb, sbReady, esc, escUrl, escJs, showDetail, showSec, calendarLinks,
//  _calEventStore, downloadEventIcs, _distKm, _fmtDist, _nearLastCall, _nlCountrySelectHtml, handleNewsletterSignup, t.
// ══════════════════════════════════════════

var ADV_YEAR = 2026;
var ADV_SHOW_FROM = new Date(2026, 10, 28);    // Nov 28, local time: tab, banner and page appear
var ADV_SHOW_UNTIL = new Date(2027, 0, 8);     // gone after Epiphany (Jan 7 is the last day shown)
var ADV_FIRST_SUNDAY = new Date(2026, 10, 29);
var ADV_IMG = '/img/advent/';
var ADV_SEAL = 'https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/holynights.jpg';
var ADV_FEST_IMG = 'https://bnrvgitzbpocratvszgk.supabase.co/storage/v1/object/public/event-images/festivals/';
var ADV_STORE = 'sc_advent_' + ADV_YEAR;
var _advEvents = null, _advNear = null, _advBuilt = false;

// Preview before the season: /advent?advent=preview (remembered on this device until the season starts)
function _advPreview() {
  try {
    if (/[?&]advent=preview\b/.test(location.search)) localStorage.setItem('sc_advent_preview', '1');
    return localStorage.getItem('sc_advent_preview') === '1';
  } catch (e) { return /[?&]advent=preview\b/.test(location.search); }
}
function adventInSeason(now) {
  now = now || new Date();
  return now >= ADV_SHOW_FROM && now < ADV_SHOW_UNTIL;
}
function adventVisible() { return adventInSeason() || _advPreview(); }

// Menu tab and home banner, on page load
function adventInit() {
  var on = adventVisible();
  var nav = document.getElementById('nav-advent');
  if (nav) nav.hidden = !on;
  var ban = document.getElementById('advent-banner');
  if (ban) ban.hidden = !on;
  if (on && ban) {
    var line = document.getElementById('advent-banner-line');
    if (line) line.textContent = _advStatus().banner;
  }
}

function _advDay(y, m, d) { return new Date(y, m, d); }
function _advToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function _advFmt(d, opts) { try { return d.toLocaleDateString('en-US', opts); } catch (e) { return d.toDateString(); } }

// The header line and banner text for today
function _advStatus() {
  var t0 = _advToday(), days = Math.round((ADV_FIRST_SUNDAY - t0) / 864e5);
  var holyStart = _advDay(ADV_YEAR, 11, 24), holyEnd = _advDay(ADV_YEAR + 1, 0, 6);
  if (days > 0) return { big: String(days), small: (days === 1 ? 'day' : 'days') + ' until the first Sunday of Advent, November 29', banner: 'Advent begins Sunday, November 29: the Advent calendar, gatherings and the Holy Nights' };
  if (t0 < holyStart) {
    var w = Math.min(4, Math.floor(-days / 7) + 1);
    return { big: ['First', 'Second', 'Third', 'Fourth'][w - 1], small: 'week of Advent', banner: ['First', 'Second', 'Third', 'Fourth'][w - 1] + ' week of Advent: open today\'s door in the Advent calendar' };
  }
  if (t0 <= holyEnd) {
    var n = Math.round((t0 - holyStart) / 864e5) + 1;
    return { big: 'Night ' + Math.min(13, n), small: 'of the thirteen Holy Nights', banner: 'The Holy Nights, December 24 to January 6' };
  }
  return { big: '', small: 'The Holy Nights, December 24 to January 6', banner: 'Advent and the Holy Nights' };
}

// ── Content ──
var ADV_WEEKS = [
  { d: _advDay(2026, 10, 29), name: 'The stones', text: 'Crystals, shells and stones on the nature table. The light first falls on what is oldest and most still.', lit: 1 },
  { d: _advDay(2026, 11, 6), name: 'The plants', text: 'Evergreen branches, moss and seeds. St. Nicholas falls on the same day this year.', lit: 2 },
  { d: _advDay(2026, 11, 13), name: 'The animals', text: 'The animals of the stable join the scene, the ox and the donkey first, on their way to the manger.', lit: 3 },
  { d: _advDay(2026, 11, 20), name: 'The human being', text: 'Mary, Joseph and the shepherds arrive. The solstice is the next day, December 21.', lit: 4 }
];
var ADV_FESTS = [
  { key: 'advent', title: 'First Advent', start: _advDay(2026, 10, 29), img: ADV_FEST_IMG + 'advent.jpg' },
  { key: 'nicholas', title: 'St. Nicholas', start: _advDay(2026, 11, 6), img: ADV_FEST_IMG + 'nicholas.jpg' },
  { key: 'christmas', title: 'Christmas', start: _advDay(2026, 11, 25), img: ADV_FEST_IMG + 'christmas.jpg' },
  { key: 'holynights', title: 'The Holy Nights', start: _advDay(2026, 11, 24), end: _advDay(2027, 0, 6), img: '' },
  { key: 'epiphany', title: 'Epiphany', start: _advDay(2027, 0, 6), img: ADV_FEST_IMG + 'epiphany.jpg' }
];
var ADV_DOORS = {   // [text, picture title, credit, Wikimedia Commons page]
  1: ['Go for a walk and bring home one smooth stone for the nature table.', "Smooth pebbles on the beach", "Annatsach, CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Smooth_pebbles_on_the_beach.jpg"],
  2: ['Light a candle at supper and let the first light rest on the stones.', "Candlelight through a glass orb", "W.carter, CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Candle_light_projected_through_a_glass_orb.jpg"],
  3: ['Look closely at a crystal, a shell or a pebble. What shape did time give it?', "Amethyst quartz", "Derek Ramsey (Ram-Man), CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Quartz_var_Amethyst_Specimen_22.JPG"],
  4: ['St. Barbara\'s day: cut a cherry or forsythia branch and put it in water. With luck it flowers by Christmas.', "Flowering cherry branch", "Vincent Ignace, CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Prunus_japonica_flower_clusters_-_4.jpg"],
  5: ['Tonight, put your shoes by the door for St. Nicholas.', "Setting out a shoe for Sinterklaas, Netherlands", "Wim van Rossem for Anefo, CC0", "https://commons.wikimedia.org/wiki/File:Sinterklaas_schoentje_zetten_bij_kachel,_Bestanddeelnr_910-8552.jpg"],
  6: ['St. Nicholas morning. Add evergreen branches to the nature table as the plants begin.', "Saint Nicholas, Agia Triada Monastery", "RL0919, public domain", "https://commons.wikimedia.org/wiki/File:Saint_Nicholas_painting_at_Agia_Triada_Monastery.png"],
  7: ['Plant a few wheat seeds in a dish of soil, to be green by Christmas.', "Wheatgrass", "Mokkie, CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Wheatgrass_(Triticum_aestivum).jpg"],
  8: ['Bring in moss, bark or pine cones from a walk.', "Moss and ferns on the forest floor", "Krishna k. sahh, CC0", "https://commons.wikimedia.org/wiki/File:Moss-covered_boulder_and_ferns_on_a_forest_floor.png"],
  9: ['Make a simple orange-and-clove pomander and hang it by a window.', "Orange and clove pomander", "Densvenskabjörnen4, CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Pomander.jpg"],
  10: ['Bake something with seeds: bread, crackers or cookies.', "A loaf of bread", "fireskystudios.com asthetik, CC0", "https://commons.wikimedia.org/wiki/File:Loaf_of_Bread_(Unsplash_tm3Diid694Y).jpg"],
  11: ['Read a story about a tree, aloud, by candlelight.', "Winter forest", "Valery Kraynov, CC BY 3.0", "https://commons.wikimedia.org/wiki/File:Winter_Forest_(129068527).jpeg"],
  12: ['Thank the plants: water the houseplants and dust their leaves.', "A houseplant leaf", "Arghamallick5151, CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Manik_Plant_Photography.jpg"],
  13: ['Light the rose candle. The animals begin their journey to the stable.', "Advent wreath with the rose candle", "Jonathunder, CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:AdventCandles.jpg"],
  14: ['Put out seeds or suet for the birds and watch who comes.', "Robin in the snow", "David Perez, CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Erithacus_rubecula_01_by-dpc.jpg"],
  15: ['Model a small animal from beeswax for the nature table.', "Rolled wax candle", "Paolo Neo, public domain", "https://commons.wikimedia.org/wiki/File:Wax_candle_detail.jpg"],
  16: ['Learn the names of three animals that stay awake through winter.', "Red fox in the snow", "MIKI Yoshihito, CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Ezo_Red_Fox._-_51830477775.jpg"],
  17: ['Read the Christmas story of the ox and the donkey.', "Annunciation and Nativity, Rhenish master, about 1330", "Rhenish Master ca. 1330, public domain", "https://commons.wikimedia.org/wiki/File:Annunciation_and_Nativity_(SM_sg358).png"],
  18: ['Sing a carol about the animals of the stable.', "Carol singers, window display", "Editor5807, CC BY 3.0", "https://commons.wikimedia.org/wiki/File:Brading_Experience_Carol_Singers_window_display.JPG"],
  19: ['Walk at dusk and listen for the animals of the evening.', "Tawny owl", "Andreas Trepte, CC BY-SA 2.5", "https://commons.wikimedia.org/wiki/File:Waldkauz-Strix_aluco.jpg"],
  20: ['Light the fourth candle. Mary and Joseph set out on the road.', "Fritz von Uhde, A Difficult Path (1890)", "Fritz von Uhde, public domain", "https://commons.wikimedia.org/wiki/File:Fritz_von_Uhde_-_Ein_schwerer_Gang_(1890).jpg"],
  21: ['The solstice: the longest night in the north, the longest day in the south. Sit together quietly for a minute, then light every candle.', "Winter sunset through a window", "NPS photo, public domain", "https://commons.wikimedia.org/wiki/File:Sunset_through_window_panes_(567655e8-d14a-428d-87ee-02a3ff30f843).JPG"],
  22: ['Write a card to someone who has been alone this year.', "Victorian Christmas card with primroses", "Hildesheimer & Faulkner, public domain", "https://commons.wikimedia.org/wiki/File:Victorian_Primroses_Christmas_card.jpg"],
  23: ['Set the shepherds on the nature table, watching over their sheep.', "Joachim Wtewael, The Annunciation to the Shepherds", "Joachim Wtewael, public domain", "https://commons.wikimedia.org/wiki/File:Joachim_Wtewael_-_Annunciation_to_the_Shepherds_-_Google_Art_Project.jpg"],
  24: ['Christmas Eve. The Holy Nights begin tonight.', "A tealight glowing", "PattayaPatrol, CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:DFC_6183_A_single_tealight_glows_warmly_inside_a_glass_holder_surrounded_by_scattered_pink_and_purple_bougainvillea_petals.jpg"]
};
var ADV_COTS = {
  35: ['Nov 24 to Nov 30', ['Can I know being', 'So that it finds itself again', 'In the soul\'s urge to create?', 'I feel that I have been given the power', 'To live my own self, humbly, as a member,', 'Into the self of the world.']],
  36: ['Dec 1 to Dec 7', ['In the depths of my being,', 'Pressing toward revelation,', 'The world\'s word speaks in mystery:', 'Fill the aims of your work', 'With my spirit light,', 'To offer yourself through me.']],
  37: ['Dec 8 to Dec 14', ['To carry spirit light into the world\'s winter night', 'The impulse of my heart strives blissfully,', 'So that shining seeds of soul', 'Take root in the ground of the world,', 'And the word of God, in the darkness of the senses,', 'Sounds through all being, transfiguring it.']],
  38: ['Dec 15 to Dec 21', ['As if released from a spell, I feel', 'The spirit child in the womb of the soul;', 'In the brightness of the heart', 'The holy word of the world has begotten', 'The heavenly fruit of hope,', 'That grows in jubilation toward the far reaches of the world', 'From the divine ground of my being.']],
  39: ['Dec 22 to Dec 28', ['Given over to the revealing of the spirit,', 'I gain the light of the world\'s being.', 'The power of thought grows,', 'Clearing, to give me to myself,', 'And, awakening, the feeling of self', 'Comes free for me from the thinker\'s power.']],
  40: ['Dec 29 to Jan 4', ['And when I am in the depths of spirit,', 'Then in the grounds of my soul,', 'Out of the heart\'s worlds of love,', 'The empty illusion of separateness', 'Is filled with the fiery power of the world\'s word.']]
};
var ADV_COTS_START = { 35: [10, 24], 36: [11, 1], 37: [11, 8], 38: [11, 15], 39: [11, 22], 40: [11, 29] };
var ADV_LECTURES = [
  { key: true, meta: 'Start here &middot; Hanover, December 26, 1911', url: 'https://rsarchive.org/Lectures/Christmas/19111226p01.html', title: 'The Birth of the Sun Spirit as the Spirit of the Earth', text: 'Steiner\'s lecture on the Thirteen Holy Nights around the winter solstice.' },
  { meta: 'Berlin, December 21, 1911', url: 'https://rsarchive.org/Lectures/Festivals/19111221f01.html', title: 'Christmas: A Festival of Inspiration', text: 'The Holy Nights as a bridge from Christmas to the Feast of the Three Kings on January 6.' },
  { meta: 'December 17, 1906', url: 'https://rsarchive.org/Lectures/Christmas/19061217p01.html', title: 'Signs and Symbols of the Christmas Festival', text: 'The midnight hour of the Holy Night in the ancient Mysteries.' },
  { meta: 'December 27, 1910', url: 'https://rsarchive.org/Lectures/19101227a01.html', title: 'Yuletide and the Christmas Festival', text: 'The old Yule season and the Christmas festival.' },
  { meta: 'December 27, 1914', url: 'https://rsarchive.org/Lectures/Christmas/19141227a01.html', title: 'The Birth of Christ Within Us', text: 'Keeping the Holy Night as an inner event.' },
  { meta: 'December 23, 1920', url: 'https://rsarchive.org/Lectures/GA202/English/MP1983/19201223p01.html', title: 'A Christmas Lecture: The Search for the New Isis', text: 'The shepherds\' piety and the Magi\'s star wisdom.' },
  { more: true, meta: 'More', url: 'https://rsarchive.org/Lectures/Christmas/ChrMas_index.html', title: 'All of Steiner\'s Christmas lectures', text: 'The full collection of his Christmas lectures in the Rudolf Steiner Archive.' }
];
var ADV_BOOKS = [
  ['1855840456', 'The Festivals and Their Meaning', 'Rudolf Steiner &middot; Rudolf Steiner Press', 'Steiner\'s lectures on the festivals of the year, Christmas among them, gathered in one volume.'],
  ['1869890477', 'All Year Round', 'Ann Druitt, Christine Fynes-Clinton, Marije Rowling &middot; Hawthorn Press', 'A family handbook of festivals through the year, with crafts, songs and recipes.'],
  ['095070623X', 'Festivals, Family and Food', 'Diana Carey, Judy Large &middot; Hawthorn Press', 'Ideas for celebrating the festivals at home, from Advent to Midsummer.']
];
// Titles that belong on the Advent page (events between Nov 20 and Jan 7)
var ADV_EVENT_RE = /advent|nicholas|nikolaus|sinterklaas|christmas|xmas|weihnacht|holy night|heilige n|twelve nights|thirteen|epiphany|three kings|dreik[oö]nig|solstice|yule|winter (tree|festival|garden|spiral)|spiral|nativity|shepherd|oberufer|carol|lucia|krippe|crib/i;

// ── Page ──
function renderAdvent() {
  var root = document.getElementById('advent-root');
  if (!root) return;
  if (!adventVisible()) {
    root.innerHTML = '<div class="adv-soon"><h2>Advent and the Holy Nights</h2><p>This page opens on November 28, the day before the first Sunday of Advent.</p>'
      + '<p><a href="/events" onclick="showSec(\'events\');return false;">See upcoming events</a></p></div>';
    return;
  }
  if (!_advBuilt) { root.innerHTML = _advHtml(); _advBuilt = true; _advWire(); }
  _advHeader();
  _advDoorsRender(_advToday());
  _advLoadEvents();
}

function _advHtml() {
  var weeks = ADV_WEEKS.map(function (w, i) {
    var c = '';
    for (var k = 1; k <= 4; k++) c += '<i class="adv-candle' + (k <= w.lit ? ' lit' : '') + (k === 3 && k <= w.lit ? ' rose' : '') + '"></i>';
    return '<div class="adv-week" data-i="' + i + '"><div class="adv-candles" aria-hidden="true">' + c + '</div><div class="adv-when">'
      + esc(_advFmt(w.d, { weekday: 'long', month: 'short', day: 'numeric' })) + '</div><h3>' + esc(w.name) + '</h3><p>' + esc(w.text) + '</p></div>';
  }).join('');
  var fests = ADV_FESTS.map(function (f) {
    var when = f.end ? _advFmt(f.start, { month: 'short', day: 'numeric' }) + ' to ' + _advFmt(f.end, { month: 'short', day: 'numeric' })
      : _advFmt(f.start, { weekday: 'long', month: 'short', day: 'numeric' });
    var pic = f.img ? '<img src="' + escUrl(f.img) + '" alt="" loading="lazy">' : '<div class="adv-nightsky" aria-hidden="true"><span class="moon"></span><span class="num">13</span></div>';
    return '<div class="adv-fest">' + pic + '<div class="t"><b>' + esc(f.title) + '</b><span>' + esc(when) + '</span>' + _advCalMenu('fest:' + f.key) + '</div></div>';
  }).join('');
  var doors = '';
  for (var d = 1; d <= 24; d++) doors += '<button type="button" class="adv-door ' + (d <= 5 ? 'w1' : d <= 12 ? 'w2' : d <= 19 ? 'w3' : 'w4') + '" data-d="' + d + '" aria-label="December ' + d + '">' + d + '</button>';
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var pairs = ['Dec 24 to 25', 'Dec 25 to 26', 'Dec 26 to 27', 'Dec 27 to 28', 'Dec 28 to 29', 'Dec 29 to 30', 'Dec 30 to 31', 'Dec 31 to 1', 'Jan 1 to 2', 'Jan 2 to 3', 'Jan 3 to 4', 'Jan 4 to 5'];
  var nights = pairs.map(function (p, i) { return '<div><b>' + p + '</b>' + months[i] + '</div>'; }).join('')
    + '<div class="thirteen"><b>Jan 5 to 6, the thirteenth night</b>The year as a whole, on the eve of Epiphany</div>';
  var lectures = ADV_LECTURES.map(function (l) {
    return '<li class="' + (l.key ? 'key' : l.more ? 'all' : '') + '"><div class="meta">' + l.meta + '</div><a href="' + escUrl(l.url) + '" target="_blank" rel="noopener">' + esc(l.title) + '</a><p>' + esc(l.text) + '</p></li>';
  }).join('');
  var cotsList = Object.keys(ADV_COTS).map(function (w) { return '<li><button type="button" data-w="' + w + '"><b>Week ' + w + '</b> <span>' + esc(ADV_COTS[w][0]) + '</span></button></li>'; }).join('');
  var books = ADV_BOOKS.map(function (b) {
    var u = 'https://www.amazon.com/dp/' + b[0] + '/?tag=sophiacom-20';
    return '<div class="adv-book"><a class="btitle" href="' + u + '" target="_blank" rel="sponsored noopener">' + esc(b[1]) + '</a><div class="by">' + b[2] + '</div><p>' + esc(b[3]) + '</p>'
      + '<a class="buy" href="' + u + '" target="_blank" rel="sponsored noopener">View on Amazon</a></div>';
  }).join('');
  var feed = 'webcal://sophiacommons.org/advent.ics';
  return ''
    + '<div class="adv-hero"><div class="in"><div>'
    + '<h2 class="adv-h1">Advent and the<br>Holy Nights</h2>'
    + '<p class="lead">Four weeks of waiting for the light, then the Holy Nights between Christmas and Epiphany. Gatherings near you, the festival dates, and ways to keep the season at home.</p>'
    + '<div class="adv-count"><b id="adv-count-big"></b> <span id="adv-count-small"></span></div>'
    + '<div class="adv-jump"><a href="#adv-weeks">The four weeks</a><a href="#adv-dates">Festival dates</a><a href="#adv-calendar">Advent calendar</a><a href="#adv-gatherings">Gatherings near you</a><a href="#adv-holy">The Holy Nights</a><a href="#adv-lectures">Steiner lectures</a><a href="#adv-cots">Calendar of the Soul</a><a href="#adv-books">Reading</a></div>'
    + '</div><figure class="adv-seal"><img src="' + ADV_SEAL + '" alt="Rudolf Steiner\'s fifth apocalyptic seal: a woman clothed with the sun, a child of light at her heart and the moon at her feet">'
    + '<figcaption>The woman clothed with the sun. Apocalyptic seal designed by Rudolf Steiner (1907), painted by Clara Rettich. Public domain.</figcaption></figure></div></div>'

    + '<section id="adv-weeks" class="adv-sec"><h2>The four weeks of Advent</h2><p class="sub">Many Waldorf families and schools light one more candle each Sunday, and let each week turn toward one part of the world: first the stones, then the plants, then the animals, and last of all the human being.</p><div class="adv-weeks">' + weeks + '</div></section>'

    + '<section id="adv-dates" class="adv-sec"><h2>Festival dates</h2><p class="sub">The season from the first candle to the three kings.</p><div class="adv-fests">' + fests + '</div></section>'

    + '<section id="adv-calendar" class="adv-sec"><h2>The Advent calendar</h2><p class="sub">One small door for each day of December, with something to do or think about, following the week\'s theme. Each door opens on its own day, and earlier days stay open.</p>'
    + '<div class="adv-doors">' + doors + '</div>'
    + '<div class="adv-doorbox" aria-live="polite"><div class="dimg" id="adv-dimg" hidden><img id="adv-dimg-i" alt=""><a id="adv-dimg-c" target="_blank" rel="noopener"></a></div><div><small id="adv-dday"></small><span id="adv-dtxt"></span></div></div>'
    + '<div class="adv-legend"><span><i style="background:#8C8273"></i>Stones</span><span><i style="background:var(--sage)"></i>Plants</span><span><i style="background:#C98BA7"></i>Animals</span><span><i style="background:#6A4C93"></i>People</span></div></section>'

    + '<section id="adv-gatherings" class="adv-sec"><h2>Gatherings near you</h2><p class="sub">Advent spirals, Advent gardens, St. Nicholas, Christmas plays and Holy Nights study groups from the Sophia Commons calendar.</p>'
    + '<div class="dir-near adv-near" role="search"><label for="adv-near" class="sr-only">Town or postcode</label><input type="text" id="adv-near" autocomplete="postal-code" placeholder="Town or postcode" onkeydown="if(event.key===\'Enter\'){_advNearSearch(this.value);}">'
    + '<button type="button" class="dir-near-btn" onclick="_advNearSearch(document.getElementById(\'adv-near\').value)">Events near me</button><button type="button" class="dir-near-btn dir-near-geo" onclick="_advNearGeo()">Use my location</button></div>'
    + '<div id="adv-near-status" class="dir-near-status" role="status"></div>'
    + '<p class="adv-addyours">Hosting an Advent spiral, St. Nicholas visit or Christmas play? <a href="/events/new" onclick="showEventForm();return false;">Add it to the calendar</a>. Upload your flyer and the form fills itself in.</p>'
    + '<div class="adv-events" id="adv-events"><p class="adv-loading">Loading gatherings...</p></div>'
    + '<div class="adv-subcal"><b>Subscribe to the season<span>The festival dates and every Advent and Christmas gathering, in your own calendar. New events appear on their own.</span></b>'
    + '<a class="main" href="' + feed + '">Apple or Outlook</a><a href="https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(feed) + '" target="_blank" rel="noopener">Google Calendar</a><a href="/advent.ics">.ics file</a></div></section>'

    + '<section id="adv-holy" class="adv-sec"><div class="adv-holy"><div><h2>The Holy Nights</h2>'
    + '<p>The nights from Christmas to Epiphany, twelve or thirteen depending on how you count, have long been treated as a time apart: the old year has ended and the new one hasn\'t quite begun. Rudolf Steiner spoke of them as nights when the soul is especially open, and many people keep them as a quiet retreat at home.</p>'
    + '<p>A common practice links each night to one month of the coming year. What you notice that night, in dreams, moods or small events, becomes a seed for that month.</p>'
    + '<p><a href="#adv-lectures">Rudolf Steiner\'s lectures on the Holy Nights</a></p></div>'
    + '<div><p class="adv-holy-h">Simple ways to keep the nights</p><ol><li>Light a candle at the same hour each evening.</li><li>Keep a notebook by the bed and write down dreams on waking.</li><li>Read one short verse or passage each night.</li><li>Let each night stand for one month of the year ahead, as in the chart below.</li></ol>'
    + '<div class="adv-nights">' + nights + '</div></div></div></section>'

    + '<section id="adv-lectures" class="adv-sec"><h2>Rudolf Steiner on the Holy Nights</h2><p class="sub">Lectures to read during the season, free in the Rudolf Steiner Archive.</p><ul class="adv-lectures">' + lectures + '</ul></section>'

    + '<section id="adv-cots" class="adv-sec"><h2>Calendar of the Soul</h2><p class="sub">Rudolf Steiner\'s verse for each week of the year. These are the verses for Advent and the Holy Nights.</p>'
    + '<div class="adv-cots"><div class="adv-verse" aria-live="polite"><div class="lbl" id="adv-v-lbl"></div><div id="adv-v-text"></div><div class="src">Rudolf Steiner, Calendar of the Soul (1912). English rendering: Sophia Commons.</div></div>'
    + '<ul class="adv-weeklist">' + cotsList + '</ul></div></section>'

    + '<section id="adv-books" class="adv-sec"><h2>Reading for the season</h2><p class="sub">A few books on the festivals, for families, teachers and study groups. Buying through these links supports Sophia Commons at no extra cost to you.</p><div class="adv-books">' + books + '</div></section>'

    + '<div class="adv-signup"><div><h3>Advent events near you, every week</h3><p>The Sophia Commons newsletter: new events, Advent spirals and festival gatherings in your region, once a week. Free, and you can unsubscribe anytime.</p></div>'
    + '<div><div class="nl-card-row"><label for="adv-nl-email" class="sr-only">Your email address</label><input type="email" id="adv-nl-email" autocomplete="email" aria-describedby="adv-nl-email-err" placeholder="your@email.com">'
    + (typeof _nlCountrySelectHtml === 'function' ? _nlCountrySelectHtml('adv-nl-country') : '')
    + '<button type="button" id="adv-nl-btn" onclick="handleNewsletterSignup(\'adv-nl-email\', \'#adv-nl-btn\', \'adv-nl-ok\', \'home\')">Subscribe</button></div>'
    + '<div id="adv-nl-email-err" class="rb-nl-err" role="alert" style="display:none;"></div><div id="adv-nl-ok" class="rb-nl-ok" role="status">Almost done: check your inbox and click the link to confirm.</div></div></div>'
    + '<p class="adv-credits">Advent calendar pictures: public domain or openly licensed, from Wikimedia Commons; each is credited when its door opens.</p>';
}

function _advHeader() {
  var s = _advStatus();
  var b = document.getElementById('adv-count-big'), m = document.getElementById('adv-count-small');
  if (b) b.textContent = s.big;
  if (m) m.textContent = s.small;
  // Current week of Advent
  var t0 = _advToday();
  document.querySelectorAll('.adv-week').forEach(function (el, i) {
    var start = ADV_WEEKS[i].d, end = i < 3 ? ADV_WEEKS[i + 1].d : _advDay(2026, 11, 25);
    el.classList.toggle('now', t0 >= start && t0 < end);
  });
}

function _advWire() {
  document.querySelectorAll('.adv-door').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = +b.getAttribute('data-d'), seen = _advSeen();
      seen[d] = 1; _advSaveSeen(seen); _advFace(b, d); _advShowDoor(d);
    });
  });
  document.querySelectorAll('.adv-weeklist button').forEach(function (btn) {
    btn.addEventListener('click', function () { _advShowVerse(btn.getAttribute('data-w')); });
  });
  var t0 = _advToday(), cur = 35;
  Object.keys(ADV_COTS_START).forEach(function (w) { var s = ADV_COTS_START[w]; if (t0 >= _advDay(2026, s[0], s[1])) cur = +w; });
  _advShowVerse(cur);
  // Jump links scroll inside the page without changing the address
  document.querySelectorAll('.adv-jump a, #adv-holy a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var el = document.querySelector(a.getAttribute('href'));
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
}

// ── Advent calendar doors: shut before their day, today's waits for a click, earlier days open by themselves.
//    Opened doors are remembered in this browser. ──
function _advSeen() { try { return JSON.parse(localStorage.getItem(ADV_STORE) || '{}'); } catch (e) { return {}; } }
function _advSaveSeen(s) { try { localStorage.setItem(ADV_STORE, JSON.stringify(s)); } catch (e) { /* private mode: not kept */ } }
function _advFace(b, d) {
  b.classList.add('opened');
  b.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)), url(' + ADV_IMG + 'd' + d + '.jpg)';
}
function _advShowDoor(d) {
  var info = ADV_DOORS[d];
  document.getElementById('adv-dday').textContent = 'December ' + d;
  document.getElementById('adv-dtxt').textContent = info[0];
  var wrap = document.getElementById('adv-dimg'), img = document.getElementById('adv-dimg-i'), c = document.getElementById('adv-dimg-c');
  wrap.hidden = false; img.src = ADV_IMG + 'd' + d + '.jpg'; img.alt = info[1];
  c.textContent = 'Picture: ' + info[1] + '. ' + info[2] + '. Wikimedia Commons.';
  c.href = info[3];
}
function _advDoorsRender(t0) {
  var seen = _advSeen(), latest = 0;
  document.querySelectorAll('.adv-door').forEach(function (b) {
    var d = +b.getAttribute('data-d'), day = _advDay(ADV_YEAR, 11, d);
    b.classList.remove('opened', 'today'); b.style.backgroundImage = ''; b.disabled = false; b.title = '';
    if (day > t0) { b.disabled = true; b.title = 'Opens December ' + d; return; }
    if (+day === +t0) { b.classList.add('today'); if (seen[d]) { _advFace(b, d); latest = d; } return; }
    _advFace(b, d); latest = Math.max(latest, d);
  });
  if (latest) { _advShowDoor(latest); return; }
  document.getElementById('adv-dimg').hidden = true;
  document.getElementById('adv-dday').textContent = 'December 1';
  document.getElementById('adv-dtxt').textContent = t0 < _advDay(ADV_YEAR, 11, 1) ? 'Doors open from December 1. Come back each day.' : 'Open today\'s door.';
}

function _advShowVerse(w) {
  var v = ADV_COTS[w]; if (!v) return;
  document.getElementById('adv-v-lbl').textContent = 'Week ' + w + ' · ' + v[0];
  var box = document.getElementById('adv-v-text'); box.textContent = '';
  v[1].forEach(function (line, i) { if (i) box.appendChild(document.createElement('br')); box.appendChild(document.createTextNode(line)); });
  document.querySelectorAll('.adv-weeklist li').forEach(function (li) { li.classList.toggle('on', li.firstChild.getAttribute('data-w') == w); });
}

// ── Add to calendar: a small menu for festivals and events ──
var _advFestStore = {};
function _advCalMenu(key) {
  return '<details class="adv-cal"><summary>+ Add to calendar</summary><div class="adv-cal-menu" data-key="' + esc(key) + '"></div></details>';
}
function _advFestEvent(f) {
  // All-day events are stored at 12:00 UTC (as the site does), so the UTC date is the festival's own date
  var s = new Date(Date.UTC(f.start.getFullYear(), f.start.getMonth(), f.start.getDate(), 12));
  var e = f.end ? new Date(Date.UTC(f.end.getFullYear(), f.end.getMonth(), f.end.getDate(), 12)) : s;
  return { id: 'advent-' + f.key + '-' + ADV_YEAR, title: f.title, start_date: s.toISOString(), end_date: e.toISOString(), is_all_day: true,
    description: f.title + ' on the Sophia Commons Advent page: https://sophiacommons.org/advent' };
}
function _advFillCalMenu(details) {
  var box = details.querySelector('.adv-cal-menu'); if (!box || box.childNodes.length) return;
  var key = box.getAttribute('data-key'), ev = null;
  if (key.indexOf('fest:') === 0) {
    var f = ADV_FESTS.filter(function (x) { return 'fest:' + x.key === key; })[0];
    if (f) { ev = _advFestEvent(f); _advFestStore[ev.id] = ev; }
  } else if (typeof _calEventStore !== 'undefined') ev = _calEventStore[key.replace(/^ev:/, '')];
  if (!ev || typeof calendarLinks !== 'function') return;
  var L = calendarLinks(ev);
  box.innerHTML = '<a href="' + escUrl(L.google) + '" target="_blank" rel="noopener">Google</a><a href="' + escUrl(L.outlook) + '" target="_blank" rel="noopener">Outlook.com</a>'
    + '<a href="' + escUrl(L.office) + '" target="_blank" rel="noopener">Microsoft 365</a><a href="#" onclick="_advIcs(\'' + escJs(key) + '\');return false;">Apple / other (.ics)</a>';
}
function _advIcs(key) {
  if (key.indexOf('ev:') === 0) { downloadEventIcs(key.slice(3)); return; }
  var f = ADV_FESTS.filter(function (x) { return 'fest:' + x.key === key; })[0]; if (!f) return;
  var ev = _advFestEvent(f), d = function (iso, plus) { var x = new Date(new Date(iso).getTime() + (plus ? 864e5 : 0)); return x.toISOString().slice(0, 10).replace(/-/g, ''); };
  var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sophia Commons//Advent//EN', 'BEGIN:VEVENT', 'UID:' + ev.id + '@sophiacommons.org',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), 'DTSTART;VALUE=DATE:' + d(ev.start_date), 'DTEND;VALUE=DATE:' + d(ev.end_date, true),
    'SUMMARY:' + ev.title, 'DESCRIPTION:' + ev.description, 'URL:https://sophiacommons.org/advent', 'END:VEVENT', 'END:VCALENDAR'];
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }));
  a.download = f.title.replace(/[^\w ]+/g, '').replace(/\s+/g, '-') + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
}
document.addEventListener('toggle', function (e) { if (e.target && e.target.classList && e.target.classList.contains('adv-cal') && e.target.open) _advFillCalMenu(e.target); }, true);

// ── Gatherings: Advent and Christmas events from the calendar ──
async function _advLoadEvents() {
  var box = document.getElementById('adv-events'); if (!box) return;
  if (_advEvents) { _advDrawEvents(); return; }
  if (typeof sbReady !== 'function' || !sbReady()) { box.innerHTML = '<p class="adv-loading">Gatherings could not be loaded right now. <a href="/events" onclick="showSec(\'events\');return false;">See the full calendar</a>.</p>'; return; }
  try {
    var r = await _sb.rpc('get_upcoming_events', { days_ahead: 90, limit_n: 100 });
    var until = new Date(ADV_YEAR + 1, 0, 8);
    _advEvents = (r.data || []).filter(function (e) {
      return new Date(e.start_date) < until && ADV_EVENT_RE.test(e.title || '') ;
    }).sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });
    _advEvents.forEach(function (e) { if (typeof _calEventStore !== 'undefined') _calEventStore[e.id] = e; });
  } catch (err) { _advEvents = []; }
  _advDrawEvents();
}
function _advDrawEvents() {
  var box = document.getElementById('adv-events'); if (!box) return;
  var list = (_advEvents || []).slice(), near = _advNear;
  if (near) {
    list = list.filter(function (e) {
      if (e.is_online) return true;
      if (typeof e.lat !== 'number' || typeof e.lng !== 'number') return false;
      e._km = _distKm(near.lat, near.lng, e.lat, e.lng); return e._km <= 300;
    });
  }
  if (!list.length) {
    box.innerHTML = '<p class="adv-loading">' + (near ? 'No Advent gatherings listed within 300 km yet.' : 'No Advent gatherings listed yet.')
      + ' Schools and groups add theirs through December. <a href="/events" onclick="showSec(\'events\');return false;">See the full calendar</a>.</p>';
    return;
  }
  box.innerHTML = list.map(function (e) {
    var d = new Date(e.start_date);
    var where = e.is_online ? 'Online' : (e.location_name && !e.city ? e.location_name : [e.city, e.country].filter(Boolean).join(', '));
    return '<div class="adv-ev"><div class="d"><span>' + esc(_advFmt(d, { month: 'short' }).toUpperCase()) + '</span><b>' + d.getDate() + '</b></div><div>'
      + '<a href="/event/' + esc(e.id) + '" onclick="showDetail(\'event\',\'' + escJs(e.id) + '\');return false;">' + esc(e.title) + '</a>'
      + '<div class="w">' + esc(where) + (near && !e.is_online && e._km != null ? ' &middot; ' + esc(_fmtDist(e._km)) : '') + '</div>'
      + _advCalMenu('ev:' + e.id) + '</div></div>';
  }).join('');
}
function _advNearSet(lat, lng, label) {
  _advNear = { lat: lat, lng: lng, label: label };
  var st = document.getElementById('adv-near-status');
  if (st) st.innerHTML = esc('Advent gatherings within ' + _fmtDist(300) + ' of ' + label + ', plus online ones.') + ' <button type="button" class="dir-near-clear" onclick="_advNearClear()">Clear</button>';
  _advDrawEvents();
}
function _advNearClear() {
  _advNear = null;
  var st = document.getElementById('adv-near-status'); if (st) st.textContent = '';
  var i = document.getElementById('adv-near'); if (i) i.value = '';
  _advDrawEvents();
}
async function _advNearSearch(place) {
  place = String(place || '').trim();
  var st = document.getElementById('adv-near-status');
  if (!place) { if (st) st.textContent = 'Type a town or postcode first.'; return; }
  if (Date.now() - _nearLastCall < 1100) return;   // OpenStreetMap asks for at most 1 lookup per second
  _nearLastCall = Date.now();
  if (st) st.textContent = 'Looking up ' + place + '...';
  try {
    var r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(place));
    var j = await r.json();
    if (!j || !j.length) { if (st) st.textContent = 'Could not find "' + place + '". Try a town name or a postcode with the country.'; return; }
    _advNearSet(parseFloat(j[0].lat), parseFloat(j[0].lon), j[0].display_name.split(',').slice(0, 2).join(','));
  } catch (e) { if (st) st.textContent = 'The place lookup is not available right now. Please try again.'; }
}
function _advNearGeo() {
  var st = document.getElementById('adv-near-status');
  if (!navigator.geolocation) { if (st) st.textContent = 'Your browser cannot share its location. Type a town instead.'; return; }
  if (st) st.textContent = 'Asking your browser for your location...';
  navigator.geolocation.getCurrentPosition(function (pos) { _advNearSet(pos.coords.latitude, pos.coords.longitude, 'your location'); },
    function () { if (st) st.textContent = 'Location was not shared. Type a town or postcode instead.'; }, { timeout: 10000, maximumAge: 600000 });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', adventInit); else adventInit();
