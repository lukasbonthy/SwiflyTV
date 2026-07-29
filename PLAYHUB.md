# Swifly Play

SwiflyTV has been converted into **Swifly Play**, a standalone browser game and trivia hub.

## Run the new site

```bash
npm install
npm start
```

The app uses `PORT` when provided and otherwise runs on port `3000`.

```env
PORT=3001
HOST=0.0.0.0
SITE_NAME=Swifly Play
```

No TMDB key is required for the new game hub.

## Included experiences

- Trivia Blitz
- Memory Match
- Higher or Lower
- Reaction Rush
- Would You Rather
- Word Scramble
- Daily challenge rotation
- XP, coins, streaks, weekly quest, local progress, and local leaderboard

Progress is stored in the browser using `localStorage`.

## Run the preserved movie build

The old movie version is still present and can be launched separately:

```bash
npm run legacy
```
