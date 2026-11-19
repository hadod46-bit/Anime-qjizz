/* ==========================================================
   AniList API + answer matching
   ========================================================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const API = (() => {
  const ENDPOINT = 'https://graphql.anilist.co';

  // max = how deep in the popularity ranking we go, pages = how many pages of 50 we load
  const DIFFICULTIES = {
    facile:    { max: 100,  pages: 2 },
    moyen:     { max: 300,  pages: 4 },
    difficile: { max: 800,  pages: 4 },
    expert:    { max: 2000, pages: 5 },
  };

  const POOL_QUERY = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false, format_in: [TV, MOVIE, ONA]) {
          id
          title { romaji english }
          synonyms
          bannerImage
          coverImage { extraLarge large color }
          popularity
        }
      }
    }`;

  const DETAIL_QUERY = `
    query ($ids: [Int]) {
      Page(perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          characters(sort: [ROLE, RELEVANCE, ID], perPage: 8) {
            nodes { id image { large } }
          }
        }
      }
    }`;

  async function gql(query, variables, tries = 4) {
    let lastErr = 'AniList ne répond pas.';
    for (let i = 0; i < tries; i++) {
      let res;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
        });
      } catch (e) {
        // Network error, or a 429 without CORS headers
        lastErr = 'Impossible de joindre AniList (connexion internet ?)';
        await sleep(2500 * (i + 1));
        continue;
      }
      if (res.status === 429) {
        const ra = parseInt(res.headers.get('Retry-After'), 10);
        lastErr = 'Trop de requêtes vers AniList, patiente une minute.';
        await sleep((Number.isFinite(ra) ? ra : 5) * 1000);
        continue;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.errors) {
        lastErr = 'Erreur AniList : ' + ((json && json.errors && json.errors[0] && json.errors[0].message) || res.status);
        await sleep(1500);
        continue;
      }
      return json.data;
    }
    throw new Error(lastErr);
  }

  /** Load a pool of popular anime according to difficulty, deduplicated by franchise. */
  async function loadPool(difficulty) {
    const d = DIFFICULTIES[difficulty] || DIFFICULTIES.moyen;
    const totalPages = Math.ceil(d.max / 50);
    const pages = shuffle([...Array(totalPages)].map((_, i) => i + 1)).slice(0, Math.min(d.pages, totalPages));
    const results = await Promise.all(pages.map(page => gql(POOL_QUERY, { page })));
    const all = results.flatMap(r => r.Page.media).sort((a, b) => b.popularity - a.popularity);

    // Deduplicate franchises (seasons, sequels...) — keep the most popular entry
    const seen = new Set();
    const pool = [];
    for (const m of all) {
      const keys = [m.title.romaji, m.title.english].filter(Boolean).map(Match.baseTitle).filter(k => k.length > 1);
      if (!keys.length || keys.some(k => seen.has(k))) continue;
      keys.forEach(k => seen.add(k));
      m.display = m.title.english || m.title.romaji;
      m.base = keys[0];
      pool.push(m);
    }
    if (pool.length < 12) throw new Error("Pas assez d'animés récupérés, réessaie.");
    return pool;
  }

  async function loadDetails(ids) {
    const data = await gql(DETAIL_QUERY, { ids });
    const map = new Map();
    for (const m of data.Page.media) map.set(m.id, m);
    return map;
  }

  return { loadPool, loadDetails, DIFFICULTIES };
})();

/* ==========================================================
   Question bank: picks 4 random pictures per anime
   ========================================================== */
class QuestionBank {
  constructor(pool) {
    this.pool = pool;
    this.queue = shuffle(pool);
    this.ready = [];
    this.filling = null;
  }

  static isValidImg(url) {
    return url && !/\/default\.(jpg|png)$/i.test(url);
  }

