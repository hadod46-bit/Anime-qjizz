/* ==========================================================
   Anime Quiz Champion — game logic
   ----------------------------------------------------------
   Architecture: the HOST device runs the game (rounds, timers,
   question bank) and describes what to show in G.view. Every
   device (host included) draws G.view with render(). In online
   mode the host sends G.view to the guests, and guests send
   their actions (buzz, answer…) back to the host.
   In "same screen" mode there is just one device, the host.
   ========================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEYS = ['a', 'p', 'v', 'm'];
const COLORS = ['#ff4d6d', '#4dabff', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#22d3ee', '#f783ac'];
const MAX_ONLINE = 8;   // players in an online room
const MAX_LOCAL = 4;    // players on one screen (4 keyboard buzzers)
/** How many players the préliminaire qualifies: 2 → both stay, 3 → 2 (straight to the final), 4 → 3, 5+ → 4. */
const prelimQualifiers = n => (n <= 2 ? n : n === 3 ? 2 : n === 4 ? 3 : 4);
const nameList = ps => ps.map(p => esc(p.name)).join(', ').replace(/, ([^,]*)$/, ' et $1');

function freshView() {
  if (typeof seen !== 'undefined') { seen.flash = seen.sound = seen.toast = 0; seen.screen = ''; }
  return {
    screen: 'home', n: 0, players: [], online: false,
    scores: [], status: '', qInfo: '', roundLabel: '', canSkip: false,
    timer: null, grid: null, stage: null, music: null, panel: {}, overlay: null, buzz: { open: false, ids: [], show: false },
    toast: null, flash: null, sound: null, prefetch: [], prefetchAudio: [],
    intro: null, end: null, champ: null, lobby: null, loading: '',
  };
}

const G = {
  players: [],
  settings: {},
  bank: null,
  round: null,
  gen: 0,              // incremented on quit, cancels pending async work
  timers: new Set(),
  timerRef: null,      // timer shown in the timer bar (host)
  override: null,      // {id, fn} for the "C'était bon !" button
  handlers: {},        // host-side button handlers: {action: {fn, who}}
  view: freshView(),
  // network
  online: false,
  isHost: true,
  me: null,            // my player id (online)
  peer: null,
  hostConn: null,
  inGame: false,
  nextId: 0,
};
const byId = id => G.players.find(p => p.id === id);
const activePlayers = () => G.players.filter(p => !p.eliminated);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

/* ---------------- Sound (WebAudio, no files) ---------------- */
const Sound = (() => {
  let ctx;
  function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* audio not available */ }
  }
  return {
    unlock() { tone(1, 0.01, 'sine', 0.0001); },
    buzz() { tone(240, 0.3, 'square', 0.12); },
    good() { tone(660, 0.12, 'sine', 0.2); tone(990, 0.22, 'sine', 0.2, 0.12); },
    bad() { tone(160, 0.4, 'sawtooth', 0.1); },
    reveal() { tone(520, 0.08, 'triangle', 0.1); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, i * 0.15)); },
  };
})();

/* ---------------- Timer (host only) ---------------- */
class Timer {
  constructor(ms, onEnd) {
    this.total = ms; this.left = ms; this.onEnd = onEnd;
    this.running = false; this.id = null;
    G.timers.add(this);
  }
  start() {
    if (this.running || this.left <= 0) return this;
    this.running = true;
    this.last = performance.now();
    this.id = setInterval(() => this._step(), 50);
    touch();
    return this;
  }
  _step() {
    const now = performance.now();
    this.left -= now - this.last; this.last = now;
    if (this.left <= 0) { this.left = 0; this.stop(); if (this.onEnd) this.onEnd(); }
  }
  pause() {
    if (!this.running) return;
    this.left = Math.max(1, this.left - (performance.now() - this.last));
    clearInterval(this.id); this.running = false;
    touch();
  }
  stop() { clearInterval(this.id); this.running = false; G.timers.delete(this); touch(); }
  liveLeft() { return this.running ? Math.max(0, this.left - (performance.now() - this.last)) : this.left; }
  snapshot() { return { left: this.liveLeft(), total: this.total, running: this.running, mode: this.mode, secs: !!this.showSecs }; }
}
function stopAllTimers() { [...G.timers].forEach(t => t.stop()); G.timerRef = null; }

/* ==========================================================
   View state (host) — every change schedules a render + broadcast
   ========================================================== */
let flushQueued = false;
function touch() {
  if (!G.isHost || flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => { flushQueued = false; flush(); });
}
function flush() {
  const v = G.view;
  v.online = G.online;
  v.timer = G.timerRef ? G.timerRef.snapshot() : null;
  v.players = G.players.map(p => ({ id: p.id, name: p.name, color: p.color, key: p.key, offline: !!p.offline }));
  render(v);
  if (G.online) Net.broadcast({ t: 'view', view: v });
}
const ui = {
  screen(s) { G.view.screen = s; touch(); },
  status(h) { G.view.status = h || ''; touch(); },
  qInfo(h) { G.view.qInfo = h || ''; touch(); },
  grid(q, revealed = 4) { G.view.grid = q ? { images: q.images, revealed } : null; touch(); },
  flash(kind) { G.view.flash = { kind, n: ++G.view.n }; touch(); },
  sound(name) { G.view.sound = { name, n: ++G.view.n }; touch(); },
  toast(html, o = {}) { G.view.toast = { html, kind: o.kind || '', ms: o.ms || 2200, action: o.action || null, n: ++G.view.n }; touch(); },
  hideToast() { G.view.toast = { hide: true, n: ++G.view.n }; touch(); },
  panel(p) { G.view.panel = p || {}; touch(); },
  overlay(o) { G.view.overlay = o; touch(); },
  scores(list) { G.view.scores = list; touch(); },
  buzz(open, ids, show = true) { G.view.buzz = { open: !!open, ids: ids || [], show }; touch(); },
  timer(t, mode, secs) { G.timerRef = t; if (t) { t.mode = mode; t.showSecs = !!secs; } touch(); },
  prefetch() {
    if (!G.bank) return;
    if (G.bank instanceof MusicBank) { G.view.prefetch = []; G.view.prefetchAudio = G.bank.prefetchUrls(); }
    else { G.view.prefetchAudio = []; G.view.prefetch = G.bank.ready.slice(0, 2).flatMap(q => q.images.map(i => i.url)); }
    touch();
  },
};

/* ---------- Music mode helpers (host) ---------- */
const isMusic = () => G.settings.theme === 'music' || G.settings.theme === 'hits';
const isHits = () => G.settings.theme === 'hits';
const answerHint = () => (isHits() ? 'Titre ou artiste…' : "Nom de l'animé…");
const EXTRA = () => (isMusic() ? 10000 : 0);   // music quiz: +10 s on the clocks
const themeLabel = a => a.label || `${a.type === 'OP' ? 'Opening' : 'Ending'}${a.seq > 1 ? ' ' + a.seq : ''}`;

/** Shows the question: 4 images (images quiz) or the music stage (music quiz). */
function showQ(q, revealed = 4, extra) {
  if (!q) { G.view.grid = null; G.view.stage = null; touch(); return; }
  if (q.audio) {
    G.view.grid = null;
    G.view.stage = Object.assign({ label: themeLabel(q.audio) }, extra || {});
  } else {
    G.view.stage = null;
    G.view.grid = { images: q.images, revealed };
  }
  touch();
}

/** The song currently playing, as decided by the host. Every phone plays it in sync. */
const Track = {
  url: null, fallback: null, pos: 0, playing: false, since: 0,
  load(q) {
    this.url = q && q.audio ? q.audio.url : null;
    this.fallback = q && q.audio ? q.audio.fallback : null;
    this.pos = 0; this.playing = false;
    this.sync();
  },
  now() { return this.pos + (this.playing ? (performance.now() - this.since) / 1000 : 0); },
  play() { if (!this.url || this.playing) return; this.playing = true; this.since = performance.now(); this.sync(); },
  pause() { if (!this.playing) return; this.pos = this.now(); this.playing = false; this.sync(); },
  stop() { this.pause(); if (this.url) { this.url = null; this.sync(); } },
  sync() {
    G.view.music = this.url ? { url: this.url, fallback: this.fallback, playing: this.playing, pos: this.now(), n: ++G.view.n } : null;
    touch();
  },
};

// Host-side handlers for buttons ("next", "ready"…). who: 'any' | 'host' | player id
function on(action, fn, who = 'any') { G.handlers[action] = { fn, who }; }
function allowed(pid, who) {
  if (!G.online || pid == null) return true;
  if (who === 'any' || pid === G.me) return true; // the host may always click
  return pid === who;
}
// Same rule, seen from this device (decides whether a button is shown)
function canDo(who) {
  if (!G.online || G.isHost || who === 'any') return true;
  return who === G.me;
}

