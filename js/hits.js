/* ==========================================================
   Blind test: worldwide hits by decade and style.
   Previews (30 s) come from Deezer, with iTunes as a backup.
   ========================================================== */

// [year, style, artist, title, (optional) other accepted answers]
// styles: pop · rap · rock · rnb (R&B / soul) · dance (disco / électro) · fr (chanson française)
const HITS = [
  // ---------- 70s ----------
  [1970, 'pop', 'Simon & Garfunkel', 'Bridge over Troubled Water'],
  [1971, 'rock', 'Led Zeppelin', 'Stairway to Heaven'],
  [1971, 'pop', 'John Lennon', 'Imagine'],
  [1971, 'pop', 'Don McLean', 'American Pie'],
  [1971, 'rnb', 'Marvin Gaye', "What's Going On"],
  [1972, 'pop', 'Elton John', 'Rocket Man'],
  [1972, 'rnb', 'Stevie Wonder', 'Superstition'],
  [1974, 'pop', 'ABBA', 'Waterloo'],
  [1974, 'rnb', 'Barry White', "You're the First, the Last, My Everything"],
  [1975, 'rock', 'Queen', 'Bohemian Rhapsody'],
  [1975, 'rock', 'Bruce Springsteen', 'Born to Run'],
  [1975, 'rock', 'Aerosmith', 'Walk This Way'],
  [1975, 'pop', 'Bob Marley', 'No Woman, No Cry', ['Bob Marley & The Wailers']],
  [1976, 'pop', 'ABBA', 'Dancing Queen'],
  [1977, 'rock', 'Eagles', 'Hotel California'],
  [1977, 'rock', 'Queen', 'We Will Rock You'],
  [1977, 'rock', 'Fleetwood Mac', 'Go Your Own Way'],
  [1977, 'dance', 'Bee Gees', "Stayin' Alive"],
  [1977, 'dance', 'Donna Summer', 'I Feel Love'],
  [1978, 'dance', 'Gloria Gaynor', 'I Will Survive'],
  [1978, 'dance', 'Village People', 'Y.M.C.A.'],
  [1978, 'dance', 'Boney M.', 'Rivers of Babylon'],
  [1978, 'dance', 'Chic', 'Le Freak'],
  [1978, 'rnb', 'Earth, Wind & Fire', 'September'],
  [1978, 'pop', 'John Travolta', "You're the One That I Want", ['Olivia Newton-John', 'Grease']],
  [1979, 'dance', 'Michael Jackson', "Don't Stop 'Til You Get Enough"],
  [1979, 'rap', 'The Sugarhill Gang', "Rapper's Delight"],
  [1979, 'rock', 'Pink Floyd', 'Another Brick in the Wall'],
  [1979, 'rock', 'AC/DC', 'Highway to Hell'],
  [1979, 'pop', 'The Buggles', 'Video Killed the Radio Star'],
  [1975, 'fr', 'Joe Dassin', "L'été indien"],
  [1977, 'fr', 'Plastic Bertrand', 'Ça plane pour moi'],
  [1978, 'fr', 'Claude François', 'Alexandrie Alexandra'],
  [1979, 'fr', 'Bernard Lavilliers', 'Stand the Ghetto'],

  // ---------- 80s ----------
  [1980, 'rock', 'Queen', 'Another One Bites the Dust'],
  [1980, 'rock', 'AC/DC', 'Back in Black'],
  [1980, 'pop', 'Blondie', 'Call Me'],
  [1981, 'rock', 'Journey', "Don't Stop Believin'"],
  [1981, 'pop', 'Soft Cell', 'Tainted Love'],
  [1982, 'pop', 'Michael Jackson', 'Billie Jean'],
  [1982, 'rock', 'Survivor', 'Eye of the Tiger'],
  [1982, 'rnb', 'Marvin Gaye', 'Sexual Healing'],
  [1982, 'rap', 'Grandmaster Flash and the Furious Five', 'The Message'],
  [1983, 'pop', 'Michael Jackson', 'Beat It'],
  [1983, 'pop', 'Cyndi Lauper', 'Girls Just Want to Have Fun'],
  [1983, 'dance', 'Eurythmics', 'Sweet Dreams (Are Made of This)'],
  [1983, 'rock', 'The Police', 'Every Breath You Take'],
  [1983, 'pop', 'Bonnie Tyler', 'Total Eclipse of the Heart'],
  [1983, 'dance', 'Frankie Goes to Hollywood', 'Relax'],
  [1984, 'pop', 'Madonna', 'Like a Virgin'],
  [1984, 'pop', 'Wham!', 'Wake Me Up Before You Go-Go'],
  [1984, 'pop', 'Prince', 'Purple Rain'],
  [1984, 'rnb', 'Stevie Wonder', 'I Just Called to Say I Love You'],
  [1984, 'rnb', 'Lionel Richie', 'Hello'],
  [1985, 'pop', 'a-ha', 'Take On Me'],
  [1985, 'pop', 'Tears for Fears', 'Everybody Wants to Rule the World'],
  [1985, 'rock', 'Dire Straits', 'Money for Nothing'],
  [1986, 'rock', 'Bon Jovi', "Livin' on a Prayer"],
  [1986, 'rock', 'Europe', 'The Final Countdown'],
  [1986, 'rap', 'Run-D.M.C.', 'Walk This Way'],
  [1987, 'rock', "Guns N' Roses", "Sweet Child o' Mine"],
  [1987, 'rock', 'U2', 'With or Without You'],
  [1987, 'pop', 'Rick Astley', 'Never Gonna Give You Up'],
  [1987, 'pop', 'Whitney Houston', 'I Wanna Dance with Somebody'],
  [1988, 'pop', 'Bobby McFerrin', "Don't Worry, Be Happy"],
  [1989, 'pop', 'Madonna', 'Like a Prayer'],
  [1989, 'pop', 'Roxette', 'The Look'],
  [1989, 'rap', 'Public Enemy', 'Fight the Power'],
  [1981, 'fr', 'Michel Sardou', 'Les lacs du Connemara'],
  [1982, 'fr', 'Indochine', "L'aventurier"],
  [1982, 'fr', 'Jean-Jacques Goldman', 'Quand la musique est bonne'],
  [1984, 'fr', 'Étienne Daho', 'Week-end à Rome'],
  [1985, 'fr', 'Daniel Balavoine', "L'Aziza"],
  [1986, 'fr', 'Desireless', 'Voyage, voyage'],
  [1986, 'fr', 'Images', 'Les démons de minuit'],
  [1987, 'fr', 'France Gall', "Ella, elle l'a"],
  [1989, 'fr', 'Kaoma', 'Lambada'],

  // ---------- 90s ----------
  [1990, 'rap', 'MC Hammer', "U Can't Touch This"],
  [1990, 'rap', 'Vanilla Ice', 'Ice Ice Baby'],
  [1991, 'rock', 'Nirvana', 'Smells Like Teen Spirit'],
  [1991, 'rock', 'R.E.M.', 'Losing My Religion'],
  [1992, 'pop', 'Whitney Houston', 'I Will Always Love You'],
  [1992, 'rock', 'Red Hot Chili Peppers', 'Under the Bridge'],
  [1992, 'rnb', 'Boyz II Men', 'End of the Road'],
  [1993, 'dance', 'Haddaway', 'What Is Love'],
  [1994, 'rock', 'Green Day', 'Basket Case'],
  [1994, 'rock', 'The Cranberries', 'Zombie'],
  [1994, 'rap', 'The Notorious B.I.G.', 'Juicy'],
  [1994, 'rap', 'Warren G', 'Regulate'],
  [1994, 'pop', 'Mariah Carey', 'All I Want for Christmas Is You'],
  [1995, 'rap', 'Coolio', "Gangsta's Paradise"],
  [1995, 'rock', 'Oasis', 'Wonderwall'],
  [1996, 'rap', '2Pac', 'California Love'],
  [1996, 'rnb', 'Fugees', 'Killing Me Softly'],
  [1996, 'pop', 'Spice Girls', 'Wannabe'],
  [1996, 'dance', 'Los del Río', 'Macarena'],
  [1997, 'pop', 'Aqua', 'Barbie Girl'],
  [1997, 'rock', 'The Verve', 'Bitter Sweet Symphony'],
  [1997, 'dance', 'Daft Punk', 'Around the World'],
  [1998, 'pop', 'Céline Dion', 'My Heart Will Go On'],
  [1998, 'pop', 'Britney Spears', '...Baby One More Time'],
  [1998, 'dance', 'Cher', 'Believe'],
  [1998, 'rnb', 'Lauryn Hill', 'Doo Wop (That Thing)'],
  [1999, 'pop', 'Backstreet Boys', 'I Want It That Way'],
  [1999, 'pop', 'Ricky Martin', "Livin' la Vida Loca"],
  [1999, 'pop', 'Lou Bega', 'Mambo No. 5', ['Mambo Number 5']],
  [1999, 'rap', 'Eminem', 'My Name Is'],
  [1999, 'rap', 'Dr. Dre', 'Still D.R.E.', ['Snoop Dogg']],
  [1999, 'rnb', 'TLC', 'No Scrubs'],
  [1999, 'dance', 'Eiffel 65', 'Blue (Da Ba Dee)'],
  [1991, 'fr', 'Mylène Farmer', 'Désenchantée'],
  [1994, 'fr', 'IAM', 'Je danse le mia'],
  [1995, 'fr', 'Céline Dion', "Pour que tu m'aimes encore"],
  [1997, 'fr', 'Florent Pagny', 'Savoir aimer'],
  [1998, 'fr', 'Manau', 'La tribu de Dana'],
  [1998, 'fr', 'Suprême NTM', 'Ma Benz'],
  [1999, 'fr', 'Zebda', 'Tomber la chemise'],

  // ---------- 2000s ----------
  [2000, 'rap', 'Eminem', 'The Real Slim Shady'],
  [2000, 'dance', 'Daft Punk', 'One More Time'],
  [2000, 'dance', 'Modjo', 'Lady (Hear Me Tonight)'],
  [2001, 'rock', 'Linkin Park', 'In the End'],
  [2001, 'pop', 'Shakira', 'Whenever, Wherever'],
  [2002, 'rap', 'Eminem', 'Lose Yourself'],
  [2002, 'rap', 'Nelly', 'Hot in Herre'],
  [2002, 'pop', 'Avril Lavigne', 'Complicated'],
  [2003, 'rnb', 'Beyoncé', 'Crazy in Love'],
  [2003, 'rap', '50 Cent', 'In da Club', ['In the Club']],
  [2003, 'pop', 'OutKast', 'Hey Ya!'],
  [2003, 'rock', 'The White Stripes', 'Seven Nation Army'],
  [2003, 'rock', 'Evanescence', 'Bring Me to Life'],
  [2003, 'pop', 'The Black Eyed Peas', 'Where Is the Love?'],
  [2004, 'rnb', 'Usher', 'Yeah!'],
  [2004, 'pop', 'Britney Spears', 'Toxic'],
  [2004, 'rock', 'The Killers', 'Mr. Brightside'],
  [2004, 'rap', 'Snoop Dogg', "Drop It Like It's Hot"],
  [2005, 'rap', 'Kanye West', 'Gold Digger'],
  [2005, 'rnb', 'Mariah Carey', 'We Belong Together'],
  [2005, 'pop', 'Gorillaz', 'Feel Good Inc.'],
  [2006, 'pop', 'Shakira', "Hips Don't Lie"],
  [2006, 'pop', 'Gnarls Barkley', 'Crazy'],
  [2006, 'rnb', 'Amy Winehouse', 'Rehab'],
  [2007, 'pop', 'Rihanna', 'Umbrella'],
  [2007, 'rap', 'Kanye West', 'Stronger'],
  [2007, 'pop', 'OneRepublic', 'Apologize'],
  [2008, 'pop', 'Lady Gaga', 'Poker Face'],
  [2008, 'pop', 'Katy Perry', 'I Kissed a Girl'],
  [2008, 'rap', 'Lil Wayne', 'Lollipop'],
  [2008, 'rock', 'Coldplay', 'Viva la Vida'],
  [2008, 'rnb', 'Beyoncé', 'Single Ladies (Put a Ring on It)'],
  [2009, 'pop', 'The Black Eyed Peas', 'I Gotta Feeling'],
  [2009, 'dance', 'David Guetta', 'When Love Takes Over', ['Kelly Rowland']],
  [2000, 'fr', 'Alizée', 'Moi... Lolita'],
  [2002, 'fr', 'Magic System', 'Premier gaou'],
  [2003, 'fr', 'Corneille', "Parce qu'on vient de loin"],
  [2003, 'fr', 'Tragédie', 'Hey Oh'],
  [2003, 'fr', 'Mickey 3D', 'Respire'],
  [2005, 'fr', 'Raphaël', 'Caravane'],
  [2006, 'fr', "Diam's", 'La Boulette'],
  [2007, 'fr', 'Christophe Maé', "On s'attache"],

  // ---------- 2010s ----------
  [2010, 'pop', 'Kesha', 'TiK ToK'],
  [2010, 'rap', 'Eminem', 'Love the Way You Lie', ['Rihanna']],
  [2011, 'pop', 'Adele', 'Rolling in the Deep'],
  [2011, 'dance', 'LMFAO', 'Party Rock Anthem'],
  [2011, 'pop', 'Foster the People', 'Pumped Up Kicks'],
  [2012, 'pop', 'PSY', 'Gangnam Style'],
  [2012, 'pop', 'Carly Rae Jepsen', 'Call Me Maybe'],
  [2012, 'pop', 'Gotye', 'Somebody That I Used to Know'],
  [2012, 'rap', 'Macklemore', 'Thrift Shop', ['Macklemore & Ryan Lewis']],
  [2013, 'pop', 'Pharrell Williams', 'Happy'],
  [2013, 'dance', 'Daft Punk', 'Get Lucky', ['Pharrell Williams']],
  [2013, 'dance', 'Avicii', 'Wake Me Up'],
  [2013, 'rock', 'Imagine Dragons', 'Radioactive'],
  [2014, 'pop', 'Mark Ronson', 'Uptown Funk', ['Bruno Mars']],
  [2014, 'pop', 'Taylor Swift', 'Shake It Off'],
  [2014, 'rnb', 'Sam Smith', 'Stay with Me'],
  [2015, 'pop', 'Adele', 'Hello'],
  [2015, 'pop', 'Justin Bieber', 'Sorry'],
  [2015, 'rap', 'Drake', 'Hotline Bling'],
  [2015, 'rap', 'Kendrick Lamar', 'Alright'],
  [2016, 'rnb', 'The Weeknd', 'Starboy'],
  [2016, 'rnb', 'Rihanna', 'Work'],
  [2016, 'dance', 'The Chainsmokers', 'Closer'],
  [2017, 'pop', 'Ed Sheeran', 'Shape of You'],
  [2017, 'pop', 'Luis Fonsi', 'Despacito', ['Daddy Yankee']],
  [2017, 'pop', 'Dua Lipa', 'New Rules'],
  [2017, 'rap', 'Kendrick Lamar', 'HUMBLE.'],
  [2017, 'rap', 'Post Malone', 'rockstar'],
  [2018, 'rap', 'Drake', "God's Plan"],
  [2018, 'rap', 'Travis Scott', 'SICKO MODE'],
  [2019, 'pop', 'Billie Eilish', 'bad guy'],
  [2019, 'rap', 'Lil Nas X', 'Old Town Road'],
  [2019, 'pop', 'Lewis Capaldi', 'Someone You Loved'],
  [2010, 'fr', 'Stromae', 'Alors on danse'],
  [2010, 'fr', 'Zaz', 'Je veux'],
  [2013, 'fr', 'Stromae', 'Papaoutai'],
  [2013, 'fr', 'Maître Gims', 'Bella', ['Gims']],
  [2013, 'fr', 'Indila', 'Dernière danse'],
  [2014, 'fr', 'Kendji Girac', 'Andalouse'],
  [2016, 'fr', 'Soprano', 'Cosmo'],
  [2017, 'fr', 'Orelsan', 'Basique'],
  [2017, 'fr', 'Bigflo & Oli', 'Dommage'],
  [2018, 'fr', 'Aya Nakamura', 'Djadja'],
  [2019, 'fr', 'Angèle', 'Balance ton quoi'],
  [2019, 'fr', 'PNL', 'Au DD'],

  // ---------- 2020s ----------
  [2020, 'pop', 'The Weeknd', 'Blinding Lights'],
  [2020, 'pop', 'Dua Lipa', 'Levitating'],
  [2020, 'pop', 'BTS', 'Dynamite'],
  [2020, 'rap', 'Roddy Ricch', 'The Box'],
  [2020, 'rap', 'DaBaby', 'ROCKSTAR'],
  [2021, 'pop', 'Olivia Rodrigo', 'drivers license'],
  [2021, 'pop', 'Ed Sheeran', 'Bad Habits'],
  [2021, 'pop', 'The Kid LAROI', 'STAY', ['Justin Bieber']],
  [2021, 'pop', 'Glass Animals', 'Heat Waves'],
  [2021, 'rap', 'Lil Nas X', 'MONTERO (Call Me By Your Name)'],
  [2021, 'rnb', 'Silk Sonic', 'Leave the Door Open'],
  [2022, 'pop', 'Harry Styles', 'As It Was'],
  [2022, 'pop', 'Taylor Swift', 'Anti-Hero'],
  [2022, 'rap', 'Jack Harlow', 'First Class'],
  [2022, 'dance', 'David Guetta', "I'm Good (Blue)", ['Bebe Rexha']],
  [2022, 'dance', 'Beyoncé', 'BREAK MY SOUL'],
  [2023, 'pop', 'Miley Cyrus', 'Flowers'],
  [2023, 'rnb', 'SZA', 'Kill Bill'],
  [2023, 'rap', 'Doja Cat', 'Paint The Town Red'],
  [2024, 'pop', 'Sabrina Carpenter', 'Espresso'],
  [2024, 'pop', 'Billie Eilish', 'BIRDS OF A FEATHER'],
  [2024, 'pop', 'Chappell Roan', 'Good Luck, Babe!'],
  [2024, 'pop', 'Lady Gaga', 'Die With A Smile', ['Bruno Mars']],
  [2024, 'rap', 'Kendrick Lamar', 'Not Like Us'],
  [2021, 'fr', 'Stromae', 'Santé'],
  [2021, 'fr', 'Angèle', "Bruxelles je t'aime"],
  [2021, 'fr', 'Orelsan', "L'odeur de l'essence"],
  [2021, 'fr', 'Ninho', 'Jefe'],
  [2022, 'fr', 'Stromae', "L'enfer"],
  [2023, 'fr', 'Slimane', 'Mon amour'],
  [2023, 'fr', 'SDM', 'Bolide allemand'],
];