  buildQuestion(media, detail) {
    const chars = ((detail && detail.characters && detail.characters.nodes) || [])
      .map(c => c.image && c.image.large)
      .filter(QuestionBank.isValidImg);
    const uniqueChars = [...new Set(chars)];
    let picks = [];
    if (QuestionBank.isValidImg(media.bannerImage)) {
      picks.push({ url: media.bannerImage, kind: 'scene' });
      picks.push(...shuffle(uniqueChars.slice(0, 6)).slice(0, 3).map(url => ({ url, kind: 'char' })));
    } else {
      picks.push(...shuffle(uniqueChars.slice(0, 7)).slice(0, 4).map(url => ({ url, kind: 'char' })));
    }
    if (picks.length < 4) return null;
    return { media, images: shuffle(picks) };
  }

  fill() {
    if (this.filling) return this.filling;
    this.filling = (async () => {
      try {
        while (this.ready.length < 4 && this.queue.length) {
          const batch = this.queue.splice(0, 10);
          const details = await API.loadDetails(batch.map(m => m.id));
          for (const m of batch) {
            const q = this.buildQuestion(m, details.get(m.id));
            if (q) this.ready.push(q);
          }
        }
      } finally {
        this.filling = null;
      }
    })();
    return this.filling;
  }

  /** Returns the next question (images preloaded), or null if the bank is exhausted. */
  async next() {
    if (!this.ready.length) await this.fill();
    const q = this.ready.shift();
    if (!q) return null;
    // background prefetch of the next questions
    if (this.ready.length < 3) this.fill().catch(() => {});
    this.ready.slice(0, 2).forEach(nq => nq.images.forEach(i => preloadImage(i.url)));
    await Promise.all(q.images.map(i => preloadImage(i.url)));
    return q;
  }

  /** 3 wrong answers from other franchises. */
  distractors(media, n = 3) {
    return shuffle(this.pool.filter(m => m.id !== media.id && m.base !== media.base)).slice(0, n);
  }
}

const _imgCache = new Map();
function preloadImage(url, timeout = 7000) {
  if (_imgCache.has(url)) return _imgCache.get(url);
  const p = new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), timeout);
    img.onload = () => { clearTimeout(t); resolve(true); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = url;
  });
  _imgCache.set(url, p);
  return p;
}

/* ==========================================================
   Answer matching (tolerant to typos & long vowels)
   ========================================================== */
const Match = (() => {
  function norm(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // romaji long vowels: ou/oo -> o, uu -> u ; drop leading "the"
  function soft(s) {
    return norm(s).replace(/^the /, '').replace(/ou/g, 'o').replace(/oo/g, 'o').replace(/uu/g, 'u').replace(/ /g, '');
  }

  function baseTitle(raw) {
    let s = norm((raw || '').split(/[:：]/)[0]);
    s = s
      .replace(/\b\d+(st|nd|rd|th)? season\b/g, ' ')
      .replace(/\b(season|saison|part|cour) ?\d+\b/g, ' ')
      .replace(/\b(the final season|final season|the movie|movie|shippuden|shippuuden|brotherhood)\b/g, ' ')
      .replace(/\s+(ii|iii|iv|v|\d+)$/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return s;
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function candidates(media) {
    if (media._cands) return media._cands;
    const titles = [media.title.english, media.title.romaji, ...(media.synonyms || [])].filter(Boolean);
    const out = new Set();
    for (const t of titles) {
      out.add(soft(t));
      out.add(soft(baseTitle(t)));
      t.split(/[:：]/).forEach(part => { if (norm(part).length >= 4) out.add(soft(part)); });
    }
    media._cands = [...out].filter(c => c.length >= 2);
    return media._cands;
  }

  function isCorrect(answer, media) {
    const a = soft(answer);
    if (a.length < 2) return false;
    for (const c of candidates(media)) {
      if (a === c) return true;
      if (c.length <= 4) continue; // short titles / acronyms must be exact
      const sim = 1 - lev(a, c) / Math.max(a.length, c.length);
      if (sim >= (c.length <= 8 ? 0.75 : 0.8)) return true;
      if (a.length >= 6 && c.startsWith(a) && a.length >= c.length * 0.6) return true;
    }
    return false;
  }

  return { norm, baseTitle, isCorrect };
})();