function revealObj(q, msg, kind, nextLabel) {
  const media = q.media;
  if (q.audio && G.view.stage) {
    G.view.stage = Object.assign({}, G.view.stage, { revealed: true, cover: (media.coverImage && (media.coverImage.extraLarge || media.coverImage.large)) || '', song: q.audio.song || '' });
  }
  const romaji = media.title.romaji && media.title.romaji !== media.display ? media.title.romaji : '';
  const cover = (media.coverImage && (media.coverImage.large || media.coverImage.extraLarge)) || '';
  const song = media.year ? `📅 ${media.year} · ${esc(media.styleLabel || '')}`
    : q.audio ? `🎵 ${themeLabel(q.audio)}${q.audio.song ? ` · « ${esc(q.audio.song)} »` : ''}` : '';
  return { msg, kind, title: media.display, sub: romaji, song, cover, next: nextLabel ? { label: nextLabel, who: 'any' } : null };
}

async function loadQuestion() {
  const gen = G.gen;
  ui.status('<span class="dots">Chargement de la question</span>');
  try {
    const q = await G.bank.next();
    if (gen !== G.gen) return undefined; // cancelled
    ui.prefetch();
    return q;
  } catch (e) {
    if (gen === G.gen) fatal(e);
    return undefined;
  }
}

/* ==========================================================
   Actions: every click / key goes through act()
   ========================================================== */
function act(a, v) {
  if (G.isHost) handleAction(G.online ? G.me : null, a, v);
  else Net.send({ t: 'act', a, v });
}
function handleAction(pid, a, v) {
  const R = G.round;
  switch (a) {
    case 'buzz': {
      const p = byId(pid == null ? v : pid);
      if (p && R && R.onBuzz) R.onBuzz(p);
      break;
    }
    case 'choice': if (R && R.choose) R.choose(+v, pid); break;
    case 'answer': if (R && R.answer) R.answer(String(v || '').slice(0, 100), pid); break;
    case 'pass': if (R && R.pass) R.pass(pid); break;
    case 'skip': if (allowed(pid, 'host') && R && R.skip) R.skip(); break;
    case 'override':
      if (G.override && G.override.id === +v) { const f = G.override.fn; G.override = null; ui.hideToast(); f(); }
      break;
    default: {
      const h = G.handlers[a];
      if (h && allowed(pid, h.who)) { delete G.handlers[a]; h.fn(); }
    }
  }
}

/* ==========================================================
   ROUND 1 — Préliminaire : 9 points gagnants (QCM + buzzer)
   ========================================================== */
const Prelim = {
  step: 'Manche 1',
  title: 'Préliminaire',
  subtitle: '9 points gagnants',
  canSkip: true,
  get rules() {
    return [
    isHits() ? 'Une chanson passe : buzzez dès que vous la reconnaissez !'
      : isMusic() ? 'Un opening ou un ending passe : buzzez dès que vous reconnaissez l\'animé !' : '4 images, 1 animé : buzzez dès que vous avez trouvé !',
    `${(20000 + EXTRA()) / 1000} secondes par question. Le buzz arrête le chrono${isMusic() ? ' et la musique' : ''} pour tout le monde.`,
    'Après le buzz, 4 propositions apparaissent pour celui qui a buzzé : 8 secondes pour choisir.',
    'Questions 1-3 : 1 point · 4-6 : 2 points · ensuite : 3 points.',
    'Mauvaise réponse = vous êtes bloqué, les autres peuvent buzzer.',
    'Premier à 9 points = qualifié (et +1 point bonus en finale).',
    ];
  },
  extraRules() {
    const n = activePlayers().length, q = prelimQualifiers(n);
    if (n <= 2) return ['Le premier à 9 points gagne +1 point d\'avance, puis place directement à la finale !'];
    return [`À ${n} joueurs : les ${q} premiers à 9 points sont qualifiés pour ${q === 2 ? 'la finale (pas de demi-finale)' : 'la demi-finale'}, les autres sont éliminés.`];
  },

  begin() {
    this.players = activePlayers();
    this.players.forEach(p => { p.r1 = 0; p.qualified = false; });
    this.order = [];
    this.qCount = 0;
    this.locked = new Set();
    this.buzzer = null;
    this.next();
  },
  eligible(p) { return this.players.includes(p) && !p.qualified && !this.locked.has(p.id) && !p.offline; },
  scores() {
    ui.scores(this.players.map(p => ({
      id: p.id,
      score: `${p.r1}<small> / 9</small>`,
      badge: p.qualified ? 'Qualifié ✔' : this.locked.has(p.id) ? 'Bloqué' : '',
      cls: [p.qualified && 'qualified', this.locked.has(p.id) && 'locked', this.buzzer === p && 'buzzed'].filter(Boolean),
    })));
    ui.buzz(this.state === 'open', this.players.filter(p => this.eligible(p)).map(p => p.id));
  },
  panel(reveal) {
    const q = this.q;
    if (this.state !== 'answering' && this.state !== 'reveal') return ui.panel({});
    ui.panel({
      reveal,
      choices: {
        items: q.choices.map(m => m.choiceLabel || m.display),
        armed: this.state === 'answering' ? this.buzzer.id : null,
        wrong: [...this.wrongChoices],
        right: this.state === 'reveal' ? q.choices.findIndex(m => m.id === q.media.id) : null,
      },
    });
  },
  valueFor(n) { return n <= 3 ? 1 : n <= 6 ? 2 : 3; },

  async next() {
    G.handlers = {};
    this.state = 'loading';
    this.buzzer = null;
    this.locked = new Set();
    Track.stop();
    ui.panel({}); showQ(null); ui.timer(null);
    this.scores();
    const q = await loadQuestion();
    if (q === undefined) return;
    if (q === null) return this.end('Plus de questions disponibles !');
    this.q = q;
    this.qCount++;
    this.value = this.valueFor(this.qCount);
    this.wrongChoices = new Set();
    q.choices = shuffle([q.media, ...G.bank.distractors(q.media)]);
    showQ(q, 4);
    Track.load(q); Track.play();
    ui.qInfo(`Question ${this.qCount} · <b>${plural(this.value, 'point')}</b>`);
    this.state = 'open';
    this.panel();
    ui.status('Buzzez quand vous avez trouvé !');
    this.scores();
    this.qTimer = new Timer(20000 + EXTRA(), () => this.timeUp()).start();
    ui.timer(this.qTimer, 'q');
  },

  onBuzz(p) {
    if (this.state !== 'open' || !this.eligible(p)) return;
    ui.sound('buzz');
    this.state = 'answering';
    this.buzzer = p;
    this.qTimer.pause();
    Track.pause();
    ui.status(`✋ <b style="color:${p.color}">${esc(p.name)}</b> a buzzé ! Choix de la réponse…`);
    this.aTimer = new Timer(8000, () => this.wrong(null)).start();
    ui.timer(this.aTimer, 'answer');
    this.panel(); this.scores();
  },
  choose(i, pid) {
    if (this.state !== 'answering' || this.wrongChoices.has(i) || !this.q.choices[i]) return;
    if (G.online && pid !== this.buzzer.id) return;
    this.aTimer.stop();
    if (this.q.choices[i].id === this.q.media.id) this.correct(); else this.wrong(i);
  },
  correct() {
    const p = this.buzzer;
    ui.sound('good'); ui.flash('good');
    p.r1 += this.value;
    if (p.r1 >= 9 && !p.qualified) { p.qualified = true; this.order.push(p); }
    this.stopTimers();
    this.state = 'reveal';
    this.buzzer = null;
    Track.play();
    const done = this.isOver();
    ui.status(p.qualified && !done ? `<b>${esc(p.name)}</b> est qualifié(e) !` : '');
    this.panel(revealObj(this.q, `✔ ${esc(p.name)} +${plural(this.value, 'point')}`, 'good', done ? 'Résultats' : 'Question suivante'));
    on('next', () => done ? this.end() : this.next());
    this.scores();
  },
  wrong(i) {
    const p = this.buzzer;
    ui.sound('bad'); ui.flash('bad');
    this.locked.add(p.id);
    if (i != null) this.wrongChoices.add(i);
    this.buzzer = null;
    ui.toast(i == null ? `⏱ ${esc(p.name)} trop lent !` : `✘ Mauvaise réponse pour ${esc(p.name)}`, { kind: 'bad' });
    if (this.players.some(x => this.eligible(x))) {
      this.state = 'open';
      ui.status('Les autres peuvent encore buzzer !');
      this.qTimer.start();
      Track.play();
      ui.timer(this.qTimer, 'q');
      this.panel(); this.scores();
    } else {
      this.reveal('Personne n\'a trouvé…');
    }
  },
  timeUp() { if (this.state === 'open') this.reveal('⏱ Temps écoulé !'); },
  skip() { if (this.state === 'open' || this.state === 'answering') this.reveal('Question passée'); },
  reveal(msg) {
    this.stopTimers();
    this.state = 'reveal';
    this.buzzer = null;
    Track.play();
    ui.status('');
    this.panel(revealObj(this.q, msg, 'neutral', 'Question suivante'));
    on('next', () => this.next());
    this.scores();
  },
  stopTimers() { if (this.qTimer) this.qTimer.stop(); if (this.aTimer) this.aTimer.stop(); },
  isOver() {
    const n = this.players.length;
    const qualified = this.players.filter(p => p.qualified).length;
    return n >= 3 ? qualified >= prelimQualifiers(n) : qualified >= 1;
  },
  end(reason) {
    this.stopTimers();
    this.state = 'done';
    const rest = this.players.filter(p => !p.qualified).sort((a, b) => b.r1 - a.r1);
    const ranking = [...this.order, ...rest];
    const n = this.players.length;
    const out = n >= 3 ? ranking.slice(prelimQualifiers(n)) : [];
    out.forEach(p => { p.eliminated = true; });
    const winner = ranking[0];
    winner.bonus += 1;
    const toFinal = activePlayers().length <= 2;   // only 2 left: no demi-finale
    showRoundEnd({
      step: this.step, title: 'Résultats du préliminaire',
      rows: ranking.map(p => [p, `${p.r1} pts`, p.eliminated ? '<span class="out">Éliminé(e)</span>' : p.qualified ? 'Qualifié(e) ✔' : 'Repêché(e)']),
      msg: [reason, `${esc(winner.name)} gagne <b>+1 point</b> d'avance pour la finale.`,
        out.length ? `${nameList(out)} ${out.length > 1 ? 'sont éliminés' : 'est éliminé(e)'}. Merci d'avoir joué !` : '',
        toFinal ? 'Plus que 2 joueurs : <b>direction la finale !</b>' : ''].filter(Boolean).join('<br>'),
      next: toFinal ? Final : Semi,
    });
  },
};

