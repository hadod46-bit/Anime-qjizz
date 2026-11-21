/* ==========================================================
   Durak (podkidnoy) — online card game
   ----------------------------------------------------------
   The HOST runs the game (deck, hands, rules, bots) and sends
   each player a personal view (their own hand only). Guests
   send their moves back. Solo mode = host with bots, no network.
   ========================================================== */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['Pique', 'Cœur', 'Carreau', 'Trèfle'];
  const RED = s => s === 1 || s === 2;
  const RANK = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
  const COLORS = ['#ff4d6d', '#4dabff', '#ffd43b', '#69db7c', '#b197fc', '#ff922b'];
  const BOT_NAMES = ['Ivan', 'Olga', 'Sasha', 'Nadia', 'Boris', 'Mila'];
  const MAX_PLAYERS = 6, HAND = 6, MAX_TABLE = 6;
  const PREFIX = 'anime-quiz-durak-';
  const FAST = /[?&]fast=1/.test(location.search);   // automated tests only

  const beats = (a, d, trump) => (d.s === a.s && d.r > a.r) || (d.s === trump && a.s !== trump);
  const cardName = c => `${RANK[c.r]}${SUITS[c.s]}`;

  /* ---------------- Sound ---------------- */
  let actx;
  function tone(f, d, type = 'sine', v = 0.12, delay = 0) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* no audio */ }
  }
  const Sound = {
    card() { tone(900, 0.05, 'triangle', 0.08); },
    take() { tone(220, 0.25, 'sawtooth', 0.07); },
    bito() { tone(600, 0.1, 'sine', 0.1); tone(800, 0.12, 'sine', 0.1, 0.1); },
    turn() { tone(700, 0.08, 'sine', 0.08); tone(1050, 0.1, 'sine', 0.08, 0.09); },
    end() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, i * 0.14)); },
  };

  /* ==========================================================
     State
     ========================================================== */
  const G = {
    isHost: true, online: false, me: 0,
    peer: null, hostConn: null, code: '',
    players: [],          // host: {id, name, color, bot, conn, offline, hand, out, durak}
    nextId: 0,
    game: null,          // host only
    view: null,          // what this device shows
    timers: { resolve: null, bot: null },
  };
  const byId = id => G.players.find(p => p.id === id);

  /* ==========================================================
     Game engine (host)
     ========================================================== */
  function newDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 6; r <= 14; r++) d.push({ s, r, id: `${r}-${s}` });
    return shuffle(d);
  }

  function startGame() {
    if (!G.isHost) return;
    const seats = G.players.filter(p => !p.offline);
    if (seats.length < 2) return lobbyError('Il faut au moins 2 joueurs (ajoute un bot 🤖).');
    G.players = seats;
    clearTimeout(G.timers.resolve); clearTimeout(G.timers.bot);
    const deck = newDeck();
    const g = {
      deck, trump: deck[0].s, trumpCard: deck[0], table: [], discard: 0,
      attacker: null, defender: null, passed: new Set(), taking: false,
      phase: 'play', finished: [], durak: null, log: [], seq: 0,
    };
    G.game = g;
    G.players.forEach(p => { p.hand = []; p.out = false; });
    for (let i = 0; i < HAND; i++) G.players.forEach(p => p.hand.push(deck.pop()));
    // lowest trump starts
    let best = null;
    G.players.forEach(p => p.hand.forEach(c => { if (c.s === g.trump && (!best || c.r < best.c.r)) best = { p, c }; }));
    g.attacker = best ? best.p.id : G.players[(Math.random() * G.players.length) | 0].id;
    g.defender = nextActive(g.attacker);
    log(best ? `${best.p.name} a le plus petit atout (${cardName(best.c)}) et attaque.` : `${byId(g.attacker).name} attaque.`);
    G.screen = 'game';
    update();
  }

  const isOut = id => { const p = byId(id); return !p || p.out; };
  function nextActive(id) {
    const n = G.players.length;
    let i = G.players.findIndex(p => p.id === id);
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (!G.players[i].out && G.players[i].id !== id) return G.players[i].id;
    }
    return null;
  }
  const activePlayers = () => G.players.filter(p => !p.out);
  const attackers = () => activePlayers().filter(p => p.id !== G.game.defender);
  const unbeaten = () => G.game.table.filter(t => !t.d).length;
  const tableRanks = () => new Set(G.game.table.flatMap(t => (t.d ? [t.a.r, t.d.r] : [t.a.r])));
  function log(msg) { G.game.log.push(msg); if (G.game.log.length > 30) G.game.log.shift(); }

  /** Can player p put card c on the table as an attack / throw-in? */
  function canThrowCard(p, c) {
    const g = G.game;
    if (!g || g.phase !== 'play' || p.out || p.id === g.defender) return false;
    const def = byId(g.defender);
    if (!def) return false;
    if (g.table.length >= MAX_TABLE || unbeaten() >= def.hand.length) return false;
    if (!g.table.length) return p.id === g.attacker;
    return tableRanks().has(c.r);
  }
  const canThrow = p => p.hand.some(c => canThrowCard(p, c));
  /** Indexes of table cards that card c can beat (defender only). */
  function defendTargets(p, c) {
    const g = G.game;
    if (!g || g.phase !== 'play' || p.id !== g.defender || g.taking) return [];
    return g.table.map((t, i) => (!t.d && beats(t.a, c, g.trump) ? i : -1)).filter(i => i >= 0);
  }

  /** A player's move. Returns true if it was valid. */
  function act(pid, a, data = {}) {
    const g = G.game, p = byId(pid);
    if (!g || g.phase !== 'play' || !p || p.out) return false;
    const card = data.card && p.hand.find(c => c.id === data.card);
    if (a === 'play' && card) {
      if (pid === g.defender) {
        const targets = defendTargets(p, card);
        const idx = targets.includes(data.idx) ? data.idx : targets.length === 1 ? targets[0] : -1;
        if (idx < 0) return false;
        g.table[idx].d = card;
        p.hand = p.hand.filter(c => c !== card);
        log(`${p.name} bat ${cardName(g.table[idx].a)} avec ${cardName(card)}.`);
      } else {
        if (!canThrowCard(p, card)) return false;
        g.table.push({ a: card, d: null, by: pid });
        p.hand = p.hand.filter(c => c !== card);
        g.passed.clear();
        log(`${p.name} ${g.table.length === 1 ? 'attaque' : 'ajoute'} ${cardName(card)}.`);
      }
      G.sfx = 'card';
    } else if (a === 'take') {
      if (pid !== g.defender || g.taking || !unbeaten()) return false;
      g.taking = true;
      g.passed.clear();
      log(`${p.name} prend…`);
      G.sfx = 'take';
    } else if (a === 'pass') {
      if (pid === g.defender || !g.table.length || g.passed.has(pid)) return false;
      g.passed.add(pid);
    } else return false;
    g.seq++;
    update();
    return true;
  }

  /** End of a bout when everyone is done (with a short pause so players can see the last card). */
  function checkResolve() {
    const g = G.game;
    clearTimeout(G.timers.resolve);
    if (!g || g.phase !== 'play' || !g.table.length) return;
    const allBeaten = g.table.every(t => t.d);
    const done = attackers().every(p => g.passed.has(p.id) || !canThrow(p));
    if ((g.taking || allBeaten) && done) {
      const seq = g.seq;
      G.timers.resolve = setTimeout(() => { if (G.game === g && g.seq === seq) endBout(g.taking); }, FAST ? 5 : 1300);
    }
  }

  function endBout(took) {
    const g = G.game;
    const def = byId(g.defender);
    const cards = g.table.flatMap(t => (t.d ? [t.a, t.d] : [t.a]));
    if (took) { def.hand.push(...cards); log(`${def.name} ramasse ${cards.length} cartes.`); G.sfx = 'take'; }
    else { g.discard += cards.length; log('Bito ! Les cartes sont défaussées.'); G.sfx = 'bito'; }
    g.table = []; g.passed.clear(); g.taking = false;

    // draw: main attacker, the other attackers clockwise, defender last
    const order = [];
    let id = g.attacker;
    for (let k = 0; k < G.players.length; k++) {
      if (id !== g.defender && !order.includes(id)) order.push(id);
      const i = G.players.findIndex(p => p.id === id);
      id = G.players[(i + 1) % G.players.length].id;
    }
    order.push(g.defender);
    for (const pid of order) {
      const p = byId(pid);
      if (p.out) continue;
      while (p.hand.length < HAND && g.deck.length) p.hand.push(g.deck.pop());
    }
    // players without cards once the deck is empty are out
    if (!g.deck.length) {
      G.players.forEach(p => {
        if (!p.out && !p.hand.length) { p.out = true; g.finished.push(p.id); log(`${p.name} n'a plus de cartes : sorti ! 🎉`); }
      });
    }
    const left = activePlayers();
    if (left.length <= 1) return endGame(left[0] || null);

    const prevDef = g.defender;
    g.attacker = took ? nextActive(prevDef) : (isOut(prevDef) ? nextActive(prevDef) : prevDef);
    g.defender = nextActive(g.attacker);
    g.seq++;
    update();
  }

  function endGame(loser) {
    const g = G.game;
    g.phase = 'over';
    g.durak = loser ? loser.id : null;
    if (loser) { loser.durak = (loser.durak || 0) + 1; log(`${loser.name} est le Durak ! 🃏`); }
    else log('Match nul : les derniers joueurs ont fini en même temps.');
    G.sfx = 'end';
    g.seq++;
    update();
  }

  /* ---------------- Bots (also play for disconnected players) ---------------- */
  const value = c => c.r + (c.s === G.game.trump ? 20 : 0);
  function botMove(p) {
    const g = G.game;
    if (p.id === g.defender) {
      if (g.taking || !unbeaten()) return null;
      // greedy: beat each unbeaten card with the cheapest possible card
      const hand = p.hand.slice();
      const plan = [];
      for (const [i, t] of g.table.entries()) {
        if (t.d) continue;
        const opts = hand.filter(c => beats(t.a, c, g.trump)).sort((a, b) => value(a) - value(b));
        if (!opts.length) return { a: 'take' };
        plan.push({ idx: i, card: opts[0] });
        hand.splice(hand.indexOf(opts[0]), 1);
      }
      // don't waste a big trump early in the game for a small attack
      const costly = plan.some(x => x.card.s === g.trump && x.card.r >= 12);
      if (costly && g.deck.length > 8 && g.table.length <= 2) return { a: 'take' };
      return { a: 'play', card: plan[0].card.id, idx: plan[0].idx };
    }
    const ok = p.hand.filter(c => canThrowCard(p, c)).sort((a, b) => value(a) - value(b));
    if (!g.table.length) return ok.length ? { a: 'play', card: ok[0].id } : null;
    const cheap = ok.filter(c => c.s !== g.trump && c.r <= (g.deck.length > 6 ? 11 : 14) || !g.deck.length);
    if (cheap.length) return { a: 'play', card: cheap[0].id };
    if (!g.passed.has(p.id)) return { a: 'pass' };
    return null;
  }
  function scheduleBots() {
    clearTimeout(G.timers.bot);
    const g = G.game;
    if (!g || g.phase !== 'play') return;
    const seq = g.seq;
    const robots = G.players.filter(p => (p.bot || p.offline) && !p.out);
    if (!robots.some(p => botMove(p))) return;
    G.timers.bot = setTimeout(() => {
      if (G.game !== g || g.seq !== seq) return;
      // the defender reacts first, then attackers in seat order
      const ordered = [...robots.filter(p => p.id === g.defender), ...robots.filter(p => p.id !== g.defender)];
      for (const p of ordered) {
        const m = botMove(p);
        if (m && act(p.id, m.a, m)) return;
      }
    }, FAST ? 5 : 650 + Math.random() * 650);
  }

  /* ---------------- Views ---------------- */
  function sortHand(hand, trump) {
    return hand.slice().sort((a, b) => ((a.s === trump) - (b.s === trump)) || (a.s - b.s) || (a.r - b.r));
  }
  function viewFor(pid) {
    const g = G.game;
    const v = {
      screen: G.screen, me: pid, isHost: pid === 0, code: G.code, online: G.online,
      players: G.players.map(p => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, offline: !!p.offline, durak: p.durak || 0 })),
      sfx: G.sfx || null, sfxN: G.sfxN || 0, error: G.lobbyError || '',
    };
    if (!g) return v;
    const me = byId(pid);
    const hand = me ? sortHand(me.hand, g.trump) : [];
    const playable = {};
    if (me && g.phase === 'play') {
      for (const c of hand) {
        if (pid === g.defender) { const t = defendTargets(me, c); if (t.length) playable[c.id] = t; }
        else if (canThrowCard(me, c)) playable[c.id] = 'attack';
      }
    }
    const allBeaten = g.table.length && g.table.every(t => t.d);
    v.game = {
      trump: g.trump, trumpCard: g.deck.length ? g.trumpCard : null, deck: g.deck.length, discard: g.discard,
      table: g.table.map(t => ({ a: t.a, d: t.d })),
      attacker: g.attacker, defender: g.defender, taking: g.taking, passed: [...g.passed],
      phase: g.phase, durak: g.durak, finished: g.finished, log: g.log.slice(-2),
      seats: G.players.map(p => ({ id: p.id, count: p.hand.length, out: !!p.out })),
      hand, playable,
      canTake: !!me && pid === g.defender && !g.taking && unbeaten() > 0 && g.phase === 'play',
      canPass: !!me && pid !== g.defender && !me.out && g.table.length > 0 && !g.passed.has(pid) && g.phase === 'play',
      passLabel: g.taking ? "C'est bon, prends !" : allBeaten ? 'Bito ✓' : 'Je passe',
    };
    return v;
  }

  let flushQ = false;
  function update() {
    if (!G.isHost || flushQ) return;
    flushQ = true;
    queueMicrotask(() => {
      flushQ = false;
      if (G.sfx) { G.sfxN = (G.sfxN || 0) + 1; }
      render(viewFor(G.me));
      if (G.online) G.players.forEach(p => { if (p.conn && p.conn.open) try { p.conn.send({ t: 'view', v: viewFor(p.id) }); } catch (e) { /* ignore */ } });
      G.sfx = null;
      if (G.game) { checkResolve(); scheduleBots(); }
    });
  }
  function lobbyError(msg) { G.lobbyError = msg; update(); }

  /* ==========================================================
     Rendering (every device)
     ========================================================== */
  const seen = { sfx: 0, turnKey: '' };
  let selected = null; // defender: card chosen, waiting for the target

  function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
  function cardHTML(c, extra = '', attrs = '') {
    return `<div class="card ${RED(c.s) ? 'red' : ''} ${extra}" ${attrs}><span class="cr">${RANK[c.r]}</span><span class="cs">${SUITS[c.s]}</span><span class="cbig">${SUITS[c.s]}</span></div>`;
  }

  function render(v) {
    G.view = v;
    if (v.sfx && v.sfxN > seen.sfx) { seen.sfx = v.sfxN; if (Sound[v.sfx]) Sound[v.sfx](); }
    if (v.screen === 'lobby') { show('lobby'); renderLobby(v); }
    if (v.screen === 'game' && v.game) { show('game'); renderGame(v); }
  }

  function renderLobby(v) {
    $('#lobbyTitle').textContent = v.online ? 'Salle en ligne' : 'Partie contre l\'ordinateur';
    $('#lobbyCodeBox').style.display = v.online ? '' : 'none';
    $('#lobbyCode').textContent = v.code;
    $('#lobbyPlayers').innerHTML = v.players.map(p => `<span class="chip" style="--c:${p.color}">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === v.me ? ' <small>(toi)</small>' : ''}${p.id === 0 ? ' 👑' : ''}${p.durak ? ` <small>· 🃏×${p.durak}</small>` : ''}${p.bot && v.isHost ? ` <button class="x" data-act="rmBot" data-id="${p.id}">✕</button>` : ''}</span>`).join('');
    const n = v.players.length;
    $('#botRow').style.display = v.isHost && n < MAX_PLAYERS ? '' : 'none';
    $('#lobbyStart').style.display = v.isHost ? '' : 'none';
    $('#lobbyStart').disabled = n < 2;
    $('#lobbyMsg').textContent = v.isHost
      ? (n < 2 ? (v.online ? 'Envoie le code à tes amis, ou ajoute des bots.' : 'Ajoute au moins un bot.') : `${n} / ${MAX_PLAYERS} joueurs. Prêt à distribuer !`)
      : 'Connecté ! En attente que l\'hôte distribue les cartes…';
    $('#lobbyError').textContent = v.error || '';
  }

  function renderGame(v) {
    const g = v.game;
    const P = id => v.players.find(p => p.id === id) || { name: '?', color: '#fff' };
    const seat = id => g.seats.find(s => s.id === id) || { count: 0, out: true };

    // opponents, in seat order starting after me
    const ids = g.seats.map(s => s.id);
    const myIdx = Math.max(0, ids.indexOf(v.me));
    const others = [...ids.slice(myIdx + 1), ...ids.slice(0, myIdx)].filter(id => id !== v.me);
    $('#opponents').innerHTML = others.map(id => {
      const p = P(id), s = seat(id);
      const role = s.out ? '🏁 Sorti' : id === g.attacker ? '⚔️ Attaque' : id === g.defender ? (g.taking ? '🫴 Prend' : '🛡️ Défend') : g.passed.includes(id) ? '✓ Passe' : '';
      const backs = Math.min(s.count, 8);
      return `<div class="opp ${id === g.defender ? 'def' : ''} ${id === g.attacker ? 'att' : ''} ${s.out ? 'out' : ''} ${g.durak === id ? 'durak' : ''}" style="--c:${p.color}">
          <div class="backs">${'<i></i>'.repeat(backs)}</div>
          <b>${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.offline ? ' 📵' : ''}</b>
          <span>${s.out ? '' : s.count + ' carte' + (s.count > 1 ? 's' : '')}</span>
          <em>${role}</em>
        </div>`;
    }).join('');

    // deck + trump
    $('#deck').innerHTML = (g.trumpCard ? cardHTML(g.trumpCard, 'trump-card') : '') +
      (g.deck > 1 ? `<div class="card back deck-top"><span class="deck-n">${g.deck - 1}</span></div>` : '');
    $('#trumpInfo').innerHTML = `Atout <b class="${RED(g.trump) ? 'red' : ''}">${SUITS[g.trump]}</b> ${SUIT_NAMES[g.trump]}<br><small>Pioche : ${g.deck} · Défausse : ${g.discard}</small>`;

    // table
    const iDefend = v.me === g.defender && !g.taking && g.phase === 'play';
    const targets = selected && g.playable[selected] && Array.isArray(g.playable[selected]) ? g.playable[selected] : [];
    $('#table').innerHTML = g.table.length
      ? g.table.map((t, i) => `<div class="pair ${targets.includes(i) ? 'target' : ''}" data-act="target" data-idx="${i}">
          ${cardHTML(t.a)}${t.d ? cardHTML(t.d, 'def-card') : ''}</div>`).join('')
      : `<div class="table-empty">${g.phase === 'over' ? '' : `${esc(P(g.attacker).name)} va attaquer…`}</div>`;

    // my hand
    const meSeat = seat(v.me);
    $('#hand').innerHTML = g.hand.map(c => {
      const can = !!g.playable[c.id];
      return cardHTML(c, `${can ? 'playable' : 'dim'} ${selected === c.id ? 'selected' : ''} ${c.s === g.trump ? 'is-trump' : ''}`, `data-act="card" data-id="${c.id}"`);
    }).join('') || (meSeat.out ? '<p class="waiting">🏁 Tu n\'as plus de cartes, bien joué !</p>' : '');
    const meP = P(v.me);
    $('#me').innerHTML = `<b style="color:${meP.color}">${esc(meP.name)}</b> · ${g.hand.length} carte${g.hand.length > 1 ? 's' : ''}${meP.durak ? ` · 🃏×${meP.durak}` : ''}`;

    // status + actions
    let status;
    if (g.phase === 'over') status = '';
    else if (meSeat.out) status = '🏁 Tu es sorti. Regarde la fin de la partie !';
    else if (v.me === g.defender) status = g.taking ? '🫴 Tu prends les cartes… (les autres peuvent encore en ajouter)' : unbeatenCount(g) ? (selected ? '👉 Touche la carte à battre' : '🛡️ Défends-toi ! Choisis une carte, ou prends.') : '✅ Tout est battu, attends les autres…';
    else if (!g.table.length && v.me === g.attacker) status = '⚔️ À toi d\'attaquer : pose une carte !';
    else if (!g.table.length) status = `${esc(P(g.attacker).name)} attaque ${esc(P(g.defender).name)}…`;
    else if (Object.keys(g.playable).length) status = `➕ Tu peux ajouter une carte de même valeur sur ${esc(P(g.defender).name)}.`;
    else status = `${esc(P(g.attacker).name)} attaque ${esc(P(g.defender).name)}…`;
    $('#status').innerHTML = status + (g.log.length ? `<small>${esc(g.log[g.log.length - 1])}</small>` : '');

    $('#actions').innerHTML = (g.canTake ? '<button class="btn take" data-act="take">🫴 Prendre</button>' : '') +
      (g.canPass ? `<button class="btn primary" data-act="pass">${g.passLabel}</button>` : '');

    // my turn notification
    const turnKey = (!g.table.length && v.me === g.attacker) || (iDefend && unbeatenCount(g)) ? `${g.attacker}-${g.defender}-${g.table.length}` : '';
    if (turnKey && turnKey !== seen.turnKey && g.phase === 'play') Sound.turn();
    seen.turnKey = turnKey;
    if (selected && !g.playable[selected]) selected = null;

    // result
    const res = $('#result');
    if (g.phase === 'over') {
      const d = g.durak != null ? P(g.durak) : null;
      res.classList.remove('hidden');
      res.innerHTML = `<div class="overlay-card">
        <h3>${d ? `🃏 <span style="color:${d.color}">${esc(d.name)}</span> est le Durak !` : '🤝 Match nul !'}</h3>
        <p>${d && d.id === v.me ? 'Aïe… c\'est toi l\'idiot cette fois 😅' : d ? 'Bien joué, tu t\'en es sorti !' : ''}</p>
        <ol class="finish">${g.finished.map(id => `<li style="color:${P(id).color}">${esc(P(id).name)}</li>`).join('')}${d ? `<li style="color:${d.color}">${esc(d.name)} 🃏</li>` : ''}</ol>
        <p class="small">Compteur de Durak : ${v.players.map(p => `${esc(p.name)} ${p.durak}`).join(' · ')}</p>
        <div class="row">${v.isHost ? '<button class="btn primary big" data-act="again">Nouvelle partie</button>' : '<p class="waiting">L\'hôte peut relancer une partie…</p>'}
        <button class="btn ghost" data-act="home">Quitter</button></div></div>`;
    } else {
      res.classList.add('hidden'); res.innerHTML = '';
    }
  }
  const unbeatenCount = g => g.table.filter(t => !t.d).length;

  let toastT;
  function toast(msg) {
    const t = $('#toast'); clearTimeout(toastT);
    t.innerHTML = `<span>${msg}</span>`; t.className = 'toast';
    toastT = setTimeout(() => { t.className = 'toast hidden'; }, 2500);
  }

  /* ==========================================================
     Actions from this device
     ========================================================== */
  function send(a, data = {}) {
    if (G.isHost) act(G.me, a, data);
    else if (G.hostConn && G.hostConn.open) G.hostConn.send({ t: 'act', a, ...data });
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act, v = G.view, g = v && v.game;
    switch (a) {
      case 'card': {
        if (!g) return;
        const id = el.dataset.id, p = g.playable[id];
        if (!p) { if (g.phase === 'play') toast(v.me === g.defender ? 'Cette carte ne bat aucune carte posée.' : g.table.length ? 'Seules les cartes de même valeur que celles sur la table peuvent être ajoutées.' : 'Ce n\'est pas ton tour d\'attaquer.'); return; }
        if (p === 'attack') { selected = null; send('play', { card: id }); return; }
        if (p.length === 1) { selected = null; send('play', { card: id, idx: p[0] }); return; }
        selected = selected === id ? null : id;   // several possible targets: choose on the table
        render(v);
        return;
      }
      case 'target': {
        if (!selected || !g) return;
        const idx = +el.dataset.idx;
        if (Array.isArray(g.playable[selected]) && g.playable[selected].includes(idx)) { send('play', { card: selected, idx }); selected = null; }
        return;
      }
      case 'take': send('take'); return;
      case 'pass': send('pass'); return;
      case 'start': case 'again': if (G.isHost) { G.lobbyError = ''; startGame(); } return;
      case 'addBot': if (G.isHost) addBot(); return;
      case 'rmBot': if (G.isHost) { G.players = G.players.filter(p => p.id !== +el.dataset.id); update(); } return;
      case 'share': share(); return;
      case 'home': case 'quit':
        if (a === 'home' && !(g && g.phase === 'play')) return leave();
        if (confirm(G.isHost && G.online ? 'Quitter ? La partie s\'arrêtera pour tout le monde.' : 'Quitter la partie ?')) leave();
    }
  });

  function addBot() {
    if (G.players.length >= MAX_PLAYERS) return;
    const used = new Set(G.players.map(p => p.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + (G.players.length + 1);
    const usedC = new Set(G.players.map(p => p.color));
    G.players.push({ id: ++G.nextId, name, bot: true, color: COLORS.find(c => !usedC.has(c)) || COLORS[0], hand: [] });
    update();
  }

  function share() {
    const url = location.origin + location.pathname + '?join=' + G.code;
    const text = `Viens jouer au Durak avec moi ! Code : ${G.code}`;
    if (navigator.share) navigator.share({ title: 'Durak', text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Lien copié !'));
    else prompt('Copie ce lien :', url);
  }

  function leave(msg) {
    clearTimeout(G.timers.resolve); clearTimeout(G.timers.bot);
    if (G.peer) try { G.peer.destroy(); } catch (e) { /* ignore */ }
    Object.assign(G, { peer: null, hostConn: null, game: null, view: null, players: [], online: false, isHost: true, me: 0, screen: 'home', lobbyError: '' });
    show('home');
    $('#homeError').textContent = msg || '';
  }

  /* ==========================================================
     Online (PeerJS)
     ========================================================== */
  function peerOptions() {
    const u = new URLSearchParams(location.search);
    const o = { debug: 0 };
    if (u.get('peerhost')) { o.host = u.get('peerhost'); o.port = +u.get('peerport') || 9000; o.path = u.get('peerpath') || '/'; o.secure = u.get('peersecure') === '1'; }
    return o;
  }
  const newCode = () => [...Array(5)].map(() => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[(Math.random() * 31) | 0]).join('');
  function netError(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Salle introuvable : vérifie le code.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Problème de connexion. Vérifie ta connexion internet.';
    return 'Erreur de connexion' + (t ? ` (${t})` : '') + '.';
  }
  function myName() {
    const n = $('#myName').value.trim();
    if (!n) { $('#homeError').textContent = 'Choisis un pseudo !'; $('#myName').focus(); return null; }
    localStorage.setItem('aqc-me', n);
    return n.slice(0, 16);
  }

  function setupHost(name, online, code) {
    Object.assign(G, { isHost: true, online, me: 0, code: code || '', nextId: 0, game: null, screen: 'lobby', lobbyError: '' });
    G.players = [{ id: 0, name, color: COLORS[0], hand: [] }];
    update();
  }

  function hostRoom() {
    const name = myName(); if (!name) return;
    if (typeof Peer === 'undefined') { $('#homeError').textContent = "Le module en ligne n'a pas pu se charger."; return; }
    show('loading'); $('#loadingText').textContent = 'Création de la salle…';
    const tryOpen = () => {
      const code = newCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      let opened = false;
      peer.on('open', () => { opened = true; G.peer = peer; setupHost(name, true, code); history.replaceState(null, '', location.pathname); });
      peer.on('error', e => {
        if (opened) return console.warn('peer', e.type);
        peer.destroy();
        if (e.type === 'unavailable-id') tryOpen(); else leave(netError(e));
      });
      peer.on('disconnected', () => { if (G.peer === peer && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* ignore */ } }, 1000); });
      peer.on('connection', onGuest);
    };
    tryOpen();
  }

  function onGuest(conn) {
    const refuse = msg => { conn.send({ t: 'error', msg }); setTimeout(() => conn.close(), 800); };
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        const name = String(msg.name || '').trim().slice(0, 16) || 'Invité';
        let p = G.players.find(x => x.offline && !x.bot && x.name.toLowerCase() === name.toLowerCase());
        if (!p) {
          if (G.game && G.game.phase === 'play') return refuse('Une partie est en cours. Attends la fin pour rejoindre.');
          if (G.players.length >= MAX_PLAYERS) return refuse(`La salle est pleine (${MAX_PLAYERS} joueurs max).`);
          const usedC = new Set(G.players.map(x => x.color));
          p = { id: ++G.nextId, name: G.players.some(x => x.name.toLowerCase() === name.toLowerCase()) ? name + ' ' + (G.players.length + 1) : name, color: COLORS.find(c => !usedC.has(c)) || COLORS[0], hand: [] };
          G.players.push(p);
        }
        p.offline = false; p.conn = conn; conn.pid = p.id;
        conn.send({ t: 'welcome', id: p.id });
        update();
      } else if (msg.t === 'act' && conn.pid != null && byId(conn.pid) && byId(conn.pid).conn === conn) {
        act(conn.pid, msg.a, msg);
      }
    });
    const gone = () => {
      const p = G.players.find(x => x.conn === conn);
      if (!p) return;
      p.conn = null;
      if (G.game && G.game.phase === 'play') { p.offline = true; toast(`📵 ${esc(p.name)} s'est déconnecté (un bot joue à sa place)`); }
      else G.players = G.players.filter(x => x !== p);
      update();
    };
    conn.on('close', gone); conn.on('error', gone);
  }

  function joinRoom() {
    const name = myName(); if (!name) return;
    const code = $('#joinCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { $('#homeError').textContent = 'Le code de la salle fait 5 caractères.'; return; }
    if (typeof Peer === 'undefined') { $('#homeError').textContent = "Le module en ligne n'a pas pu se charger."; return; }
    show('loading'); $('#loadingText').textContent = 'Connexion à la salle ' + code + '…';
    Object.assign(G, { isHost: false, online: true });
    const peer = new Peer(peerOptions());
    let done = false, welcomed = false;
    const fail = m => { if (done) return; done = true; clearTimeout(to); peer.destroy(); leave(m); };
    const to = setTimeout(() => fail('Impossible de rejoindre la salle (délai dépassé).'), 20000);
    peer.on('error', e => { if (!done) fail(netError(e)); });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => conn.send({ t: 'hello', name }));
      conn.on('data', msg => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'welcome') { welcomed = true; done = true; clearTimeout(to); G.peer = peer; G.hostConn = conn; G.me = msg.id; }
        else if (msg.t === 'error') fail(msg.msg);
        else if (msg.t === 'view' && welcomed) render(msg.v);
      });
      conn.on('close', () => { if (welcomed && G.hostConn === conn) leave('Connexion perdue avec l\'hôte.'); });
    });
  }

  /* ---------------- Wiring ---------------- */
  $('#hostBtn').onclick = () => { tone(1, 0.01, 'sine', 0.0001); hostRoom(); };
  $('#joinBtn').onclick = () => { tone(1, 0.01, 'sine', 0.0001); joinRoom(); };
  $('#soloBtn').onclick = () => {
    tone(1, 0.01, 'sine', 0.0001);
    const name = myName(); if (!name) return;
    setupHost(name, false);
    addBot(); addBot();
  };
  $('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  $('#myName').value = localStorage.getItem('aqc-me') || '';
  const j = new URLSearchParams(location.search).get('join');
  if (j) $('#joinCode').value = j.toUpperCase();
  window.addEventListener('beforeunload', e => { if (G.online && G.game && G.game.phase === 'play') { e.preventDefault(); e.returnValue = ''; } });

  // exposed for automated tests only
  window.__durak = { G, act, viewFor, beats };
})();
