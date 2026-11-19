/* ==========================================================
   Anime Quiz Champion — game logic
   ========================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEYS = ['a', 'p', 'v', 'm'];
const COLORS = ['#ff4d6d', '#4dabff', '#ffd43b', '#69db7c'];

const G = {
  players: [],
  settings: {},
  bank: null,
  round: null,
  gen: 0,          // incremented on quit, cancels pending async work
  timers: new Set(),
  override: null,  // token for the "C'était bon !" button
};

/* ---------------- Sound (WebAudio, no files) ---------------- */
const Sound = (() => {
  let ctx;
  function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
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
    buzz() { tone(240, 0.3, 'square', 0.12); },
    good() { tone(660, 0.12, 'sine', 0.2); tone(990, 0.22, 'sine', 0.2, 0.12); },
    bad() { tone(160, 0.4, 'sawtooth', 0.1); },
    reveal() { tone(520, 0.08, 'triangle', 0.1); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, i * 0.15)); },
  };
})();

/* ---------------- Timer ---------------- */
class Timer {
  constructor(ms, onEnd, onTick) {
    this.total = ms; this.left = ms;
    this.onEnd = onEnd; this.onTick = onTick;
    this.running = false; this.id = null;
    G.timers.add(this);
  }
  start() {
    if (this.running || this.left <= 0) return this;
    this.running = true;
    this.last = performance.now();
    this.id = setInterval(() => this._step(), 50);
    if (this.onTick) this.onTick(this);
    return this;
  }
  _step() {
    const now = performance.now();
    this.left -= now - this.last; this.last = now;
    if (this.left <= 0) {
      this.left = 0; this.stop();
      if (this.onTick) this.onTick(this);
      if (this.onEnd) this.onEnd();
      return;
    }
    if (this.onTick) this.onTick(this);
  }
  pause() {
    if (!this.running) return;
    this.left = Math.max(1, this.left - (performance.now() - this.last));
    clearInterval(this.id); this.running = false;
  }
  stop() { clearInterval(this.id); this.running = false; G.timers.delete(this); }
  get frac() { return this.left / this.total; }
}
function stopAllTimers() { [...G.timers].forEach(t => t.stop()); }

/* ---------------- UI helpers ---------------- */
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function setStatus(html) { $('#status').innerHTML = html || ''; }
function setQInfo(html) { $('#qInfo').innerHTML = html || ''; }
function setBar(frac, mode) {
  const bar = $('#timerBar div');
  bar.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  bar.className = (mode === 'answer' ? 'answer ' : '') + (frac < 0.25 ? 'low' : '');
}
function setGrid(q, revealed = 4) {
  $$('#grid .cell').forEach((cell, i) => {
    const img = cell.querySelector('img');
    if (q && i < revealed) {
      const im = q.images[i];
      if (img.getAttribute('src') !== im.url) img.src = im.url;
      cell.classList.toggle('scene', im.kind === 'scene');
      cell.classList.add('shown');
    } else {
      cell.classList.remove('shown', 'scene');
      img.removeAttribute('src');
    }
  });
}
function flash(kind) {
  const g = $('#grid');
  g.classList.remove('flash-good', 'flash-bad');
  void g.offsetWidth;
  g.classList.add('flash-' + kind);
}

let toastTimeout;
function toast(html, opts = {}) {
  const t = $('#toast');
  clearTimeout(toastTimeout);
  t.innerHTML = `<span>${html}</span>` + (opts.action ? `<button class="btn small gold">${esc(opts.action)}</button>` : '');
  t.className = 'toast ' + (opts.kind || '');
  if (opts.action) {
    t.querySelector('button').onclick = () => { hideToast(); opts.onAction(); };
  }
  toastTimeout = setTimeout(hideToast, opts.ms || 2200);
}
function hideToast() { clearTimeout(toastTimeout); $('#toast').className = 'toast hidden'; }

function showOverlay(html, onGo) {
  const o = $('#overlay');
  o.innerHTML = `<div class="overlay-card">${html}</div>`;
  o.classList.remove('hidden');
  const btn = o.querySelector('[data-enter]');
  if (btn) { btn.onclick = onGo; setTimeout(() => btn.focus(), 50); }
}
function hideOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').innerHTML = ''; }