const DECADES = [
  { id: '70', label: '70s', from: 1970 },
  { id: '80', label: '80s', from: 1980 },
  { id: '90', label: '90s', from: 1990 },
  { id: '00', label: '2000s', from: 2000 },
  { id: '10', label: '2010s', from: 2010 },
  { id: '20', label: '2020s', from: 2020 },
];
const STYLES = [
  { id: 'pop', label: 'Pop' },
  { id: 'rap', label: 'Rap' },
  { id: 'rock', label: 'Rock' },
  { id: 'rnb', label: 'R&B / Soul' },
  { id: 'dance', label: 'Disco / Électro' },
  { id: 'fr', label: '🇫🇷 Français' },
  { id: 'chaabi', label: '🇲🇦 Chaabi' },   // loaded live from Deezer playlists (see Hits.chaabi)
];
const decadeOf = year => DECADES.find(d => year >= d.from && year < d.from + 10) || DECADES[DECADES.length - 1];

const Hits = (() => {
  /** Songs matching the chosen decades and styles, as "media" objects the game understands. */
  function pool(decades, styles) {
    return HITS.map((h, i) => ({ h, i }))
      .filter(({ h }) => decades.includes(decadeOf(h[0]).id) && styles.includes(h[1]))
      .map(({ h, i }) => {
        const [year, style, artist, title, aliases = []] = h;
        const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, ' ').trim();
        const mainArtist = artist;
        return {
          id: 'h' + i,
          display: title,
          title: { english: title, romaji: artist },     // romaji slot = artist (shown under the title)
          synonyms: [cleanTitle, artist, ...aliases].filter((s, k, a) => s && a.indexOf(s) === k),
          choiceLabel: `${title} — ${artist}`,
          coverImage: { large: '' },
          base: Match.norm(cleanTitle),
          artist, mainArtist, year, style,
          decade: decadeOf(year).label,
          styleLabel: STYLES.find(s => s.id === style).label,
        };
      });
  }

  function jsonp(url, cbParam, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const cb = '__jsonp' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const done = () => { clearTimeout(t); delete window[cb]; s.remove(); };
      const t = setTimeout(() => { done(); reject(new Error('timeout')); }, timeout);
      window[cb] = data => { done(); resolve(data); };
      s.onerror = () => { done(); reject(new Error('jsonp')); };
      s.src = url + (url.includes('?') ? '&' : '?') + cbParam + cb;
      document.head.appendChild(s);
    });
  }

  const looks = (a, b) => Match.norm(a).includes(Match.norm(b)) || Match.norm(b).includes(Match.norm(a));

  async function deezer(m) {
    const q = `artist:"${m.mainArtist}" track:"${m.display.replace(/"/g, '')}"`;
    const tries = [
      'https://api.deezer.com/search?limit=8&q=' + encodeURIComponent(q),
      'https://api.deezer.com/search?limit=8&q=' + encodeURIComponent(`${m.mainArtist} ${m.base}`),
    ];
    for (const url of tries) {
      const d = await jsonp(url, 'output=jsonp&callback=');
      const list = ((d && d.data) || []).filter(t => t.preview);
      const t = list.find(x => x.artist && looks(x.artist.name, m.mainArtist)) || list[0];
      if (t) return { url: t.preview, cover: t.album && (t.album.cover_big || t.album.cover_medium) };
    }
    return null;
  }

  async function itunes(m) {
    const d = await jsonp('https://itunes.apple.com/search?entity=song&limit=8&term=' + encodeURIComponent(`${m.mainArtist} ${m.base}`), 'callback=');
    const list = ((d && d.results) || []).filter(t => t.previewUrl);
    const t = list.find(x => looks(x.artistName || '', m.mainArtist)) || list[0];
    return t ? { url: t.previewUrl, cover: (t.artworkUrl100 || '').replace('100x100', '400x400') } : null;
  }

  /** Finds a 30 s preview for a song (Deezer, then iTunes). */
  async function preview(m) {
    for (const src of [deezer, itunes]) {
      try { const r = await src(m); if (r) return r; } catch (e) { /* try the next source */ }
    }
    return null;
  }

  /* ---------- Moroccan chaabi: real songs taken from Deezer's chaabi playlists ---------- */
  let chaabiCache = null;
  const latin = s => Match.norm(s).length >= 2;   // the answer must be typeable with a normal keyboard
  const cleanTitle = t => (t || '').replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s+-\s+.*$/, '').trim();

  function chaabiMedia(list) {
    const seen = new Set(), perArtist = {}, out = [];
    for (const t of list) {
      const title = cleanTitle(t.title), artist = (t.artist || '').trim();
      if (!t.url || !latin(title) || !latin(artist)) continue;
      const key = Match.norm(title) + '|' + Match.norm(artist);
      if (seen.has(key)) continue;
      const a = Match.norm(artist);
      if ((perArtist[a] = (perArtist[a] || 0) + 1) > 4) continue;   // variety: max 4 songs per artist
      seen.add(key);
      out.push({
        id: 'c' + out.length + '-' + key.slice(0, 20),
        display: title,
        title: { english: title, romaji: artist },
        synonyms: [artist],
        choiceLabel: `${title} — ${artist}`,
        coverImage: { large: t.cover || '' },
        base: Match.norm(title),
        artist, mainArtist: artist, year: null, style: 'chaabi',
        decade: '', styleLabel: '🇲🇦 Chaabi',
        preset: { url: t.url, cover: t.cover },
      });
      if (out.length >= 80) break;
    }
    return out;
  }

  async function chaabiDeezer() {
    const tracks = [];
    const playlists = [];
    for (const q of ['chaabi marocain', 'chaabi maroc', 'chaabi']) {
      const d = await jsonp('https://api.deezer.com/search/playlist?limit=10&q=' + encodeURIComponent(q), 'output=jsonp&callback=');
      for (const p of (d && d.data) || []) {
        if (p.nb_tracks >= 15 && !playlists.some(x => x.id === p.id)) playlists.push(p);
      }
      if (playlists.length >= 3) break;
    }
    for (const p of playlists.slice(0, 3)) {
      const d = await jsonp(`https://api.deezer.com/playlist/${p.id}/tracks?limit=100`, 'output=jsonp&callback=');
      for (const t of (d && d.data) || []) {
        if (!t.preview || t.readable === false) continue;
        tracks.push({ title: t.title_short || t.title, artist: t.artist && t.artist.name, url: t.preview, cover: t.album && (t.album.cover_big || t.album.cover_medium) });
      }
    }
    return tracks;
  }

  async function chaabiItunes() {
    const d = await jsonp('https://itunes.apple.com/search?entity=song&limit=150&term=' + encodeURIComponent('chaabi marocain'), 'callback=');
    return ((d && d.results) || []).map(t => ({ title: t.trackName, artist: t.artistName, url: t.previewUrl, cover: (t.artworkUrl100 || '').replace('100x100', '400x400') }));
  }

  /** Chaabi songs (no decade filter: chaabi spans every era). */
  async function chaabi() {
    if (chaabiCache && chaabiCache.length) return shuffle(chaabiCache);
    let list = [];
    try { list = chaabiMedia(await chaabiDeezer()); } catch (e) { /* try iTunes */ }
    if (list.length < 12) { try { list = chaabiMedia([...list.map(m => ({ title: m.display, artist: m.artist, url: m.preset.url, cover: m.preset.cover })), ...await chaabiItunes()]); } catch (e) { /* ignore */ } }
    chaabiCache = list;
    return shuffle(list);
  }

  return { pool, preview, chaabi };
})();