/* ==========================================================
   ROUND 2 — Demi-finale : 4 à la suite (réponses tapées, chrono)
   ========================================================== */
const Semi = {
  step: 'Manche 2',
  title: 'Demi-finale',
  subtitle: '4 à la suite',
  canSkip: false,
  get rules() {
    return [
    `Chacun son tour : ${(60000 + EXTRA()) / 1000} secondes au chrono.`,
    isHits() ? 'Une chanson passe : tape son titre OU le nom de l\'artiste (les petites fautes passent).'
      : (isMusic() ? 'Une musique passe : tape' : 'Tape') + ' le nom de l\'animé (anglais ou japonais, les petites fautes passent).',
    'Objectif : 4 bonnes réponses d\'affilée. Erreur ou « Passer » = série remise à zéro.',
    'Classement : meilleure série, puis temps restant, puis nombre de bonnes réponses.',
    'Le vainqueur gagne +2 points d\'avance en finale.',
    ];
  },
  extraRules() {
    return activePlayers().length > 2 ? ['Les 2 meilleurs vont en finale, les autres sont éliminés.'] : [];
  },

  begin() {
    this.players = activePlayers().sort((a, b) => (a.r1 || 0) - (b.r1 || 0));
    this.players.forEach(p => { p.r2 = { best: 0, streak: 0, correct: 0, timeLeft: 0, done: false }; });
    this.turn = -1;
    this.cur = null;
    ui.buzz(false, [], false);
    this.nextTurn();
  },
  scores() {
    ui.scores(this.players.map(p => ({
      id: p.id,
      score: `${p.r2.best}<small> / 4</small>`,
      badge: p === this.cur && !p.r2.done ? 'À toi !' : p.r2.done ? 'Terminé' : 'En attente',
      cls: [p === this.cur && !p.r2.done && 'buzzed', p.r2.done && 'done'].filter(Boolean),
    })));
  },
  panel() {
    if (!this.cur || this.state === 'intro') return ui.panel({});
    ui.panel({
      streak: this.cur.r2.streak,
      input: {
        for: this.cur.id, name: this.cur.name, placeholder: answerHint(), pass: true,
        enabled: this.state === 'open', key: 's' + this.qKey,
      },
    });
  },

  nextTurn() {
    G.handlers = {};
    this.turn++;
    if (this.turn >= this.players.length) return this.end();
    this.cur = this.players[this.turn];
    this.state = 'intro';
    this.q = null;
    Track.stop();
    showQ(null); ui.timer(null); ui.status(''); ui.panel({});
    ui.qInfo(`Joueur ${this.turn + 1} / ${this.players.length}`);
    this.scores();
    ui.overlay({
      html: `<h3 style="color:${this.cur.color}">${esc(this.cur.name)}</h3>
        <p>${(60000 + EXTRA()) / 1000} secondes pour enchaîner <b>4 bonnes réponses</b> d'affilée.</p>
        <p class="small">Les autres : pas de souffle 🤫</p>`,
      btn: { label: 'Je suis prêt(e) !', a: 'ready', who: this.cur.id },
      waitFor: this.cur.name,
    });
    on('ready', () => this.startTurn(), this.cur.id);
  },
  startTurn() {
    ui.overlay(null);
    this.chrono = new Timer(60000 + EXTRA(), () => this.timeUp());
    ui.timer(this.chrono, 'q', true);
    this.next();
  },
  async next() {
    this.state = 'loading';
    this.chrono.pause();
    Track.stop();
    this.panel();
    const q = await loadQuestion();
    if (q === undefined) return;
    if (this.state !== 'loading') return;
    if (q === null) return this.finishTurn('Plus de questions disponibles !');
    this.q = q;
    this.qKey = q.media.id;
    showQ(q, 4);
    Track.load(q); Track.play();
    ui.status(`Au tour de <b style="color:${this.cur.color}">${esc(this.cur.name)}</b> : ${isHits() ? 'quelle est cette chanson' : 'quel est cet animé'} ?`);
    this.state = 'open';
    this.panel();
    this.chrono.start();
  },
  answer(text, pid) { if (!G.online || pid === (this.cur && this.cur.id)) this.submit(text); },
  pass(pid) { if (!G.online || pid === (this.cur && this.cur.id)) this.submit(null); },
  submit(text) {
    if (this.state !== 'open') return;
    if (text != null && !text.trim()) return;
    const p = this.cur, r = p.r2, media = this.q.media;
    G.override = null;
    if (text != null && Match.isCorrect(text, media)) {
      ui.sound('good'); ui.flash('good');
      r.streak++; r.correct++; r.best = Math.max(r.best, r.streak);
      ui.toast(`✔ ${esc(media.display)}`, { kind: 'good', ms: 1300 });
      if (r.streak >= 4) { r.timeLeft = this.chrono.liveLeft(); return this.finishTurn('🔥 4 à la suite !'); }
    } else {
      ui.sound('bad'); ui.flash('bad');
      const prev = r.streak;
      r.streak = 0;
      if (text == null) {
        ui.toast(`Passé — c'était <b>${esc(media.display)}</b>`, { ms: 2500 });
      } else {
        const id = ++G.view.n;
        G.override = {
          id, fn: () => {
            if (this.cur !== p || r.done) return;
            r.streak = prev + 1; r.correct++; r.best = Math.max(r.best, r.streak);
            ui.sound('good');
            if (r.streak >= 4) { r.timeLeft = this.chrono.liveLeft(); return this.finishTurn('🔥 4 à la suite !'); }
            this.panel(); this.scores();
          },
        };
        ui.toast(`✘ « ${esc(text)} » — c'était <b>${esc(media.display)}</b>`, {
          kind: 'bad', ms: 4000, action: { label: "C'était bon !", v: id },
        });
      }
    }
    this.scores();
    this.next();
  },
  timeUp() { if (this.state === 'open' || this.state === 'loading') this.finishTurn('⏱ Temps écoulé !'); },
  finishTurn(msg) {
    const p = this.cur, r = p.r2;
    const pending = this.state === 'open' && this.q && !msg.startsWith('🔥') ? this.q.media : null;
    this.state = 'done';
    this.chrono.stop();
    Track.stop();
    r.done = true;
    G.override = null;
    ui.hideToast();
    ui.status('');
    ui.panel({ streak: r.streak });
    this.scores();
    const last = this.turn === this.players.length - 1;
    ui.overlay({
      html: `<h3>${msg}</h3>
        <p><b style="color:${p.color}">${esc(p.name)}</b> : meilleure série <b>${r.best}/4</b> · ${plural(r.correct, 'bonne réponse')}</p>
        ${r.best >= 4 ? `<p class="small">Il restait ${Math.ceil(r.timeLeft / 1000)} s au chrono</p>` : ''}
        ${pending ? `<p class="small">La dernière question était : <b>${esc(pending.display)}</b></p>` : ''}`,
      btn: { label: last ? 'Résultats' : 'Joueur suivant', a: 'ready', who: 'any' },
    });
    on('ready', () => { ui.overlay(null); this.nextTurn(); });
  },
  end() {
    this.state = 'over';
    const ranking = this.players.slice().sort((a, b) =>
      (b.r2.best - a.r2.best) || (b.r2.timeLeft - a.r2.timeLeft) || (b.r2.correct - a.r2.correct));
    const out = ranking.slice(2);
    out.forEach(p => { p.eliminated = true; });
    const winner = ranking[0];
    winner.bonus += 2;
    this.cur = null;
    showRoundEnd({
      step: this.step, title: 'Résultats de la demi-finale',
      rows: ranking.map(p => [p, `série ${p.r2.best}/4 · ${p.r2.correct} ✔`, p.eliminated ? '<span class="out">Éliminé(e)</span>' : 'Finaliste ✔']),
      msg: [`${esc(winner.name)} gagne <b>+2 points</b> d'avance pour la finale.`,
        out.length ? `${nameList(out)} ${out.length > 1 ? 'sont éliminés' : 'est éliminé(e)'}.` : ''].filter(Boolean).join('<br>'),
      next: Final,
    });
  },
};

