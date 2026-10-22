# Yahoo Fantasy Basketball – Mobile

A userscript that restyles the Yahoo Fantasy Basketball **desktop site** into a compact phone layout.
It only rearranges and restyles Yahoo's own page. It makes no API calls and never fetches other pages.
Settings live in the browser's `localStorage` (`ym:settings`).

Target setup: Firefox for Android + Violentmonkey + uBlock Origin, "Desktop site" on.

## What works now (My Team page)

- Compact top bar: 🏀 · My Team · Matchup · Players · League · ⚙
- 🏀 switches between your basketball leagues. On tap it opens Yahoo's own "My Teams & Leagues"
  menu behind the scenes (the same thing hovering "Fantasy Basketball" does on desktop) and
  lists your teams; the list is kept in storage so it shows instantly next time
- Tap your team name for the league's teams, with your current opponent pinned on top.
  Their page gets the same layout, so you can check how their players did today
- Player cards (tap a player name) open full screen: avatar strip, stats tabs with
  sideways-scrolling tables, and news below, with the empty ad slot removed.
  The "Rostered By" box (owner, % rostered, Drop/Add/Trade button, watch star) is shrunk into the
  space beside the rank so it doesn't cover the photo
- Faint dividers between the stat columns
- One block per player: position chip, name, team/positions, injury badge, game status, and the
  9 categories (FG%, FT%, 3PTM, PTS, REB, AST, ST, BLK, TO) on a line under a sticky header
- Players with no game on the selected date collapse to one dimmed line (⚙ → "Show stats" to expand)
- Team card shrunk to one summary line (Yahoo's full card is still one tap away in the teams list)
- Ads, ad space, footer, legend and chat button hidden
- Yahoo's real buttons and links stay in place, restyled: date arrows, stat tabs,
  Start Active Players, Add/Drop, and tap-a-row lineup swaps
- Landscape / wide screens: every player on a single line
- ⚙ → Text size A−/A+, and "Switch off" to get the original page back (a "Mobile layout" pill turns it on again)

## What works on the Matchup page

- Week arrows and day tabs (Live, Totals, each day) as scrollable chips
- Team-vs-team header: logos, full team names, category score, records
- Games played / remaining on one line
- Category board: the 9 categories in the same order as the roster stat line, one row per
  team (marked by logo), each category's winner highlighted
- Rosters one team at a time, with a toggle; same row layout as My Team. The toggle opens on
  your team, and remembers your pick while you switch days
- "Today's Stats | Matchup Totals" switch above the rosters (on the older version it links to
  Yahoo's day tabs; "today" is the US Eastern game day, rolled over at 6 AM Eastern)
- League scoreboard at the bottom: one aligned line per matchup (logo, name, record, score)
- Yahoo currently serves two versions of this page (the older one and a newer React "Live"
  layout with Today's Stats / Matchup Totals); both are handled. The newer one's league
  scoreboard lines haven't been seen on screen yet

## What works on the Players page

- Full-width search, position chips that scroll sideways, "Show my team", and the four
  dropdowns (Status, NBA Teams, Fantasy Teams, Stats) as a 2 x 2 grid
- Each player: a big green + (Yahoo's own Add button) with the watch star under it; name,
  injury badge, team/positions and game result; then roster status (FA / waivers date),
  current rank and % rostered; then the 9 categories under a sticky header
- Changing a filter reloads the table in place; the layout re-applies
- Previous / Next 25 as buttons; the icon legend is hidden

## What works on the League page

- League header: logo beside the name, League Announcements and the season picker
- This week's matchups as aligned lines, with your matchup highlighted
- Standings: rank, team, W-L-T, Pct, GB, waiver priority and moves (Last Week hidden);
  long names shortened with "…", your row highlighted; tab rows scroll sideways
- Recent transactions, Commish notes and updates (author on one line, text full width)
- Fantasy news with small thumbnails, and the NBA scoreboard below

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

The layout works on the phone (confirmed 2026-10-21). The league switcher, teams list and player card
were tested on the live site in desktop Chrome at phone width, not yet on the phone itself.
Still to check on the device:

- Lineup swaps (tap a row, tap the target row) and the swap highlight colours
- Stat-tab switching (Yahoo loads it in place; the script re-applies on every update)
- 🏀 league list loading on Firefox for Android (it relies on Yahoo's hover menu)

## Roadmap

1. Restyle: My Team, Matchup, Players and League done.
2. Analysis from tables already on the page: matchup category status (safe/swing/lost),
   punt-adjusted totals from the Standard Deviations tab, free-agent "fit" column,
   lineup flags (Questionable/Doubtful starters, Out players in active slots).
