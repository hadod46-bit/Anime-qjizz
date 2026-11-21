# Couch Clash 🛋️⚔️

Casual party games to play with friends: four buzzer quizzes (Anime Quiz Champion, anime music, Blind Test, Logo Quiz) and the card game Durak.

## 🏆 The quizzes

**4 pictures, 1 song or 1 logo**: a party quiz to play with friends on one screen, structured like a TV quiz show
(Qualifying round → Semi-final → Final).

## How to play
Open the site (or `index.html`) in a browser. There is nothing to install, but you need an internet connection: anime and
images are loaded live from the free [AniList](https://anilist.co) API.

### 🖼️ / 🎵 / 🎤 / 🏷️ Four quizzes
- **4 images:** 4 random pictures of an anime (characters and scenes).
- **Anime music:** an opening or ending plays (from [AnimeThemes.moe](https://animethemes.moe)). Every timer gets **+10 seconds**.
  A buzz pauses the music and the timer for everyone.
- **Blind test:** about 235 worldwide hits from the 70s to the 2020s (pop, rap, rock, R&B/soul, disco/electronic, French songs),
  plus 🇲🇦 Moroccan chaabi, loaded live from Deezer's chaabi playlists (all eras, no decade filter).
  Pick the decades and styles. Find the **title or the artist**. 30-second previews from Deezer (iTunes as backup), +10 seconds on the timers.
  Direct link: `/blindtest/`.
- **Logos:** 166 brand logos in 7 categories (apps, high-tech, cars, sport, food & shops, video games, travel & misc).
  The logo starts blurred and zoomed in, then gets sharper every 5 seconds. Direct link: `/logos/`.
  Logos come from [Simple Icons](https://simpleicons.org) (CC0), bundled in `js/logos.js`; trademarks belong to their owners. The song list is in `js/hits.js`, so it's easy to add more.

### 📱 Online: each player on their own phone
1. Player 1 picks a nickname and taps **Create a room**. A 5-letter code appears.
2. They tap **Share the link** (or just say the code) to send it to the others.
3. The others open the link (or type the code), pick a nickname, and tap **Join**.
4. When everyone shows up in the room, the host taps **Start the game**. Each phone gets its own big **BUZZ!** button.

Up to 8 players. The host's phone runs the game, so keep the page open on it until the end.
The phones connect directly to each other (WebRTC through [PeerJS](https://peerjs.com), whose free public server is used to find each other).

### 📺 Same screen: one device for everyone

| Manche | Format |
|---|---|
| **1. Qualifying round: first to 9 points** | Buzz, then pick 1 of 4 answers. Questions are worth 1, then 2, then 3 points. First to 9 qualifies. |
| **2. Semi-final: 4 in a row** | Solo turns, 60 s on the clock. Type the anime's name. Get 4 right in a row; a mistake resets the streak. |
| **3. Final: head to head** | Images appear one at a time. Buzz early for more points (4/3/2/1). First to 12 (or 15/20) wins. |

- Buzzers: online, each phone has its own big **BUZZ!** button. On one screen, each player has a buzzer at the bottom (or keys **A**, **P**, **V**, **M**).
- A buzz stops the timer (and the music) for everyone. In the qualifying round, the 4 choices then appear only for the player who buzzed.
- 2 to 8 players online (up to 4 on one screen). The qualifying round qualifies the first to reach 9 points:
  2 players → straight to the final · 3 players → top 2 go to the final · 4 players → top 3 go to the semi-final · 5 to 8 → top 4.
  The semi-final keeps the best 2 for the final.
- Typed answers accept English or Japanese (romaji) titles, and small typos are allowed. If a correct answer is refused, click **“I was right!”**.

## Hosting it online (optional)
On GitHub: **Settings → Pages → Deploy from a branch**, then pick this branch and `/ (root)`.

## 🃏 Durak (card game)
Open `/durak/`. Dedicated to Romana (Романа), our Ukrainian friend who taught us the game 💙💛.

Traditional rules, 36-card deck, two versions chosen by the host in the room:
- **Podkidnoy (classic):** everyone except the defender can throw in cards of a rank already on the table.
- **Perevodnoy (transfer):** before beating anything, the defender can play a card of the same rank to pass the
  whole attack on to the next player (if that player holds enough cards to answer it). The new defender can transfer again.

Also traditional: at most 5 attacking cards in the first bout of a game; first game starts with the lowest trump;
in the next games **the Durak deals and is attacked first**.

- **Online:** create a room and share the code/link, 2 to 6 players. Each phone only sees its own hand.
- **Bots:** the host can add computer players 🤖, or play solo with **Play against the computer**.
  If someone's phone goes silent mid-game, a bot plays their hand until they're back.
- The last player holding cards is the **Durak**; the room keeps count across games.