/* ==========================================================
   ROUND 3 — Finale : face à face (images révélées une à une)
   ========================================================== */
const Final = {
  step: 'Manche 3',
  title: 'La Finale',
  subtitle: 'Face à face',
  canSkip: true,
  get rules() {
    return [
      ...(isMusic() ? [
        'La musique démarre : plus tu buzzes tôt, plus ça rapporte.',
        '0-8 s = 4 pts · 8-16 s = 3 pts · 16-24 s = 2 pts · 24-33 s = 1 pt.',
        'Le buzz arrête la musique et le chrono pour tout le monde.',
      ] : [
        'Les images apparaissent une par une, toutes les 5 secondes.',
        'Buzz avec 1 image = 4 pts · 2 images = 3 pts · 3 images = 2 pts · 4 images = 1 pt.',
      ]),
      'Après le buzz : 15 secondes pour taper la réponse.',
      'Mauvaise réponse = bloqué, l\'adversaire peut tenter sa chance.',
      `Le premier à ${G.settings.target} points est sacré champion !`,
    ];
  },
  extraRules() {
    const b = activePlayers().filter(p => p.bonus).map(p => `${p.name} commence avec ${plural(p.bonus, 'point')}`);
    return b.length ? ['Avances : ' + b.join(' · ')] : [];
  },

  begin() {
    this.players = activePlayers();
    this.players.forEach(p => { p.r3 = p.bonus || 0; });
    this.target = G.settings.target;
    this.qCount = 0;
    this.locked = new Set();
    this.buzzer = null;
    this.next();
  },
  scores() {
    ui.scores(this.players.map(p => ({
      id: p.id,
      score: `${p.r3}<small> / ${this.target}</small>`,
      badge: this.locked.has(p.id) ? 'Bloqué' : '',
      cls: [this.locked.has(p.id) && 'locked', this.buzzer === p && 'buzzed'].filter(Boolean),
    })));
    ui.buzz(this.state === 'open', this.players.filter(p => this.eligible(p)).map(p => p.id));
  },
  eligible(p) { return this.players.includes(p) && !this.locked.has(p.id) && !p.offline; },
  value() { return 5 - this.revealed; },

  async next() {
    G.handlers = {};
    this.state = 'loading';
    this.buzzer = null;
    this.locked = new Set();
    this.awarded = false;
    G.override = null;
    Track.stop();
    ui.panel({}); showQ(null); ui.timer(null);
    this.scores();
    const q = await loadQuestion();
    if (q === undefined) return;
    if (q === null) {
      const best = this.players.slice().sort((a, b) => b.r3 - a.r3)[0];
      return this.end(best);
    }
    this.q = q;
    this.qCount++;
    this.revealed = 0;
    this.state = 'open';
    ui.status('Buzzez ! Plus tôt = plus de points');
    this.revealNext();
    this.scores();
  },
  revealNext() {
    this.revealed++;
    if (this.q.audio) {
      if (this.revealed === 1) { Track.load(this.q); Track.play(); }
      showQ(this.q, 4, { value: this.value() });
    } else {
      ui.sound('reveal');
      showQ(this.q, this.revealed);
    }
    this.updateInfo();
    const ms = this.q.audio ? (this.revealed < 4 ? 8000 : 9000) : (this.revealed < 4 ? 5000 : 8000);
    this.step = new Timer(ms, () => {
      if (this.revealed < 4) this.revealNext();
      else this.reveal('⏱ Personne n\'a trouvé…');
    }).start();
    ui.timer(this.step, 'q');
  },
  updateInfo() {
    ui.qInfo(`Question ${this.qCount} · ${this.q.audio ? '' : plural(this.revealed, 'image') + ' · '}<b>${plural(this.value(), 'point')}</b>`);
  },
  onBuzz(p) {
    if (this.state !== 'open' || !this.eligible(p)) return;
    ui.sound('buzz');
    this.state = 'answering';
    this.buzzer = p;
    this.buzzValue = this.value();
    this.step.pause();
    Track.pause();
    ui.status(`<b style="color:${p.color}">${esc(p.name)}</b> buzze pour <b>${plural(this.buzzValue, 'point')}</b> !`);
    ui.panel({ input: { for: p.id, name: p.name, placeholder: answerHint(), pass: false, enabled: true, key: `f${this.qCount}-${p.id}` } });
    this.aTimer = new Timer(15000, () => this.answer('', null, true)).start();
    ui.timer(this.aTimer, 'answer');
    this.scores();
  },
  answer(text, pid, timeout) {
    if (this.state !== 'answering') return;
    if (G.online && !timeout && pid !== this.buzzer.id) return;
    this.aTimer.stop();
    const p = this.buzzer, v = this.buzzValue, media = this.q.media;
    if (text && Match.isCorrect(text, media)) return this.correct(p, v);
    ui.sound('bad'); ui.flash('bad');
    this.locked.add(p.id);
    this.buzzer = null;
    ui.panel({});
    if (text && text.trim()) {
      const id = ++G.view.n;
      G.override = { id, fn: () => { if (!this.awarded && this.q.media === media) this.correct(p, v); } };
      ui.toast(`✘ ${esc(p.name)} : « ${esc(text)} » refusé`, { kind: 'bad', ms: 4500, action: { label: "C'était bon !", v: id } });
    } else {
      ui.toast(`⏱ ${esc(p.name)} trop lent !`, { kind: 'bad' });
    }
    if (this.players.some(x => this.eligible(x))) {
      this.state = 'open';
      ui.status('À l\'adversaire de tenter sa chance !');
      this.step.start();
      Track.play();
      ui.timer(this.step, 'q');
      this.scores();
    } else {
      this.reveal('Personne n\'a trouvé…');
    }
  },
  correct(p, v) {
    this.stopTimers();
    this.awarded = true;
    this.state = 'reveal';
    this.buzzer = null;
    ui.sound('good'); ui.flash('good');
    p.r3 += v;
    showQ(this.q, 4);
    Track.play();
    ui.status('');
    const won = p.r3 >= this.target;
    ui.panel({ reveal: revealObj(this.q, `✔ ${esc(p.name)} +${plural(v, 'point')}`, 'good', won ? '🏆 Voir le champion' : 'Question suivante') });
    on('next', () => won ? this.end(p) : this.next());
    this.scores();
  },
  reveal(msg) {
    this.stopTimers();
    this.state = 'reveal';
    this.buzzer = null;
    showQ(this.q, 4);
    Track.play();
    ui.status('');
    ui.panel({ reveal: revealObj(this.q, msg, 'neutral', 'Question suivante') });
    on('next', () => this.next());
    this.scores();
  },
  skip() { if (this.state === 'open' || this.state === 'answering') this.reveal('Question passée'); },
  stopTimers() { if (this.step) this.step.stop(); if (this.aTimer) this.aTimer.stop(); },
  end(p) {
    this.stopTimers();
    this.state = 'over';
    showChampion(p, this.players);
  },
};

/* ==========================================================
   Game flow (host)
   ========================================================== */
function resetPlay() {
  stopAllTimers();
  Track.stop();
  G.handlers = {};
  G.override = null;
  G.round = null;
  Object.assign(G.view, { overlay: null, panel: {}, grid: null, stage: null, status: '', qInfo: '', scores: [], buzz: { open: false, ids: [], show: false } });
  ui.hideToast();
}

function showIntro(round) {
  resetPlay();
  G.view.intro = {
    step: round.step, title: round.title, subtitle: round.subtitle,
    rules: [...round.rules, ...(round.extraRules ? round.extraRules() : [])],
    ids: activePlayers().map(p => p.id),
  };
  on('introGo', () => {
    G.view.roundLabel = `<span>${round.step}</span> ${round.title} <em>${round.subtitle}</em>`;
    G.view.canSkip = round.canSkip;
    ui.screen('play');
    G.round = round;
    round.begin();
  }, 'host');
  ui.screen('intro');
}

