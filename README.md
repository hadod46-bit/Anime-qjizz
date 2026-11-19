# Anime Quiz Champion 🏆

**4 images or 1 song, 1 animé**: a party quiz to play with friends on one screen, structured like a TV quiz show
(Préliminaire → Demi-finale → Finale).

## How to play
Open the site (or `index.html`) in a browser. There is nothing to install, but you need an internet connection: anime and
images are loaded live from the free [AniList](https://anilist.co) API.

### 🖼️ / 🎵 / 🎤 Three quizzes
- **4 images:** 4 random pictures of an anime (characters and scenes).
- **Musique:** an opening or ending plays (from [AnimeThemes.moe](https://animethemes.moe)). Every timer gets **+10 seconds**.
  A buzz pauses the music and the timer for everyone.
- **Blind test:** about 235 worldwide hits from the 70s to the 2020s (pop, rap, rock, R&B/soul, disco/électro, French songs).
  Pick the decades and styles. Find the **title or the artist**. 30-second previews from Deezer (iTunes as backup), +10 seconds on the timers.
  Direct link: `/blindtest/`. The song list is in `js/hits.js`, so it's easy to add more.

### 📱 Online: each player on their own phone
1. Player 1 picks a nickname and taps **Créer une salle**. A 5-letter code appears.
2. They tap **Partager le lien** (or just say the code) to send it to the others.
3. The others open the link (or type the code), pick a nickname, and tap **Rejoindre**.
4. When everyone shows up in the room, the host taps **Lancer la partie**. Each phone gets its own big **BUZZ !** button.

Up to 4 players. The host's phone runs the game, so keep the page open on it until the end.
The phones connect directly to each other (WebRTC through [PeerJS](https://peerjs.com), whose free public server is used to find each other).

### 📺 Same screen: one device for everyone

| Manche | Format |
|---|---|
| **1. Préliminaire: 9 points gagnants** | Buzz, then pick 1 of 4 answers. Questions are worth 1, then 2, then 3 points. First to 9 qualifies. |
| **2. Demi-finale: 4 à la suite** | Solo turns, 60 s on the clock. Type the anime's name. Get 4 right in a row; a mistake resets the streak. |
| **3. Finale: face à face** | Images appear one at a time. Buzz early for more points (4/3/2/1). First to 12 (or 15/20) wins. |

- Buzzers: online, each phone has its own big **BUZZ !** button. On one screen, each player has a buzzer at the bottom (or keys **A**, **P**, **V**, **M**).
- A buzz stops the timer (and the music) for everyone. In the préliminaire, the 4 choices then appear only for the player who buzzed.
- 2 to 4 players. With 3 or 4 players, the last one in each of the first two rounds is eliminated.
- Typed answers accept English or Japanese (romaji) titles, and small typos are allowed. If a correct answer is refused, click **« C'était bon ! »**.

## Hosting it online (optional)
On GitHub: **Settings → Pages → Deploy from a branch**, then pick this branch and `/ (root)`.