function renderScores(players, { score, badge, cls }) {
  $('#scoreboard').innerHTML = players.map(p => {
    const classes = (cls ? cls(p) : []).filter(Boolean).join(' ');
    return `<button class="pcard ${classes}" data-id="${p.id}" style="--c:${p.color}">
        <kbd>${p.key.toUpperCase()}</kbd>
        <span class="pname">${esc(p.name)}</span>
        <span class="pscore">${score(p)}</span>
        <span class="pbadge">${badge ? badge(p) || '' : ''}</span>
      </button>`;
  }).join('');
  $$('#scoreboard .pcard').forEach(el => {
    el.onclick = () => buzz(G.players.find(p => p.id === +el.dataset.id));
  });
}

function revealPanel(media, msg, kind, nextLabel, onNext, keep) {
  const romaji = media.title.romaji && media.title.romaji !== media.display ? media.title.romaji : '';
  const cover = (media.coverImage && (media.coverImage.large || media.coverImage.extraLarge)) || '';
  const html = `
    <div class="reveal ${kind}">
      ${cover ? `<img src="${esc(cover)}" alt="" />` : ''}
      <div>
        <div class="rmsg">${msg}</div>
        <div class="rtitle">${esc(media.display)}</div>
        ${romaji ? `<div class="rsub">${esc(romaji)}</div>` : ''}
      </div>
    </div>
    <button id="nextBtn" class="btn primary" data-enter>${nextLabel} ▶</button>`;
  const area = $('#answerArea');
  if (keep) area.insertAdjacentHTML('afterbegin', html); else area.innerHTML = html;
  $('#nextBtn').onclick = onNext;
  setTimeout(() => $('#nextBtn') && $('#nextBtn').focus(), 30);
}

function answerForm(placeholder, onSubmit, withPass) {
  $('#answerArea').innerHTML = `
    <form id="ansForm" class="ans-form" autocomplete="off">
      <input id="ansInput" type="text" placeholder="${esc(placeholder)}" spellcheck="false" autocapitalize="off" />
      <button class="btn primary" type="submit">Valider</button>
      ${withPass ? '<button type="button" id="passBtn" class="btn ghost">Passer</button>' : ''}
    </form>`;
  $('#ansForm').onsubmit = e => { e.preventDefault(); onSubmit($('#ansInput').value); };
  if (withPass) $('#passBtn').onclick = () => onSubmit(null);
  setTimeout(() => $('#ansInput') && $('#ansInput').focus(), 30);
}

const activePlayers = () => G.players.filter(p => !p.eliminated);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

async function loadQuestion() {
  const gen = G.gen;
  setStatus('<span class="dots">Chargement de la question</span>');
  try {
    const q = await G.bank.next();
    if (gen !== G.gen) return undefined; // cancelled
    return q;
  } catch (e) {
    if (gen === G.gen) fatal(e);
    return undefined;
  }
}

function buzz(p) {
  if (p && G.round && G.round.onBuzz) G.round.onBuzz(p);
}

/* ==========================================================
   ROUND 1 — Préliminaire : 9 points gagnants (QCM + buzzer)
   ========================================================== */