function showRoundEnd({ step, title, rows, msg, next }) {
  resetPlay();
  G.view.end = {
    step, title, msg,
    rows: rows.map(([p, score, status]) => ({ id: p.id, score, status, elim: !!p.eliminated })),
    nextLabel: next === Final ? 'Place à la finale !' : 'Manche suivante',
  };
  on('endNext', () => showIntro(next), 'host');
  ui.screen('roundEnd');
}

function showChampion(winner, finalists) {
  resetPlay();
  G.view.champ = { id: winner.id, scores: finalists.map(p => ({ id: p.id, score: p.r3 })) };
  on('replay', () => startGame(), 'host');
  ui.sound('win');
  ui.screen('champion');
}

function fatal(e) {
  console.error(e);
  const msg = (e && e.message) || 'Erreur inconnue';
  if (G.online && G.isHost) {
    resetPlay();
    G.inGame = false;
    G.players = G.players.filter(p => !p.offline);
    G.view.lobby = { ...(G.view.lobby || {}), error: msg };
    ui.screen('lobby');
  } else {
    leaveToHome(msg);
  }
}

async function startGame() {
  if (!G.isHost) return;
  G.settings = {
    difficulty: $('#difficulty').value, target: +$('#finalTarget').value, theme: $('#theme').value,
    decades: $$('#decadePick input:checked').map(i => i.value), styles: $$('#stylePick input:checked').map(i => i.value),
  };
  localStorage.setItem('aqc-settings', JSON.stringify(G.settings));
  if (!G.online) {
    const names = Setup.names.map((n, i) => (n || '').trim() || `Joueur ${i + 1}`);
    localStorage.setItem('aqc-names', JSON.stringify(names));
    G.players = names.map((name, i) => ({ id: i, name, color: COLORS[i], key: KEYS[i] }));
  } else {
    G.players = G.players.filter(p => !p.offline);
    if (G.players.length < 2) { G.view.lobby.error = 'Il faut au moins 2 joueurs connectés.'; ui.screen('lobby'); return; }
  }
  G.players.forEach(p => Object.assign(p, { eliminated: false, bonus: 0, r1: 0, r2: null, r3: 0, qualified: false }));
  G.inGame = true;
  if (G.view.lobby) G.view.lobby.error = '';
  resetPlay();
  keepAwake();

  const gen = ++G.gen;
  G.view.loading = isHits() ? 'Recherche des chansons…' : 'Chargement des animés depuis AniList…';
  ui.screen('loading');
  try {
    let pool;
    if (isHits()) {
      pool = Hits.pool(G.settings.decades, G.settings.styles);
      if (pool.length < 12) throw new Error(`Seulement ${pool.length} chansons avec ces choix : coche plus de décennies ou de styles.`);
    } else {
      pool = await API.loadPool(G.settings.difficulty);
    }
    if (gen !== G.gen) return;
    G.bank = isHits() ? new HitsBank(pool) : isMusic() ? new MusicBank(pool) : new QuestionBank(pool);
    G.view.loading = isMusic() ? 'Recherche des openings et endings…' : 'Préparation des images…';
    touch();
    await G.bank.fill();
    if (gen !== G.gen) return;
    ui.prefetch();
  } catch (e) {
    if (gen === G.gen) fatal(e);
    return;
  }
  showIntro(Prelim);
}

function leaveToHome(error) {
  G.gen++;
  stopAllTimers();
  G.round = null;
  G.handlers = {};
  G.inGame = false;
  Net.close();
  G.online = false; G.isHost = true; G.me = null;
  G.view = freshView();
  render(G.view);
  Player.apply(null);
  showScreen('home');
  $('#homeError').textContent = error || '';
  releaseAwake();
}

/* ==========================================================
   Rendering (every device)
   ========================================================== */
var seen = { flash: 0, sound: 0, toast: 0, screen: '' };
let timerSnap = null;

function showScreen(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function setHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; return true; } return false; }
const vPlayer = (v, id) => v.players.find(p => p.id === id) || { name: '?', color: '#fff', key: '' };

function render(v) {
  if (!G.isHost) G.view = v;
  if (v.screen !== 'home') showScreen(v.screen);
  const fresh = seen.screen !== v.screen;
  seen.screen = v.screen;
  if (v.screen === 'lobby') renderLobby(v);
  if (v.screen === 'loading') $('#loadingText').textContent = v.loading || 'Chargement…';
  if (v.screen === 'intro') renderIntro(v);
  if (v.screen === 'play') renderPlay(v);
  if (v.screen === 'roundEnd') renderEnd(v);
  if (v.screen === 'champion') { renderChamp(v); if (fresh) confetti(); }
  if (fresh) {
    const b = $('.screen.active [data-enter]');
    if (b && !document.querySelector('.screen.active input')) setTimeout(() => b.focus({ preventScroll: true }), 50);
  }
  effects(v);
}

function effects(v) {
  if (v.sound && v.sound.n > seen.sound) { seen.sound = v.sound.n; if (Sound[v.sound.name]) Sound[v.sound.name](); }
  if (v.flash && v.flash.n > seen.flash) {
    seen.flash = v.flash.n;
    const g = $('#grid');
    g.classList.remove('flash-good', 'flash-bad'); void g.offsetWidth; g.classList.add('flash-' + v.flash.kind);
  }
  if (v.toast && v.toast.n > seen.toast) {
    seen.toast = v.toast.n;
    if (v.toast.hide) hideToast();
    else showToast(v.toast.html, { kind: v.toast.kind, ms: v.toast.ms, action: v.toast.action });
  }
  (v.prefetch || []).forEach(u => preloadImage(u));
  (v.prefetchAudio || []).forEach(u => Player.prefetch(u));
  Player.apply(v.screen === 'play' ? v.music : null);
  timerSnap = v.timer ? { ...v.timer, at: performance.now() } : null;
}

function btnHTML(label, a, who, cls = 'btn primary big', waitFor) {
  if (canDo(who)) return `<button class="${cls}" data-act="${a}" data-enter>${label}</button>`;
  return `<p class="waiting">⏳ En attente de ${esc(waitFor || "l'hôte")}…</p>`;
}

function renderLobby(v) {
  const L = v.lobby || {};
  $('#lobbyCode').textContent = L.code || '';
  setHTML($('#lobbyPlayers'), v.players.map(p =>
    `<span class="chip" style="--c:${p.color}">${esc(p.name)}${p.id === G.me ? ' <small>(toi)</small>' : ''}${p.id === 0 ? ' 👑' : ''}</span>`).join(''));
  const n = v.players.length;
  $('#lobbyMsg').innerHTML = G.isHost
    ? (n < 2 ? 'Envoie le code ou le lien à ton ami pour qu\'il te rejoigne.' : `${n} / ${MAX_ONLINE} joueurs. Lance quand tout le monde est là !`)
    : 'Connecté ! En attente que l\'hôte lance la partie…';
  $('#lobbyError').textContent = L.error || '';
  $('#lobbyQuiz').textContent = L.quiz ? `${L.quiz} · ${L.diff}` : '';
  const start = $('#lobbyStart');
  start.style.display = G.isHost ? '' : 'none';
  start.disabled = n < 2;
}

function chipsHTML(v, ids) {
  return ids.map(id => {
    const p = vPlayer(v, id);
    return `<span class="chip" style="--c:${p.color}">${v.online ? '' : `<kbd>${p.key.toUpperCase()}</kbd>`}${esc(p.name)}${v.online && id === G.me ? ' <small>(toi)</small>' : ''}</span>`;
  }).join('');
}

function renderIntro(v) {
  const I = v.intro; if (!I) return;
  $('#introStep').textContent = I.step;
  $('#introTitle').textContent = I.title;
  $('#introSubtitle').textContent = I.subtitle;
  setHTML($('#introRules'), I.rules.map(r => `<li>${esc(r)}</li>`).join(''));
  setHTML($('#introPlayers'), chipsHTML(v, I.ids));
  setHTML($('#introAction'), btnHTML("C'est parti !", 'introGo', 'host'));
}

function renderEnd(v) {
  const E = v.end; if (!E) return;
  $('#endStep').textContent = E.step;
  $('#endTitle').textContent = E.title;
  setHTML($('#endTable'), E.rows.map((r, i) => {
    const p = vPlayer(v, r.id);
    return `<tr class="${r.elim ? 'elim' : ''}"><td>${i + 1}</td><td style="color:${p.color}"><b>${esc(p.name)}</b></td><td>${r.score}</td><td>${r.status}</td></tr>`;
  }).join(''));
  $('#endMsg').innerHTML = E.msg;
  setHTML($('#endAction'), btnHTML(E.nextLabel, 'endNext', 'host'));
}

