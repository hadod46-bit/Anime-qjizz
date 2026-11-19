# Anime Quiz Champion 🏆

**4 images, 1 animé**: a party quiz to play with friends on one screen, structured like a TV quiz show
(Préliminaire → Demi-finale → Finale).

## How to play
Open `index.html` in a browser. There is nothing to install, but you need an internet connection: anime and images
are loaded live from the free [AniList](https://anilist.co) API.

| Manche | Format |
|---|---|
| **1. Préliminaire: 9 points gagnants** | Buzz, then pick 1 of 4 answers. Questions are worth 1, then 2, then 3 points. First to 9 qualifies. |
| **2. Demi-finale: 4 à la suite** | Solo turns, 60 s on the clock. Type the anime's name. Get 4 right in a row; a mistake resets the streak. |
| **3. Finale: face à face** | Images appear one at a time. Buzz early for more points (4/3/2/1). First to 12 (or 15/20) wins. |

- Buzzers: **A** (player 1), **P** (player 2), **V** (player 3), **M** (player 4), or tap your player card.
- 2 to 4 players. With 3 or 4 players, the last one in each of the first two rounds is eliminated.
- Typed answers accept English or Japanese (romaji) titles, and small typos are allowed. If a correct answer is refused, click **« C'était bon ! »**.

## Hosting it online (optional)
On GitHub: **Settings → Pages → Deploy from a branch**, then pick this branch and `/ (root)`.