const Prelim = {
  step: 'Manche 1',
  title: 'Préliminaire',
  subtitle: '9 points gagnants',
  rules: [
    '4 images, 1 animé : buzzez dès que vous avez trouvé !',
    'Après le buzz : 8 secondes pour choisir parmi 4 réponses (touches 1 à 4).',
    'Questions 1-3 : 1 point · 4-6 : 2 points · ensuite : 3 points.',
    'Mauvaise réponse = vous êtes bloqué, les autres peuvent buzzer.',
    'Premier à 9 points = qualifié (et +1 point bonus en finale).',
  ],
  canSkip: true,

  begin() {
    this.players = activePlayers();
    this.players.forEach(p => { p.r1 = 0; p.qualified = false; });
    this.order = [];
    this.qCount = 0;
    this.q = null;
    this.locked = new Set();
    this.next();
  },
  extraRules() {
    return this.players && this.players.length >= 3
      ? ['À ' + activePlayers().length + ' joueurs, le dernier non qualifié est éliminé.']
      : [];
  },
  eligible(p) { return this.players.includes(p) && !p.qualified && !this.locked.has(p.id); },
  render() {
    renderScores(this.players, {
      score: p => `${p.r1}<small> / 9</small>`,
      badge: p => p.qualified ? 'Qualifié ✔' : this.locked.has(p.id) ? 'Bloqué' : '',
      cls: p => [p.qualified && 'qualified', this.locked.has(p.id) && 'locked', this.buzzer === p && 'buzzed'],
    });
  },
  valueFor(n) { return n <= 3 ? 1 : n <= 6 ? 2 : 3; },

  async next() {
    this.state = 'loading';
    this.buzzer = null;
    this.locked = new Set();
    $('#answerArea').innerHTML = '';
    setGrid(null, 0); setBar(1);
    this.render();
    const q = await loadQuestion();
    if (q === undefined) return;
    if (q === null) return this.end('Plus de questions disponibles !');
    this.q = q;
    this.qCount++;
    this.value = this.valueFor(this.qCount);
    this.wrongChoices = new Set();
    q.choices = shuffle([q.media, ...G.bank.distractors(q.media)]);
    setGrid(q, 4);
    setQInfo(`Question ${this.qCount} · <b>${plural(this.value, 'point')}</b>`);
    this.renderChoices();
    this.state = 'open';
    setStatus('Buzzez quand vous avez trouvé !');
    this.render();
    this.qTimer = new Timer(20000, () => this.timeUp(), t => setBar(t.frac)).start();
  },

  renderChoices() {
    $('#answerArea').innerHTML = `<div class="choices">${this.q.choices.map((m, i) =>
      `<button class="choice" data-i="${i}"><kbd>${i + 1}</kbd><span>${esc(m.display)}</span></button>`).join('')}</div>`;
    $$('#answerArea .choice').forEach(b => { b.onclick = () => this.choose(+b.dataset.i); });
    this.updateChoices();
  },
  updateChoices() {
    $$('#answerArea .choice').forEach(b => {
      const i = +b.dataset.i;
      b.classList.toggle('armed', this.state === 'answering');
      b.classList.toggle('wrong', this.wrongChoices.has(i));
      b.disabled = this.wrongChoices.has(i) || this.state === 'reveal';
      if (this.state === 'reveal' && this.q.choices[i].id === this.q.media.id) b.classList.add('right');
    });
  },

  onBuzz(p) {
    if (this.state !== 'open' || !this.eligible(p)) return;
    Sound.buzz();
    this.state = 'answering';
    this.buzzer = p;
    this.qTimer.pause();
    setStatus(`<b style="color:${p.color}">${esc(p.name)}</b> a buzzé ! Choisis ta réponse (1-4)`);
    this.aTimer = new Timer(8000, () => this.wrong(null), t => setBar(t.frac, 'answer')).start();
    this.render(); this.updateChoices();
  },
  onChoiceKey(n) { this.choose(n - 1); },
  choose(i) {
    if (this.state === 'open') { toast("Buzzez d'abord !"); return; }
    if (this.state !== 'answering' || this.wrongChoices.has(i) || !this.q.choices[i]) return;
    this.aTimer.stop();
    if (this.q.choices[i].id === this.q.media.id) this.correct(); else this.wrong(i);
  },
  correct() {
    const p = this.buzzer;
    Sound.good(); flash('good');
    p.r1 += this.value;
    if (p.r1 >= 9 && !p.qualified) { p.qualified = true; this.order.push(p); }
    this.stopTimers();
    this.state = 'reveal';
    this.buzzer = null;
    const done = this.isOver();
    this.render(); this.updateChoices();
    setStatus(p.qualified && done ? '' : p.qualified ? `<b>${esc(p.name)}</b> est qualifié(e) !` : '');
    revealPanel(this.q.media, `✔ ${esc(p.name)} +${plural(this.value, 'point')}`, 'good',
      done ? 'Résultats' : 'Question suivante', () => done ? this.end() : this.next(), true);
  },
  wrong(i) {
    const p = this.buzzer;
    Sound.bad(); flash('bad');
    this.locked.add(p.id);
    if (i != null) this.wrongChoices.add(i);
    this.buzzer = null;
    toast(i == null ? `⏱ ${esc(p.name)} trop lent !` : `✘ Mauvaise réponse pour ${esc(p.name)}`, { kind: 'bad' });
    if (this.players.some(x => this.eligible(x))) {
      this.state = 'open';
      setStatus('Les autres peuvent encore buzzer !');
      this.qTimer.start();
      this.render(); this.updateChoices();
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
    setStatus('');
    this.render(); this.updateChoices();
    revealPanel(this.q.media, msg, 'neutral', 'Question suivante', () => this.next(), true);
  },
  stopTimers() { if (this.qTimer) this.qTimer.stop(); if (this.aTimer) this.aTimer.stop(); },
  isOver() {
    const unq = this.players.filter(p => !p.qualified);
    return this.players.length >= 3 ? unq.length <= 1 : unq.length < this.players.length;
  },
  end(reason) {
    this.stopTimers();
    this.state = 'done';
    const rest = this.players.filter(p => !p.qualified).sort((a, b) => b.r1 - a.r1);
    const ranking = [...this.order, ...rest];
    let eliminated = null;
    if (this.players.length >= 3) { eliminated = ranking[ranking.length - 1]; eliminated.eliminated = true; }
    const winner = ranking[0];
    winner.bonus += 1;
    showRoundEnd({
      step: this.step, title: 'Résultats du préliminaire',
      rows: ranking.map(p => [p, `${p.r1} pts`, p === eliminated ? '<span class="out">Éliminé(e)</span>' : p.qualified ? 'Qualifié(e) ✔' : 'Repêché(e)']),
      msg: [reason, `${esc(winner.name)} gagne <b>+1 point</b> d'avance pour la finale.`,
        eliminated ? `${esc(eliminated.name)} est éliminé(e). Merci d'avoir joué !` : ''].filter(Boolean).join('<br>'),
      next: Semi,
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
  rules: [
    'Chacun son tour : 60 secondes au chrono.',
    'Tape le nom de l\'animé (anglais ou japonais, les petites fautes passent).',
    'Objectif : 4 bonnes réponses d\'affilée. Erreur ou « Passer » = série remise à zéro.',
    'Classement : meilleure série, puis temps restant, puis nombre de bonnes réponses.',
    'Le vainqueur gagne +2 points d\'avance en finale.',
  ],
  canSkip: false,
  extraRules() {
    return activePlayers().length > 2 ? ['Le dernier de la demi-finale est éliminé.'] : [];
  },

  begin() {
    this.players = activePlayers().sort((a, b) => (a.r1 || 0) - (b.r1 || 0));
    this.players.forEach(p => { p.r2 = { best: 0, streak: 0, correct: 0, timeLeft: 0, done: false }; });
    this.turn = -1;
    this.cur = null;
    this.nextTurn();
  },
  render() {
    renderScores(this.players, {
      score: p => `${p.r2.best}<small> / 4</small>`,
      badge: p => p === this.cur && !p.r2.done ? 'À toi !' : p.r2.done ? 'Terminé' : 'En attente',
      cls: p => [p === this.cur && !p.r2.done && 'buzzed', p.r2.done && 'done'],
    });
  },
  renderStreak() {
    const s = this.cur ? this.cur.r2.streak : 0;
    let el = $('#streak');
    if (!el) {
      el = document.createElement('div');
      el.id = 'streak'; el.className = 'streak';
      $('#answerArea').prepend(el);
    }
    el.innerHTML = [0, 1, 2, 3].map(i => `<span class="${i < s ? 'on' : ''}"></span>`).join('') + `<b>${s}/4</b>`;
  },

  nextTurn() {
    this.turn++;
    if (this.turn >= this.players.length) return this.end();
    this.cur = this.players[this.turn];
    this.state = 'intro';
    this.q = null;
    setGrid(null, 0); setBar(1); setStatus('');
    $('#answerArea').innerHTML = '';
    setQInfo(`Joueur ${this.turn + 1} / ${this.players.length}`);
    this.render();
    showOverlay(`
      <h3 style="color:${this.cur.color}">${esc(this.cur.name)}</h3>
      <p>60 secondes pour enchaîner <b>4 bonnes réponses</b> d'affilée.</p>
      <p class="small">Les autres : pas de souffle 🤫</p>
      <button class="btn primary big" data-enter>Je suis prêt(e) !</button>`, () => this.startTurn());
  },
  startTurn() {
    hideOverlay();
    this.chrono = new Timer(60000, () => this.timeUp(), t => {
      setBar(t.frac);
      setQInfo(`${esc(this.cur.name)} · ⏱ <b>${Math.ceil(t.left / 1000)} s</b>`);
    });
    answerForm("Nom de l'animé…", v => this.submit(v), true);
    this.renderStreak();
    this.render();
    this.next();
  },
  async next() {
    this.state = 'loading';
    this.chrono.pause();
    const input = $('#ansInput');
    if (input) input.disabled = true;
    const q = await loadQuestion();
    if (q === undefined) return;
    if (this.state !== 'loading') return;
    if (q === null) return this.finishTurn('Plus de questions disponibles !');
    this.q = q;
    setGrid(q, 4);
    setStatus('Quel est cet animé ?');
    this.state = 'open';
    if (input) { input.disabled = false; input.value = ''; input.focus(); }
    this.chrono.start();
  },
  submit(text) {
    if (this.state !== 'open') return;
    if (text != null && !text.trim()) return;
    const p = this.cur, r = p.r2, media = this.q.media;
    const tok = G.override = {};
    if (text != null && Match.isCorrect(text, media)) {
      Sound.good(); flash('good');
      r.streak++; r.correct++; r.best = Math.max(r.best, r.streak);
      toast(`✔ ${esc(media.display)}`, { kind: 'good', ms: 1300 });
      if (r.streak >= 4) { r.timeLeft = this.chrono.left; this.renderStreak(); return this.finishTurn('🔥 4 à la suite !'); }
    } else {
      Sound.bad(); flash('bad');
      const prev = r.streak;
      r.streak = 0;
      if (text == null) {
        toast(`Passé — c'était <b>${esc(media.display)}</b>`, { ms: 2500 });
      } else {
        toast(`✘ « ${esc(text)} » — c'était <b>${esc(media.display)}</b>`, {
          kind: 'bad', ms: 4000, action: "C'était bon !",
          onAction: () => {
            if (G.override !== tok || this.cur !== p || r.done) return;
            r.streak = prev + 1; r.correct++; r.best = Math.max(r.best, r.streak);
            Sound.good(); this.renderStreak(); this.render();
            if (r.streak >= 4) { r.timeLeft = this.chrono.left; this.finishTurn('🔥 4 à la suite !'); }
          },
        });
      }
    }
    this.renderStreak(); this.render();
    this.next();
  },
  timeUp() { if (this.state === 'open' || this.state === 'loading') this.finishTurn('⏱ Temps écoulé !'); },
  finishTurn(msg) {
    const p = this.cur, r = p.r2;
    const pending = this.state === 'open' && this.q && !msg.startsWith('🔥') ? this.q.media : null;
    this.state = 'done';
    this.chrono.stop();
    r.done = true;
    G.override = null;
    hideToast();
    const input = $('#ansInput'); if (input) input.disabled = true;
    setStatus('');
    this.render();
    const last = this.turn === this.players.length - 1;
    showOverlay(`
      <h3>${msg}</h3>
      <p><b style="color:${p.color}">${esc(p.name)}</b> : meilleure série <b>${r.best}/4</b> · ${plural(r.correct, 'bonne réponse')}</p>
      ${r.best >= 4 ? `<p class="small">Il restait ${Math.ceil(r.timeLeft / 1000)} s au chrono</p>` : ''}
      ${pending ? `<p class="small">La dernière question était : <b>${esc(pending.display)}</b></p>` : ''}
      <button class="btn primary big" data-enter>${last ? 'Résultats' : 'Joueur suivant'}</button>`,
    () => { hideOverlay(); this.nextTurn(); });
  },
  end() {
    this.state = 'over';
    const ranking = this.players.slice().sort((a, b) =>
      (b.r2.best - a.r2.best) || (b.r2.timeLeft - a.r2.timeLeft) || (b.r2.correct - a.r2.correct));
    let eliminated = null;
    if (ranking.length > 2) { eliminated = ranking[ranking.length - 1]; eliminated.eliminated = true; }
    const winner = ranking[0];
    winner.bonus += 2;
    this.cur = null;
    showRoundEnd({
      step: this.step, title: 'Résultats de la demi-finale',
      rows: ranking.map(p => [p, `série ${p.r2.best}/4 · ${p.r2.correct} ✔`, p === eliminated ? '<span class="out">Éliminé(e)</span>' : 'Finaliste ✔']),
      msg: [`${esc(winner.name)} gagne <b>+2 points</b> d'avance pour la finale.`,
        eliminated ? `${esc(eliminated.name)} est éliminé(e).` : ''].filter(Boolean).join('<br>'),
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
      'Les images apparaissent une par une, toutes les 5 secondes.',
      'Buzz avec 1 image = 4 pts · 2 images = 3 pts · 3 images = 2 pts · 4 images = 1 pt.',
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
    this.next();
  },
  render() {
    renderScores(this.players, {
      score: p => `${p.r3}<small> / ${this.target}</small>`,
      badge: p => this.locked.has(p.id) ? 'Bloqué' : '',
      cls: p => [this.locked.has(p.id) && 'locked', this.buzzer === p && 'buzzed'],
    });
  },
  eligible(p) { return this.players.includes(p) && !this.locked.has(p.id); },
  value() { return 5 - this.revealed; },

  async next() {
    this.state = 'loading';
    this.buzzer = null;
    this.locked = new Set();
    this.awarded = false;
    G.override = null;
    $('#answerArea').innerHTML = '';
    setGrid(null, 0); setBar(1);
    this.render();
    const q = await loadQuestion();
    if (q === undefined) return;
    if (q === null) {
      const best = this.players.slice().sort((a, b) => b.r3 - a.r3)[0];
      toast('Plus de questions disponibles : victoire au score !');
      return this.end(best);
    }
    this.q = q;
    this.qCount++;
    this.revealed = 0;
    this.state = 'open';
    setStatus('Buzzez ! Plus tôt = plus de points');
    this.revealNext();
  },
  revealNext() {
    this.revealed++;
    Sound.reveal();
    setGrid(this.q, this.revealed);
    this.updateInfo();
    const ms = this.revealed < 4 ? 5000 : 8000;
    this.step = new Timer(ms, () => {
      if (this.revealed < 4) this.revealNext();
      else this.reveal('⏱ Personne n\'a trouvé…');
    }, t => setBar(t.frac));
    this.step.start();
  },
  updateInfo() {
    setQInfo(`Question ${this.qCount} · ${plural(this.revealed, 'image')} · <b>${plural(this.value(), 'point')}</b>`);
  },
  onBuzz(p) {
    if (this.state !== 'open' || !this.eligible(p)) return;
    Sound.buzz();
    this.state = 'answering';
    this.buzzer = p;
    this.buzzValue = this.value();
    this.step.pause();
    setStatus(`<b style="color:${p.color}">${esc(p.name)}</b> buzze pour <b>${plural(this.buzzValue, 'point')}</b> ! Tape ta réponse`);
    answerForm("Nom de l'animé…", v => this.answer(v), false);
    this.aTimer = new Timer(15000, () => this.answer(''), t => setBar(t.frac, 'answer')).start();
    this.render();
  },
  answer(text) {
    if (this.state !== 'answering') return;
    this.aTimer.stop();
    const p = this.buzzer, v = this.buzzValue, media = this.q.media;
    if (text && Match.isCorrect(text, media)) return this.correct(p, v);
    Sound.bad(); flash('bad');
    this.locked.add(p.id);
    this.buzzer = null;
    $('#answerArea').innerHTML = '';
    const tok = G.override = {};
    if (text && text.trim()) {
      toast(`✘ ${esc(p.name)} : « ${esc(text)} » refusé`, {
        kind: 'bad', ms: 4500, action: "C'était bon !",
        onAction: () => {
          if (G.override !== tok || this.awarded) return;
          if (this.aTimer) this.aTimer.stop();
          this.correct(p, v);
        },
      });
    } else {
      toast(`⏱ ${esc(p.name)} trop lent !`, { kind: 'bad' });
    }
    if (this.players.some(x => this.eligible(x))) {
      this.state = 'open';
      setStatus('À l\'adversaire de tenter sa chance !');
      this.step.start();
      this.render();
    } else {
      this.reveal('Personne n\'a trouvé…');
    }
  },
  correct(p, v) {
    this.stopTimers();
    this.awarded = true;
    this.state = 'reveal';
    this.buzzer = null;
    Sound.good(); flash('good');
    p.r3 += v;
    setGrid(this.q, 4);
    setStatus('');
    const won = p.r3 >= this.target;
    this.render();
    revealPanel(this.q.media, `✔ ${esc(p.name)} +${plural(v, 'point')}`, 'good',
      won ? '🏆 Voir le champion' : 'Question suivante', () => won ? this.end(p) : this.next());
  },
  reveal(msg) {
    this.stopTimers();
    this.state = 'reveal';
    this.buzzer = null;
    setGrid(this.q, 4);
    setStatus('');
    this.render();
    revealPanel(this.q.media, msg, 'neutral', 'Question suivante', () => this.next());
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
   Screens & flow
   ========================================================== */
function showIntro(round) {
  stopAllTimers(); hideToast(); hideOverlay();
  G.round = null;
  const players = activePlayers();
  round.players = players;
  $('#introStep').textContent = round.step;
  $('#introTitle').textContent = round.title;
  $('#introSubtitle').textContent = round.subtitle;
  $('#introRules').innerHTML = [...round.rules, ...(round.extraRules ? round.extraRules() : [])].map(r => `<li>${esc(r)}</li>`).join('');
  $('#introPlayers').innerHTML = players.map(p =>
    `<span class="chip" style="--c:${p.color}"><kbd>${p.key.toUpperCase()}</kbd>${esc(p.name)}</span>`).join('');
  $('#introGo').onclick = () => {
    show('play');
    $('#roundLabel').innerHTML = `<span>${round.step}</span> ${round.title} <em>${round.subtitle}</em>`;
    $('#skipBtn').style.display = round.canSkip ? '' : 'none';
    setQInfo(''); setStatus('');
    G.round = round;
    round.begin();
  };
  show('intro');
  setTimeout(() => $('#introGo').focus(), 50);
}

function showRoundEnd({ step, title, rows, msg, next }) {
  stopAllTimers(); hideToast(); hideOverlay();
  G.round = null;
  $('#endStep').textContent = step;
  $('#endTitle').textContent = title;
  $('#endTable').innerHTML = rows.map(([p, score, status], i) =>
    `<tr class="${p.eliminated ? 'elim' : ''}"><td>${i + 1}</td><td style="color:${p.color}"><b>${esc(p.name)}</b></td><td>${score}</td><td>${status}</td></tr>`).join('');
  $('#endMsg').innerHTML = msg;
  $('#endNext').textContent = next === Final ? 'Place à la finale !' : 'Manche suivante';
  $('#endNext').onclick = () => showIntro(next);
  show('roundEnd');
  setTimeout(() => $('#endNext').focus(), 50);
}

function showChampion(winner, finalists) {
  stopAllTimers(); hideToast(); hideOverlay();
  G.round = null;
  Sound.win();
  $('#champName').textContent = winner.name;
  $('#champName').style.color = winner.color;
  $('#champScore').innerHTML = finalists.map(p => `${esc(p.name)} : <b>${p.r3}</b>`).join(' · ');
  show('champion');
  confetti();
  setTimeout(() => $('#replaySame').focus(), 50);
}

function fatal(e) {
  console.error(e);
  quitToHome();
  $('#homeError').textContent = (e && e.message) || 'Erreur inconnue';
}

function quitToHome() {
  G.gen++;
  stopAllTimers(); hideToast(); hideOverlay();
  G.round = null;
  show('home');
}

/* ---------------- Home / setup ---------------- */
const Setup = {
  names: [],
  load() {
    try { this.names = JSON.parse(localStorage.getItem('aqc-names')) || []; } catch (e) { this.names = []; }
    if (this.names.length < 2) this.names = ['Joueur 1', 'Joueur 2'];
    const s = JSON.parse(localStorage.getItem('aqc-settings') || '{}');
    if (s.difficulty) $('#difficulty').value = s.difficulty;
    if (s.target) $('#finalTarget').value = s.target;
    this.render();
  },
  render() {
    $('#playerInputs').innerHTML = this.names.map((n, i) => `
      <div class="pinput" style="--c:${COLORS[i]}">
        <kbd>${KEYS[i].toUpperCase()}</kbd>
        <input data-i="${i}" value="${esc(n)}" maxlength="16" />
        ${this.names.length > 2 ? `<button class="btn ghost small" data-rm="${i}" title="Retirer">✕</button>` : ''}
      </div>`).join('');
    $$('#playerInputs input').forEach(inp => { inp.oninput = () => { this.names[+inp.dataset.i] = inp.value; }; });
    $$('#playerInputs [data-rm]').forEach(b => { b.onclick = () => { this.names.splice(+b.dataset.rm, 1); this.render(); }; });
    $('#addPlayer').style.display = this.names.length >= 4 ? 'none' : '';
  },
};

async function startGame() {
  $('#homeError').textContent = '';
  const names = Setup.names.map((n, i) => (n || '').trim() || `Joueur ${i + 1}`);
  G.settings = { difficulty: $('#difficulty').value, target: +$('#finalTarget').value };
  localStorage.setItem('aqc-names', JSON.stringify(names));
  localStorage.setItem('aqc-settings', JSON.stringify(G.settings));
  G.players = names.map((name, i) => ({ id: i, name, color: COLORS[i], key: KEYS[i], eliminated: false, bonus: 0 }));

  const gen = ++G.gen;
  show('loading');
  $('#loadingText').textContent = 'Chargement des animés depuis AniList…';
  try {
    const pool = await API.loadPool(G.settings.difficulty);
    if (gen !== G.gen) return;
    G.bank = new QuestionBank(pool);
    $('#loadingText').textContent = 'Préparation des images…';
    await G.bank.fill();
    if (gen !== G.gen) return;
    G.bank.ready.slice(0, 2).forEach(q => q.images.forEach(i => preloadImage(i.url)));
  } catch (e) {
    if (gen === G.gen) fatal(e);
    return;
  }
  showIntro(Prelim);
}

/* ---------------- Keyboard ---------------- */
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const key = e.key.toLowerCase();

  if (key === 'enter' || key === ' ') {
    const screen = $('.screen.active');
    const btn = [...screen.querySelectorAll('[data-enter], #introGo, #endNext, #replaySame')]
      .find(b => b.offsetParent !== null && !b.disabled);
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }
  if (e.repeat) return;
  const idx = KEYS.indexOf(key);
  if (idx >= 0 && G.round) { buzz(G.players[idx]); return; }
  if (/^[1-4]$/.test(key) && G.round && G.round.onChoiceKey) G.round.onChoiceKey(+key);
});

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
$('#addPlayer').onclick = () => { if (Setup.names.length < 4) { Setup.names.push(`Joueur ${Setup.names.length + 1}`); Setup.render(); } };
$('#startBtn').onclick = startGame;
$('#quitBtn').onclick = () => { if (confirm('Quitter la partie en cours ?')) quitToHome(); };
$('#skipBtn').onclick = () => { if (G.round && G.round.skip) G.round.skip(); };
$('#replaySame').onclick = startGame;
$('#backHome').onclick = quitToHome;
Setup.load();