function renderChamp(v) {
  const C = v.champ; if (!C) return;
  const w = vPlayer(v, C.id);
  $('#champName').textContent = w.name;
  $('#champName').style.color = w.color;
  $('#champScore').innerHTML = C.scores.map(s => `${esc(vPlayer(v, s.id).name)} : <b>${s.score}</b>`).join(' · ');
  setHTML($('#champAction'),
    (canDo('host') ? '<button class="btn primary big" data-act="replay" data-enter>Revanche !</button>' : '<p class="waiting">L\'hôte peut lancer une revanche…</p>') +
    '<button class="btn ghost" data-act="home">Accueil</button>');
}

function renderPlay(v) {
  setHTML($('#roundLabel'), v.roundLabel || '');
  setHTML($('#qInfo'), v.qInfo || '');
  setHTML($('#status'), v.status || '');
  $('#skipBtn').style.display = v.canSkip && canDo('host') ? '' : 'none';

  // scoreboard
  $('#scoreboard').classList.toggle('many', v.scores.length > 4);
  setHTML($('#scoreboard'), v.scores.map(s => {
    const p = vPlayer(v, s.id);
    const cls = [...s.cls, v.online && s.id === G.me && 'me', p.offline && 'offline'].filter(Boolean).join(' ');
    return `<div class="pcard ${cls}" style="--c:${p.color}">
        ${v.online ? '' : `<kbd>${esc(p.key.toUpperCase())}</kbd>`}
        <span class="pname">${esc(p.name)}${v.online && s.id === G.me ? ' <small>(toi)</small>' : ''}</span>
        <span class="pscore">${s.score}</span>
        <span class="pbadge">${p.offline ? '📵 Déconnecté' : s.badge || ''}</span>
      </div>`;
  }).join(''));

  // music stage (music quiz) or image grid (images quiz)
  const st = v.stage;
  $('#grid').classList.toggle('hidden', !!st);
  const ms = $('#musicStage');
  ms.classList.toggle('hidden', !st);
  if (st) {
    const playing = !!(v.music && v.music.playing);
    ms.classList.toggle('playing', playing);
    ms.classList.toggle('revealed', !!st.revealed);
    setHTML(ms, st.revealed
      ? `<img class="ms-cover" src="${esc(st.cover)}" alt="" /><div class="ms-label">🎵 ${esc(st.label)}${st.song ? `<br><b>« ${esc(st.song)} »</b>` : ''}</div>`
      : `<div class="eq">${'<span></span>'.repeat(9)}</div>
         <div class="ms-label">🎵 ${esc(st.label)}</div>
         ${st.value ? `<div class="ms-value">${[1, 2, 3, 4].map(i => `<span class="${i <= st.value ? 'on' : ''}"></span>`).join('')}<b>${st.value} pts</b></div>` : ''}
         <button class="btn small ghost unmute ${Player.blocked ? '' : 'hidden'}" data-act="unmute">🔊 Activer le son</button>`);
  }

  // grid
  const grid = v.grid;
  $$('#grid .cell').forEach((cell, i) => {
    const img = cell.querySelector('img');
    if (grid && i < grid.revealed) {
      const im = grid.images[i];
      if (img.getAttribute('src') !== im.url) img.src = im.url;
      cell.classList.toggle('scene', im.kind === 'scene');
      cell.classList.add('shown');
    } else {
      cell.classList.remove('shown', 'scene');
      img.removeAttribute('src');
    }
  });

  // overlay
  const o = v.overlay;
  const ov = $('#overlay');
  if (o) {
    ov.classList.remove('hidden');
    if (setHTML(ov, `<div class="overlay-card">${o.html}${btnHTML(o.btn.label, o.btn.a, o.btn.who, 'btn primary big', o.waitFor)}</div>`)) {
      const b = ov.querySelector('[data-enter]'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 50);
    }
  } else {
    ov.classList.add('hidden'); setHTML(ov, '');
  }

  // answer area
  const P = v.panel || {};
  let html = '';
  if (P.reveal) {
    const r = P.reveal;
    html += `<div class="reveal ${r.kind}">
        ${r.cover ? `<img src="${esc(r.cover)}" alt="" />` : ''}
        <div><div class="rmsg">${r.msg}</div><div class="rtitle">${esc(r.title)}</div>${r.sub ? `<div class="rsub">${esc(r.sub)}</div>` : ''}${r.song ? `<div class="rsong">${r.song}</div>` : ''}</div>
      </div>`;
    if (r.next) html += `<button id="nextBtn" class="btn primary" data-act="next" data-enter>${r.next.label} ▶</button>`;
  }
  if (P.streak != null) {
    html += `<div class="streak">${[0, 1, 2, 3].map(i => `<span class="${i < P.streak ? 'on' : ''}"></span>`).join('')}<b>${P.streak}/4</b></div>`;
  }
  if (P.choices && P.choices.armed != null && v.online && P.choices.armed !== G.me) {
    const bp = vPlayer(v, P.choices.armed);
    html += `<p class="waiting">✋ <b style="color:${bp.color}">${esc(bp.name)}</b> a buzzé et choisit sa réponse…</p>`;
  } else if (P.choices) {
    const c = P.choices;
    const mine = c.armed != null && (!v.online || c.armed === G.me);
    html += `<div class="choices">${c.items.map((label, i) => {
      const cls = ['choice', mine && 'armed', c.wrong.includes(i) && 'wrong', c.right === i && 'right'].filter(Boolean).join(' ');
      const dis = c.wrong.includes(i) || c.right != null || (v.online && !mine);
      return `<button class="${cls}" data-act="choice" data-v="${i}" ${dis ? 'disabled' : ''}><kbd>${i + 1}</kbd><span>${esc(label)}</span></button>`;
    }).join('')}</div>`;
  }
  if (P.input) {
    const inp = P.input;
    if (canDo(inp.for) && !(v.online && G.isHost && inp.for !== G.me)) {
      html += `<form id="ansForm" class="ans-form" autocomplete="off" data-key="${esc(inp.key)}">
          <input id="ansInput" type="text" placeholder="${esc(inp.placeholder)}" spellcheck="false" autocapitalize="off" autocomplete="off" ${inp.enabled ? '' : 'disabled'} />
          <button class="btn primary" type="submit" ${inp.enabled ? '' : 'disabled'}>Valider</button>
          ${inp.pass ? `<button type="button" class="btn ghost" data-act="pass" ${inp.enabled ? '' : 'disabled'}>Passer</button>` : ''}
        </form>`;
    } else {
      html += `<p class="waiting">✍️ <b style="color:${vPlayer(v, inp.for).color}">${esc(inp.name)}</b> est en train de répondre…</p>`;
    }
  }
  if (setHTML($('#answerArea'), html)) {
    const input = $('#ansInput');
    if (input && !input.disabled) setTimeout(() => input.focus({ preventScroll: false }), 30);
    else if ($('#nextBtn')) setTimeout(() => $('#nextBtn') && $('#nextBtn').focus({ preventScroll: true }), 30);
  }

  // Buzzers. Online: one big BUZZ button on each phone. Same screen: one buzzer per player.
  const B = v.buzz || {};
  const buzzerId = P.choices ? P.choices.armed : P.input ? P.input.for : null;
  const bb = $('#buzzBtn');
  // shown only while buzzing is possible, so it never hides the answers
  const showBuzz = v.online && B.show && B.open && v.scores.some(s => s.id === G.me);
  bb.classList.toggle('hidden', !showBuzz);
  if (showBuzz) {
    const ok = B.open && B.ids.includes(G.me);
    bb.disabled = !ok;
    let label = 'BUZZ !';
    if (!ok) {
      if (buzzerId != null && !B.open) label = buzzerId === G.me ? '✋ À toi de répondre !' : `⏸ ${vPlayer(v, buzzerId).name} répond…`;
      else if (B.open) label = '🔒 Bloqué';
      else label = '…';
    }
    if (bb.textContent !== label) bb.textContent = label;
    bb.style.setProperty('--c', vPlayer(v, G.me).color);
  }
  const bar = $('#buzzBar');
  const showBar = !v.online && B.show;
  bar.classList.toggle('hidden', !showBar);
  if (showBar) {
    setHTML(bar, v.scores.map(s => {
      const p = vPlayer(v, s.id);
      const ok = B.open && B.ids.includes(s.id);
      const lbl = s.id === buzzerId && !B.open ? '✋' : ok ? 'BUZZ' : '🔒';
      return `<button class="lbuzz" data-act="lbuzz" data-v="${s.id}" style="--c:${p.color}" ${ok ? '' : 'disabled'}>
          <b>${lbl}</b><span>${esc(p.name)}</span><kbd>${esc(p.key.toUpperCase())}</kbd></button>`;
    }).join(''));
  }
  $('#play').classList.toggle('has-buzz', !!(showBuzz || showBar));
}

