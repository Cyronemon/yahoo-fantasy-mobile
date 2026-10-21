# Yahoo Fantasy Basketball – Mobile

A userscript that restyles the Yahoo Fantasy Basketball **desktop site** into a compact phone layout.
It only rearranges and restyles Yahoo's own page. It makes no API calls and never fetches other pages.
Settings live in the browser's `localStorage` (`ym:settings`).

Target setup: Firefox for Android + Violentmonkey + uBlock Origin, "Desktop site" on.

## What works now (My Team page)

- Compact top bar: My Team · Matchup · Players · League · ⚙
- One block per player: position chip, name, team/positions, injury badge, game status, and the
  9 categories (FG%, FT%, 3PTM, PTS, REB, AST, ST, BLK, TO) on a line under a sticky header
- Players with no game on the selected date collapse to one dimmed line (⚙ → "Show stats" to expand)
- Team card shrunk to one summary line (tap the team name to open Yahoo's full card)
- Ads, ad space, footer, legend and chat button hidden
- Yahoo's real buttons and links stay in place, restyled: date arrows, stat tabs,
  Start Active Players, Add/Drop, and tap-a-row lineup swaps
- Landscape / wide screens: every player on a single line
- ⚙ → Text size A−/A+, and "Switch off" to get the original page back (a "Mobile layout" pill turns it on again)

Other Yahoo pages are left untouched for now.

## Install on the phone

1. In Firefox on the phone, open
   <https://raw.githubusercontent.com/Cyronemon/yahoo-fantasy-mobile/main/yahoo-fantasy-mobile.user.js>
   Violentmonkey shows its install page; tap **Install**.
   (If it shows plain text instead: Violentmonkey dashboard → **+** → **Install from URL** → paste the link.)
2. Open your team page from the home-screen shortcut.

Violentmonkey checks that URL for a higher `@version` and updates on its own
(about once a day, or right away with **Check for updates** in its dashboard).

## Releasing an update

1. Bump `@version` in `yahoo-fantasy-mobile.user.js` (e.g. 0.1.0 → 0.1.1). Without a bump, phones won't update.
2. Commit and push to `main`.

## Preview on the computer

`node dev/serve.mjs`, then open `http://localhost:5178/nba/1161/1`.
The server serves `fixtures/team.html` at its real Yahoo path with the script inlined.
Fixtures are saved Yahoo pages and stay out of git (see [fixtures/README.md](fixtures/README.md)).
Add `?raw=1` to see the saved page without the script.
Routes for new fixtures go in the `ROUTES` table in `dev/serve.mjs`.

## Not yet verified on a real phone

Checked against the saved page in a phone-sized browser only. Yahoo's page scripts are not part of
the saved page, so these need a check on the device:

- Lineup swaps (tap a row, tap the target row) and the swap highlight colours
- Player-note popups (tapping a player name)
- Stat-tab switching (Yahoo loads it in place; the script re-applies on every update)
- Text scale with "Desktop site" on (auto-detected; adjust with ⚙ → Text size if it's off)

## Roadmap

1. Restyle (this release): My Team. Next: Matchup, Players (free agents), League pages.
2. Analysis from tables already on the page: matchup category status (safe/swing/lost),
   punt-adjusted totals from the Standard Deviations tab, free-agent "fit" column,
   lineup flags (Questionable/Doubtful starters, Out players in active slots).