class HitsBank extends MusicBank {
  fill() {
    if (this.filling) return this.filling;
    this.filling = (async () => {
      try {
        let misses = 0;
        while (this.ready.length < 3 && this.queue.length) {
          const batch = this.queue.splice(0, 3);
          const found = await Promise.all(batch.map(m => m.preset || Hits.preview(m)));
          batch.forEach((m, k) => {
            const r = found[k];
            if (!r) { misses++; return; }
            m.coverImage = { large: r.cover || '' };
            this.ready.push({ media: m, audio: { url: r.url, label: m.decade || m.styleLabel } });
          });
          if (!this.ready.length && misses >= 9) throw new Error('Impossible de charger les extraits musicaux (Deezer / iTunes). Vérifie ta connexion.');
        }
      } finally {
        this.filling = null;
      }
    })();
    return this.filling;
  }

  /** Wrong answers: other songs, ideally same style and decade (so the answer isn't obvious), never the same artist. */
  distractors(media, n = 3) {
    const others = shuffle(this.pool.filter(m => m.id !== media.id && m.mainArtist !== media.mainArtist));
    const both = others.filter(m => m.style === media.style && m.decade === media.decade);
    const style = others.filter(m => m.style === media.style);
    const decade = others.filter(m => m.decade === media.decade);
    const picked = [];
    for (const m of [...both, ...style, ...decade, ...others]) {
      if (picked.length >= n) break;
      if (!picked.includes(m) && !picked.some(p => p.mainArtist === m.mainArtist)) picked.push(m);
    }
    return picked;
  }
}