/* ---------- Music player (every device) ---------- */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
const Player = {
  el: (() => { const a = new Audio(); a.preload = 'auto'; a.volume = 0.85; return a; })(),
  n: -1, url: null, want: null, blocked: false, unlocked: false, pending: null, cache: new Map(),
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (!this.url) { this.el.src = SILENT; this.el.play().then(() => this.el.pause()).catch(() => {}); }
  },
  prefetch(url) {
    if (this.cache.has(url) || url === this.url) return;
    if (this.cache.size > 4) this.cache.clear();
    const a = new Audio(); a.preload = 'auto'; a.src = url;
    this.cache.set(url, a);
  },
  apply(m) {
    const el = this.el;
    if (!m) {
      if (this.url) { el.pause(); el.removeAttribute('src'); el.load(); this.url = null; }
      this.n = -1; this.want = null;
      return;
    }
    if (m.n === this.n) return;
    this.n = m.n; this.want = m;
    if (m.url !== this.url) {
      this.url = m.url; this.triedFallback = false;
      el.src = m.url;
      this.pending = m.pos;
    }
    this.seek(m.pos);
    if (m.playing) this.play(); else el.pause();
  },
  seek(pos) {
    const el = this.el;
    if (el.readyState < 1) { this.pending = pos; return; }
    if (Math.abs(el.currentTime - pos) > 0.8) { try { el.currentTime = pos; } catch (e) { /* ignore */ } }
  },
  play() {
    this.el.play().then(() => { if (this.blocked) { this.blocked = false; render(G.view); } })
      .catch(err => { if (err && err.name === 'NotAllowedError' && !this.blocked) { this.blocked = true; render(G.view); } });
  },
};
Player.el.addEventListener('loadedmetadata', () => {
  if (Player.pending != null) { const p = Player.pending; Player.pending = null; Player.seek(p); }
});
Player.el.addEventListener('error', () => {
  const w = Player.want;
  if (w && w.fallback && !Player.triedFallback && Player.url === w.url) {
    Player.triedFallback = true;
    Player.el.src = w.fallback;
    Player.pending = w.pos;
    if (w.playing) Player.play();
  }
});

/* timer bar, animated locally on each device */
(function timerLoop() {
  const bar = $('#timerBar div'), label = $('#timerLabel');
  let frac = 1, txt = '', cls = '';
  const s = G.isHost && G.timerRef ? { ...G.timerRef.snapshot(), at: performance.now() } : timerSnap;
  if (s) {
    const left = s.running ? Math.max(0, s.left - (performance.now() - s.at)) : s.left;
    frac = left / s.total;
    cls = (s.mode === 'answer' ? 'answer ' : '') + (frac < 0.25 ? 'low' : '');
    if (s.secs) txt = `⏱ ${Math.ceil(left / 1000)} s`;
  }
  bar.style.width = frac * 100 + '%';
  if (bar.className !== cls) bar.className = cls;
  if (label.textContent !== txt) label.textContent = txt;
  requestAnimationFrame(timerLoop);
})();

let toastTimeout;
function showToast(html, o = {}) {
  const t = $('#toast');
  clearTimeout(toastTimeout);
  t.innerHTML = `<span>${html}</span>` + (o.action ? `<button class="btn small gold" data-act="override" data-v="${o.action.v}">${esc(o.action.label)}</button>` : '');
  t.className = 'toast ' + (o.kind || '');
  toastTimeout = setTimeout(hideToast, o.ms || 2200);
}
function hideToast() { clearTimeout(toastTimeout); $('#toast').className = 'toast hidden'; }

/* ==========================================================
   Online play (PeerJS / WebRTC). The host's peer id is "aqc-<CODE>".
   ========================================================== */
const Net = (() => {
  const PREFIX = 'anime-quiz-champion-';
  function options() {
    const u = new URLSearchParams(location.search);
    const o = { debug: 0 };
    if (u.get('peerhost')) { // optional self-hosted PeerServer
      o.host = u.get('peerhost'); o.port = +u.get('peerport') || 9000;
      o.path = u.get('peerpath') || '/'; o.secure = u.get('peersecure') === '1';
    }
    return o;
  }
  function newCode() {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return [...Array(5)].map(() => A[(Math.random() * A.length) | 0]).join('');
  }
  function needLib() {
    if (typeof Peer === 'undefined') throw new Error("Le module en ligne n'a pas pu se charger.");
  }
  function netError(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Salle introuvable : vérifie le code (et que l\'hôte est toujours sur la page).';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Problème de connexion au serveur de jeu. Vérifie ta connexion internet.';
    if (t === 'browser-incompatible') return 'Ce navigateur ne permet pas de jouer en ligne.';
    return 'Erreur de connexion' + (t ? ` (${t})` : '') + '.';
  }

  function host() {
    needLib();
    return new Promise((resolve, reject) => {
      const code = newCode();
      const peer = new Peer(PREFIX + code, options());
      let opened = false;
      peer.on('open', () => { opened = true; G.peer = peer; resolve(code); });
      peer.on('error', e => {
        if (!opened) {
          peer.destroy();
          if (e.type === 'unavailable-id') host().then(resolve, reject);
          else reject(new Error(netError(e)));
        } else console.warn('peer error', e.type);
      });
      peer.on('disconnected', () => { if (G.peer === peer && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* ignore */ } }, 1000); });
      peer.on('connection', conn => onGuest(conn));
    });
  }

  function onGuest(conn) {
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        const name = String(msg.name || '').trim().slice(0, 16) || 'Invité';
        let p = G.players.find(x => x.offline && x.name.toLowerCase() === name.toLowerCase());
        if (!p) {
          if (G.inGame) return refuse(conn, 'La partie a déjà commencé. Attends la fin ou demande une nouvelle salle.');
          if (G.players.length >= MAX_ONLINE) return refuse(conn, `La salle est pleine (${MAX_ONLINE} joueurs max).`);
          const used = new Set(G.players.map(x => x.color));
          p = { id: ++G.nextId, name, color: COLORS.find(c => !used.has(c)) || COLORS[0], key: '' };
          if (G.players.some(x => x.name.toLowerCase() === name.toLowerCase())) p.name = name + ' ' + (G.players.length + 1);
          G.players.push(p);
        }
        if (p.conn && p.conn !== conn) try { p.conn.close(); } catch (e) { /* ignore */ }
        p.offline = false;
        p.conn = conn;
        conn.pid = p.id;
        conn.send({ t: 'welcome', id: p.id });
        G.view.n++;
        touch();
        if (!G.inGame) Sound.reveal();
      } else if (msg.t === 'act' && conn.pid != null && byId(conn.pid) && byId(conn.pid).conn === conn) {
        handleAction(conn.pid, msg.a, msg.v);
      }
    });
    const gone = () => {
      const p = G.players.find(x => x.conn === conn);
      if (!p) return;
      p.conn = null;
      if (G.inGame) {
        p.offline = true;
        showToast(`📵 ${esc(p.name)} s'est déconnecté(e)`, { kind: 'bad', ms: 3000 });
        if (G.round && G.round.scores) G.round.scores();
      } else {
        G.players = G.players.filter(x => x !== p);
      }
      touch();
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }
  function refuse(conn, msg) {
    conn.send({ t: 'error', msg });
    setTimeout(() => conn.close(), 800);
  }

  function join(code, name) {
    needLib();
    return new Promise((resolve, reject) => {
      const peer = new Peer(options());
      let done = false, welcomed = false;
      const fail = m => {
        if (done) return;
        done = true; clearTimeout(to);
        peer.destroy();
        reject(new Error(m));
      };
      const to = setTimeout(() => fail('Impossible de rejoindre la salle (délai dépassé). Réessaie.'), 20000);
      peer.on('error', e => { if (!done) fail(netError(e)); else console.warn('peer error', e.type); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        conn.on('open', () => conn.send({ t: 'hello', name }));
        conn.on('data', msg => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'welcome') {
            welcomed = true; done = true; clearTimeout(to);
            G.peer = peer; G.hostConn = conn; G.me = msg.id;
            resolve();
          } else if (msg.t === 'error') {
            fail(msg.msg);
          } else if (msg.t === 'view' && welcomed) {
            render(msg.view);
          }
        });
        conn.on('close', () => { if (welcomed && G.hostConn === conn) leaveToHome('Connexion perdue avec l\'hôte.'); });
      });
    });
  }

  function broadcast(msg) {
    G.players.forEach(p => { if (p.conn && p.conn.open) { try { p.conn.send(msg); } catch (e) { console.warn(e); } } });
  }
  function send(msg) { if (G.hostConn && G.hostConn.open) G.hostConn.send(msg); }
  function close() {
    const peer = G.peer;
    G.peer = null; G.hostConn = null;
    if (peer) try { peer.destroy(); } catch (e) { /* ignore */ }
  }
  return { host, join, broadcast, send, close };
})();

