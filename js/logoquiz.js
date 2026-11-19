/* ==========================================================
   Logo quiz: a brand logo appears blurred, then gets sharper.
   Logo data (js/logos.js) is loaded only when this quiz is played.
   ========================================================== */
const LOGO_CATS = [
  { id: 'apps', label: '📱 Apps & Web' },
  { id: 'tech', label: '💻 High-tech' },
  { id: 'auto', label: '🚗 Voitures' },
  { id: 'sport', label: '👟 Sport' },
  { id: 'food', label: '🍔 Food & Magasins' },
  { id: 'games', label: '🎮 Jeux vidéo' },
  { id: 'misc', label: '✈️ Voyage & Divers' },
];

const Logos = (() => {
  let loading = null;
  function load() {
    if (typeof LOGOS !== 'undefined') return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/logos.js';
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('Impossible de charger les logos. Vérifie ta connexion.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function luminance(hex) {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** Logos of the chosen categories, as "media" objects the game understands. */
  function pool(cats) {
    return LOGOS.filter(l => cats.includes(l[2])).map(([slug, name, cat, hex, path, aliases = []]) => ({
      id: 'l-' + slug,
      display: name,
      title: { english: name, romaji: null },
      synonyms: aliases,
      coverImage: { large: '' },
      base: Match.norm(name),
      cat,
      catLabel: (LOGO_CATS.find(c => c.id === cat) || {}).label || '',
      logo: { p: path, h: hex, dark: luminance(hex) > 0.6 },
    }));
  }
  return { load, pool };
})();

class LogoBank extends QuestionBank {
  fill() { return Promise.resolve(); }
  async next() {
    const m = this.queue.shift();
    if (!m) return null;
    return { media: m, logo: m.logo };
  }
  /** Wrong answers from the same category when possible. */
  distractors(media, n = 3) {
    const others = shuffle(this.pool.filter(m => m.id !== media.id));
    const same = others.filter(m => m.cat === media.cat);
    return [...new Set([...same, ...others])].slice(0, n);
  }
}