async function hostRoom() {
  const name = $('#myName').value.trim();
  if (!name) { $('#homeError').textContent = 'Choisis un pseudo !'; $('#myName').focus(); return; }
  localStorage.setItem('aqc-me', name);
  $('#homeError').textContent = '';
  showScreen('loading'); $('#loadingText').textContent = 'Création de la salle…';
  try {
    const code = await Net.host();
    G.online = true; G.isHost = true; G.me = 0; G.nextId = 0; G.inGame = false;
    G.players = [{ id: 0, name, color: COLORS[0], key: '' }];
    G.view = freshView();
    const hits = $('#theme').value === 'hits';
    G.view.lobby = {
      code, error: '', quiz: $('#theme').selectedOptions[0].dataset.short,
      diff: hits ? $$('#decadePick input:checked').map(i => i.value === '00' ? '2000s' : i.parentNode.textContent.trim()).join(', ') : $('#difficulty').selectedOptions[0].dataset.short,
    };
    ui.screen('lobby');
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    leaveToHome(e.message);
  }
}

async function joinRoom() {
  const name = $('#myName').value.trim();
  const code = $('#joinCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name) { $('#homeError').textContent = 'Choisis un pseudo !'; $('#myName').focus(); return; }
  if (code.length !== 5) { $('#homeError').textContent = 'Le code de la salle fait 5 caractères.'; $('#joinCode').focus(); return; }
  localStorage.setItem('aqc-me', name);
  $('#homeError').textContent = '';
  showScreen('loading'); $('#loadingText').textContent = 'Connexion à la salle ' + code + '…';
  G.online = true; G.isHost = false;
  G.view = freshView();
  try {
    await Net.join(code, name);
    keepAwake();
  } catch (e) {
    leaveToHome(e.message);
  }
}

function shareRoom() {
  const code = G.view.lobby && G.view.lobby.code;
  if (!code) return;
  const url = location.origin + location.pathname + '?join=' + code;
  const text = `Rejoins ma partie d'Anime Quiz Champion ! Code : ${code}`;
  if (navigator.share) navigator.share({ title: 'Anime Quiz Champion', text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => showToast('Lien copié ! Envoie-le à ton ami.', { kind: 'good' }));
  else prompt('Copie ce lien :', url);
}

/* keep the phone screen on during a game */
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* ignore */ }
}
function releaseAwake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G.inGame) keepAwake(); });

/* ==========================================================
   Input wiring
   ========================================================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  Sound.unlock();
  Player.unlock();
  const a = el.dataset.act;
  const v = el.dataset.v != null && /^-?\d+$/.test(el.dataset.v) ? +el.dataset.v : el.dataset.v;
  switch (a) {
    case 'home':
      if (!G.inGame || confirm('Quitter la partie ?')) leaveToHome();
      break;
    case 'quit':
      if (confirm(G.online && G.isHost ? 'Quitter ? La partie s\'arrêtera pour tout le monde.' : 'Quitter la partie en cours ?')) leaveToHome();
      break;
    case 'share': shareRoom(); break;
    case 'lobbyStart': startGame(); break;
    case 'mybuzz': act('buzz', G.me); break;
    case 'lbuzz': if (!G.online) act('buzz', v); break;
    case 'unmute': Player.blocked = false; Player.play(); render(G.view); break;
    case 'choice': {
      const c = G.view.panel && G.view.panel.choices;
      if (!G.online && c && c.armed == null) { showToast("Buzzez d'abord !"); break; }
      act('choice', v);
      break;
    }
    default: act(a, v);
  }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'ansForm') return;
  e.preventDefault();
  const value = $('#ansInput').value;
  if (!value.trim()) return;
  if (!G.isHost) { $('#ansInput').disabled = true; }
  act('answer', value);
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const key = e.key.toLowerCase();
  const screen = $('.screen.active');
  if (!screen || screen.id === 'home') return;

  if (key === ' ' && G.online && !$('#buzzBtn').classList.contains('hidden')) {
    e.preventDefault();
    if (!$('#buzzBtn').disabled) act('buzz', G.me);
    return;
  }
  if (key === 'enter' || key === ' ') {
    const btn = [...screen.querySelectorAll('[data-enter]')].find(b => b.offsetParent !== null && !b.disabled);
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }
  if (e.repeat) return;
  if (!G.online) {
    const idx = KEYS.indexOf(key);
    if (idx >= 0 && G.players[idx]) { act('buzz', G.players[idx].id); return; }
  }
  if (/^[1-4]$/.test(key)) {
    const b = $(`#answerArea .choice[data-v="${+key - 1}"]`);
    if (b) b.click();
  }
});

/* ---------------- Home / setup ---------------- */
const Setup = {
  names: [],
  load() {
    try { this.names = JSON.parse(localStorage.getItem('aqc-names')) || []; } catch (e) { this.names = []; }
    if (this.names.length < 2) this.names = ['Joueur 1', 'Joueur 2'];
    let s = {};
    try { s = JSON.parse(localStorage.getItem('aqc-settings') || '{}'); } catch (e) { /* ignore */ }
    if (s.difficulty) $('#difficulty').value = s.difficulty;
    if (s.target) $('#finalTarget').value = s.target;
    if (s.theme) $('#theme').value = s.theme;
    if (s.decades) $$('#decadePick input').forEach(i => { i.checked = s.decades.includes(i.value); });
    if (s.styles) $$('#stylePick input').forEach(i => { i.checked = s.styles.includes(i.value); });
    const quiz = new URLSearchParams(location.search).get('quiz');
    if (['images', 'music', 'hits'].includes(quiz)) $('#theme').value = quiz;
    this.applyTheme();
    $('#myName').value = localStorage.getItem('aqc-me') || '';
    const join = new URLSearchParams(location.search).get('join');
    if (join) $('#joinCode').value = join.toUpperCase();
    this.setMode(join ? 'online' : localStorage.getItem('aqc-mode') || 'online');
    this.render();
  },
  applyTheme() {
    const t = $('#theme').value;
    $('#home').dataset.theme = t;
    $('.logo').innerHTML = t === 'hits' ? 'Blind Test <span>Champion</span>' : 'Anime Quiz <span>Champion</span>';
    $('.tagline').textContent = t === 'hits' ? '1 chanson · 1 buzz · 1 seul champion' : t === 'music' ? '1 opening · 1 animé · 1 seul champion' : '4 images · 1 animé · 1 seul champion';
    document.title = t === 'hits' ? 'Blind Test Champion — devine la chanson' : 'Anime Quiz Champion — 4 images, 1 animé';
  },
  setMode(mode) {
    this.mode = mode;
    localStorage.setItem('aqc-mode', mode);
    $('#home').dataset.mode = mode;
    $$('.mode-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  },
  render() {
    $('#playerInputs').innerHTML = this.names.map((n, i) => `
      <div class="pinput" style="--c:${COLORS[i]}">
        <kbd>${KEYS[i].toUpperCase()}</kbd>
        <input class="field" data-i="${i}" value="${esc(n)}" maxlength="16" />
        ${this.names.length > 2 ? `<button class="btn ghost small" data-rm="${i}" title="Retirer">✕</button>` : ''}
      </div>`).join('');
    $$('#playerInputs input').forEach(inp => { inp.oninput = () => { this.names[+inp.dataset.i] = inp.value; }; });
    $$('#playerInputs [data-rm]').forEach(b => { b.onclick = () => { this.names.splice(+b.dataset.rm, 1); this.render(); }; });
    $('#addPlayer').style.display = this.names.length >= MAX_LOCAL ? 'none' : '';
  },
};

/* ---------------- Confetti ---------------- */
function confetti() {
  const c = $('#confetti'), ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#ffd43b', '#ff4d6d', '#4dabff', '#69db7c', '#b197fc', '#fff'];
  const parts = Array.from({ length: 180 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
    s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    col: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    });
    if (now - t0 < 7000 && $('#champion').classList.contains('active')) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, c.width, c.height);
  })(t0);
}

/* ---------------- Wiring ---------------- */
$('#theme').addEventListener('change', () => Setup.applyTheme());
$$('.mode-tabs .tab').forEach(t => { t.onclick = () => { Setup.setMode(t.dataset.mode); $('#homeError').textContent = ''; }; });
$('#addPlayer').onclick = () => { if (Setup.names.length < MAX_LOCAL) { Setup.names.push(`Joueur ${Setup.names.length + 1}`); Setup.render(); } };
$('#startBtn').onclick = () => { Sound.unlock(); Player.unlock(); G.online = false; G.isHost = true; startGame(); };
$('#hostBtn').onclick = () => { Sound.unlock(); Player.unlock(); hostRoom(); };
$('#joinBtn').onclick = () => { Sound.unlock(); Player.unlock(); joinRoom(); };
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
window.addEventListener('beforeunload', e => { if (G.online && G.inGame) { e.preventDefault(); e.returnValue = ''; } });
Setup.load();
