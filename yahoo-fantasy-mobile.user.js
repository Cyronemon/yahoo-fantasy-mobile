// ==UserScript==
// @name         Yahoo Fantasy Basketball – Mobile
// @namespace    https://github.com/Cyronemon/yahoo-fantasy-mobile
// @version      0.5.2
// @description  Compact phone layout for the Yahoo Fantasy Basketball desktop site. Restyles Yahoo's own page; no API calls, no background fetches.
// @homepageURL  https://github.com/Cyronemon/yahoo-fantasy-mobile
// @updateURL    https://raw.githubusercontent.com/Cyronemon/yahoo-fantasy-mobile/main/yahoo-fantasy-mobile.user.js
// @downloadURL  https://raw.githubusercontent.com/Cyronemon/yahoo-fantasy-mobile/main/yahoo-fantasy-mobile.user.js
// @match        https://basketball.fantasysports.yahoo.com/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings (browser storage only)
  // ---------------------------------------------------------------------------
  const STORE_KEY = 'ym:settings';
  const LEAGUES_KEY = 'ym:leagues'; // [{ path, team, league, score, vs }] from Yahoo's league menu
  const DEFAULTS = { on: true, scale: 1, idle: 'collapse' };

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  }

  let settings = { ...DEFAULTS, ...readJSON(STORE_KEY, {}) };
  const saveSettings = () => writeJSON(STORE_KEY, settings);

  // ---------------------------------------------------------------------------
  // Page detection
  // ---------------------------------------------------------------------------
  // Supported pages (any query string). Other pages are left untouched for now.
  const PAGES = [
    ['team', /^\/nba\/(\d+)\/(\d+)(?:\/team)?\/?$/], // /nba/<league>/<team>
    ['matchup', /^\/nba\/(\d+)\/matchup\/?$/],       // /nba/<league>/matchup?week=&mid1=&mid2=
    ['players', /^\/nba\/(\d+)\/players\/?$/],       // /nba/<league>/players (free agents, filters in the query)
    ['league', /^\/nba\/(\d+)\/?$/],                 // /nba/<league>: league home
  ];
  let page = null;
  let pathMatch = null;
  for (const [name, re] of PAGES) {
    pathMatch = location.pathname.match(re);
    if (pathMatch) { page = name; break; }
  }
  if (!page) return;
  const leagueId = pathMatch[1];
  const teamId = page === 'team' ? pathMatch[2] : null;
  // Per-league memory: { own: my team id, opp: current opponent id, mu: matchup link }
  const LEAGUE_KEY = `ym:league:${leagueId}`;

  const html = document.documentElement;
  const CATS = ['FG%', 'FT%', '3PTM', 'PTS', 'REB', 'AST', 'ST', 'BLK', 'TO'];

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const CSS = `
html.ym-on {
  --ym-accent: #7d2eff;
  --ym-line: color-mix(in srgb, currentColor 14%, transparent);
  --ym-faint: color-mix(in srgb, currentColor 58%, transparent);
  /* fixed (not currentColor) so dividers look the same next to faded "-" cells */
  --ym-sep: color-mix(in srgb, var(--ym-fg, #232a31) 18%, transparent);
  --ym-bar-h: 44px;
  -moz-text-size-adjust: none; -webkit-text-size-adjust: none; text-size-adjust: none;
}
html.ym-on body { min-width: 0 !important; overflow-x: hidden; }

/* Desktop chrome, ads and filler */
html.ym-on:not(.ym-show-ybar) .ct-box-hd,
html.ym-on #yspcontentheader,
html.ym-on [class*="Tst-adlocation"],
html.ym-on .ysfbenji,
html.ym-on .Tst-smart-ad,
html.ym-on #FantasyChatButton,
html.ym-on #FantasyChat,
html.ym-on .tablelegend,
html.ym-on #hybrid_entry_point,
html.ym-on #yspcontentfooter,
html.ym-on #yspsub,
html.ym-on #plus-upsell-root,
html.ym-on:not(.ym-show-card) #team-card { display: none !important; }

/* Flatten the fixed-width desktop wrappers around the roster */
html.ym-on .ym-chain,
html.ym-on .RailWrap,
html.ym-on .RailWrap > .Rail,
html.ym-on .RailResponsive,
html.ym-on .RailFull,
html.ym-on .Page-herocontent {
  display: block !important; float: none !important;
  width: auto !important; min-width: 0 !important; max-width: none !important;
  margin-left: 0 !important; margin-right: 0 !important;
  padding-left: 0 !important; padding-right: 0 !important;
}
html.ym-on #fantasy { padding-top: 0 !important; }
/* Yahoo paints side "bleed" panels past the page edges; they cause sideways scroll */
html.ym-on .Page-bd::before,
html.ym-on .Page-bd::after { display: none !important; }
html.ym-on #yspcontentmainhero { padding: 0 !important; margin: 0 !important; width: auto !important; }

/* Top bar */
#ym-bar, #ym-summary, .ym-sheet, #ym-pill { display: none; }
html.ym-on #ym-bar {
  display: flex; align-items: center; gap: 2px;
  position: sticky; top: 0; z-index: 9000; /* below Yahoo's own overlays (10000+) */
  height: var(--ym-bar-h); padding: 0 4px 0 8px; box-sizing: border-box;
  background: var(--ym-bg, #fff); color: var(--ym-fg, #232a31);
  border-bottom: 1px solid var(--ym-line);
  font: 600 14px/1 "YahooSans VF", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
#ym-bar nav { display: flex; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
#ym-bar nav a {
  flex: none; padding: 0 10px; height: var(--ym-bar-h); display: flex; align-items: center;
  color: inherit; text-decoration: none; border-bottom: 3px solid transparent; box-sizing: border-box;
}
#ym-bar nav a.ym-cur { border-bottom-color: var(--ym-accent); }
#ym-bar button {
  flex: none; width: 40px; height: 40px; border: 0; background: none; color: inherit;
  font-size: 20px; line-height: 1; cursor: pointer; padding: 0;
}
#ym-bar .ym-lg { width: auto; padding: 0 4px; font-size: 18px; }
#ym-bar .ym-lg::after { content: "▾"; font-size: 11px; margin-left: 1px; color: var(--ym-faint); }

/* Team summary (replaces the large team card) */
html.ym-on #ym-summary {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id mu" "notes mu";
  align-items: center; gap: 2px 10px; padding: 10px 8px 4px; color: var(--ym-fg, inherit);
}
#ym-summary .ym-id { grid-area: id; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; min-width: 0; }
#ym-summary .ym-team {
  font: inherit; font-size: 17px; font-weight: 700; line-height: 1.2; color: inherit; background: none; border: 0; padding: 0;
  cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#ym-summary .ym-team::after { content: " ▾"; font-size: 11px; color: var(--ym-faint); }
#ym-summary .ym-rec { font-size: 12px; color: var(--ym-faint); white-space: nowrap; }
#ym-summary .ym-tag { align-self: center; }
#ym-summary .ym-mu {
  grid-area: mu; display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 14px; border: 1px solid var(--ym-line);
  font-size: 12px; color: inherit; text-decoration: none; white-space: nowrap;
}
#ym-summary .ym-mu b { font-size: 14px; }
#ym-summary .ym-notes { grid-area: notes; font-size: 11px; color: var(--ym-faint); }
html.ym-on:not(.ym-show-card) #teamnotes.ym-compacted { display: none !important; }

/* Popup sheets: settings, leagues, league teams */
html.ym-on .ym-sheet:not([hidden]) {
  display: block; position: fixed; z-index: 9001; top: var(--ym-bar-h); right: 6px; left: 6px;
  max-width: 360px; max-height: calc(100% - var(--ym-bar-h) - 12px); overflow-y: auto;
  margin-left: auto; padding: 12px; box-sizing: border-box; text-align: left;
  background: var(--ym-bg, #fff); color: var(--ym-fg, #232a31);
  border: 1px solid var(--ym-line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.25);
  font: 14px/1.3 "YahooSans VF", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
html.ym-on .ym-sheet.ym-start:not([hidden]) { margin-left: 0; margin-right: auto; }
.ym-sheet h3 { margin: 2px 4px 6px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ym-faint); }
.ym-sheet .ym-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; }
.ym-sheet .ym-row + .ym-row { border-top: 1px solid var(--ym-line); }
.ym-sheet .ym-seg { display: inline-flex; border: 1px solid var(--ym-line); border-radius: 8px; overflow: hidden; }
.ym-sheet .ym-seg button, .ym-sheet .ym-btn {
  min-width: 36px; height: 32px; padding: 0 10px; border: 0; background: none; color: inherit;
  font: inherit; font-size: 13px; cursor: pointer;
}
.ym-sheet .ym-seg button + button { border-left: 1px solid var(--ym-line); }
.ym-sheet .ym-seg button[aria-pressed="true"] { background: var(--ym-accent); color: #fff; }
.ym-sheet .ym-btn { border: 1px solid var(--ym-line); border-radius: 8px; }
.ym-sheet .ym-val { min-width: 48px; text-align: center; font-variant-numeric: tabular-nums; }
.ym-sheet .ym-list a {
  display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-radius: 8px;
  color: inherit !important; text-decoration: none !important;
}
.ym-sheet .ym-list a + a { border-top: 1px solid var(--ym-line); }
.ym-sheet .ym-list a[aria-current] { background: color-mix(in srgb, var(--ym-accent) 10%, transparent); }
.ym-sheet .ym-list a.ym-opp { background: color-mix(in srgb, #ff7a00 14%, transparent); }
.ym-sheet .ym-main { flex: 1; min-width: 0; }
.ym-sheet .ym-main b, .ym-sheet .ym-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ym-sheet small { font-size: 12px; color: var(--ym-faint); }
.ym-sheet .ym-side { flex: none; text-align: right; }
.ym-sheet .ym-hint { margin: 8px 4px 2px; font-size: 12px; color: var(--ym-faint); }
.ym-sheet .ym-foot { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ym-line); text-align: center; }
.ym-tag {
  flex: none; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: .03em;
  text-transform: uppercase; background: var(--ym-accent); color: #fff; white-space: nowrap;
}
.ym-tag.ym-opp-tag { background: #e86a00; }

/* Floating switch shown while the mobile layout is off */
html:not(.ym-on) #ym-pill {
  display: block; position: fixed; right: 12px; bottom: 12px; z-index: 2147483000;
  padding: 10px 14px; border: 0; border-radius: 22px; background: #7d2eff; color: #fff;
  font: 600 14px/1 "Helvetica Neue", Helvetica, Arial, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.3);
  zoom: var(--ym-pill-zoom, 1);
}

/* Alerts, team notes */
html.ym-on #Alerts { padding: 6px 8px 0 !important; }
html.ym-on #Alerts .Alert { z-index: auto !important; } /* Yahoo's 10002 paints over the sticky bar */
html.ym-on #Alerts .Message { font-size: 12px; line-height: 1.35; padding: 8px 0 !important; }
html.ym-on #Alerts .Wpx-40 { padding: 0 8px !important; width: auto !important; }
html.ym-on #Alerts .Wpx-20 { padding: 0 10px !important; width: auto !important; }
html.ym-on #team-card { margin: 0 8px 8px !important; }
html.ym-on #teamnotes { margin: 4px 8px 0 !important; padding: 0 !important; width: auto !important; }
html.ym-on #teamnotes .teamnotes-content > div { flex-wrap: wrap; gap: 2px 12px; padding: 6px 10px !important; }
html.ym-on #teamnotes .Mend-xl { margin: 0 !important; }

/* Roster header: date, stat tabs, period tabs, action buttons */
html.ym-on #team-roster > header { padding: 0 !important; border: 0 !important; }
html.ym-on #full_stat_nav { display: flex; flex-direction: column; gap: 6px; padding: 8px 0 4px !important; border: 0 !important; }
html.ym-on #full_stat_nav > .yfa-date-nav { align-self: flex-start; margin: 0 4px; }
html.ym-on #full_stat_nav .Flyoutselectbox { width: auto !important; }
html.ym-on #full_stat_nav > .navlist,
html.ym-on #statsubnav .Subnav-main { display: block !important; width: auto !important; margin: 0 !important; padding: 0 !important; background: none !important; border: 0 !important; }
html.ym-on #statnav,
html.ym-on #statsubnav ul {
  display: flex; flex-wrap: nowrap; gap: 6px; overflow-x: auto; scrollbar-width: none;
  margin: 0 !important; padding: 0 8px !important; border: 0 !important; width: auto !important;
}
html.ym-on #statnav > li,
html.ym-on #statsubnav li { flex: none; float: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: none !important; }
html.ym-on #statnav a,
html.ym-on #statsubnav a {
  display: block; padding: 6px 11px !important; margin: 0 !important;
  border: 1px solid var(--ym-line) !important; border-radius: 15px;
  font-size: 12px !important; line-height: 16px !important; font-weight: 500;
  color: inherit !important; text-decoration: none !important; white-space: nowrap; background: none;
}
html.ym-on #statnav li.Selected a,
html.ym-on #statsubnav li.Selected a { background: var(--ym-accent) !important; border-color: transparent !important; color: #fff !important; }
html.ym-on #statnav .Navpointer { display: none !important; }

html.ym-on #team-roster > header > .D-f {
  display: flex !important; flex-wrap: nowrap; align-items: center; gap: 6px;
  overflow-x: auto; scrollbar-width: none; padding: 6px 8px 8px !important; width: auto !important;
}
html.ym-on #team-roster > header > .D-f > div { flex: none; display: flex; gap: 6px; padding: 0 !important; }
html.ym-on #team-roster > header .Btn,
html.ym-on #team-roster .start-active-players {
  margin: 0 !important; height: 32px !important; padding: 0 12px !important;
  font-size: 12px !important; line-height: 30px !important; border-radius: 16px !important; white-space: nowrap;
}
html.ym-on #fantasy_start_active_overlay dialog { width: auto !important; max-width: calc(100% - 16px) !important; }

/* Roster table: one compact block per player */
html.ym-on #team-roster .tablewrap { overflow: visible !important; width: auto !important; }
html.ym-on table[data-ym-table~="roster"] {
  display: block !important; width: 100% !important; min-width: 0 !important; overflow: visible !important;
  font-size: 13px; border: 0 !important; margin: 0 !important;
}
html.ym-on table[data-ym-table~="roster"] > thead,
html.ym-on table[data-ym-table~="roster"] > tbody,
html.ym-on table[data-ym-table~="roster"] > tfoot { display: block; }
html.ym-on table[data-ym-table~="roster"] > caption { display: none; }
html.ym-on table[data-ym-table~="roster"] > thead {
  position: sticky; top: var(--ym-bar-h); z-index: 50;
  background: var(--ym-bg, #fff); border-bottom: 1px solid var(--ym-line);
}
html.ym-on table[data-ym-table~="roster"] > thead > tr:not(:last-child) { display: none !important; }
html.ym-on table[data-ym-table~="roster"] tr:not([style*="none"]) {
  display: grid !important;
  grid-template-columns: 44px repeat(var(--ym-n, 9), minmax(0, 1fr));
  align-items: center; height: auto !important; padding: 0 6px 0 4px; box-sizing: border-box;
}
html.ym-on table[data-ym-table~="roster"] > tbody > tr { border-top: 1px solid var(--ym-line); }
html.ym-on table[data-ym-table~="roster"] td,
html.ym-on table[data-ym-table~="roster"] th {
  display: block; width: auto !important; min-width: 0; height: auto !important;
  padding: 0 !important; border: 0 !important; background: none !important; text-align: center;
}
html.ym-on table[data-ym-table~="roster"] [data-ym="hide"] { display: none !important; }

/* header labels */
html.ym-on table[data-ym-table~="roster"] th { font-size: 10px !important; font-weight: 700; letter-spacing: .02em; color: var(--ym-faint); padding: 7px 0 6px !important; white-space: nowrap; }
html.ym-on table[data-ym-table~="roster"] th[data-ym="stat"] { text-align: center !important; }
html.ym-on table[data-ym-table~="roster"] th a { color: inherit !important; }
html.ym-on table[data-ym-table~="roster"] th[data-ym="pos"] { grid-column: 1; grid-row: 1; } /* matchup tables put it mid-row */
html.ym-on table[data-ym-table~="roster"] th[data-ym="player"] { display: none; text-align: left; padding-left: 6px !important; }

/* position chip: Yahoo's own swap target */
html.ym-on table[data-ym-table~="roster"] td[data-ym="pos"] { grid-column: 1; grid-row: 1 / span 2; align-self: center; }
html.ym-on table[data-ym-table~="roster"] .pos-label {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: auto !important; min-width: 36px !important; height: 26px; padding: 0 4px; box-sizing: border-box;
  border-radius: 7px; font-size: 11px; font-weight: 700; letter-spacing: .02em;
  background: color-mix(in srgb, var(--ym-accent) 16%, transparent); color: inherit;
}
html.ym-on table[data-ym-table~="roster"] tr.bench .pos-label { background: color-mix(in srgb, currentColor 9%, transparent); }
html.ym-on table[data-ym-table~="roster"] tr[data-pos="IL"] .pos-label,
html.ym-on table[data-ym-table~="roster"] tr[data-pos="IL+"] .pos-label { background: color-mix(in srgb, #cc0e25 18%, transparent); }
html.ym-on table[data-ym-table~="roster"] > tbody > tr:not(.editable) .pos-label { background: none; box-shadow: inset 0 0 0 1px var(--ym-line); }
html.ym-on table[data-ym-table~="roster"] > tbody > tr:not(.bench) + tr.bench { border-top: 2px solid color-mix(in srgb, currentColor 28%, transparent); }

/* player line */
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] { grid-column: 2 / -1; grid-row: 1; text-align: left; padding: 7px 0 1px 6px !important; overflow: hidden; }
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] > div { width: auto !important; }
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] .Lh-0.Relative,
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] img { display: none !important; }
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] .D-f.Jc-fs { padding: 0 !important; }
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] .Pstart-sm[style] { width: auto !important; flex: 1; min-width: 0; padding: 0 !important; }
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] .D-f.Jc-sb { display: block !important; }
html.ym-on table[data-ym-table~="roster"] td[data-ym="player"] .Ta-start.Truncate { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-name { display: flex !important; align-items: baseline; gap: 5px; min-width: 0; flex: 0 1 auto; overflow: hidden; line-height: 18px !important; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-name a.name { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 600; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-name .D-b { display: inline !important; flex: none; color: var(--ym-faint); }
html.ym-on table[data-ym-table~="roster"] .ysf-player-name .D-b .Fz-xxs { font-size: 11px !important; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-status { flex: none; order: 1; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-status span { padding: 1px 4px !important; border-radius: 4px; font-size: 10px; font-weight: 700; background: color-mix(in srgb, #cc0e25 14%, transparent); }
html.ym-on table[data-ym-table~="roster"] .player-status { flex: none; order: 2; padding: 0 !important; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-name .D-b { order: 3; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-detail { margin-left: auto; flex: none; font-size: 11px !important; color: var(--ym-faint); line-height: 18px !important; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-detail a { color: inherit !important; }
html.ym-on table[data-ym-table~="roster"] .ysf-player-detail[data-ym-opp]:not(:has(.ysf-game-status a))::before { content: attr(data-ym-opp); }

/* stat line */
html.ym-on table[data-ym-table~="roster"] td[data-ym="stat"] {
  padding: 1px 0 7px !important; font-size: 12px; font-variant-numeric: tabular-nums; text-align: center !important;
  white-space: nowrap; overflow: hidden; text-overflow: clip;
}
html.ym-on table[data-ym-table~="roster"] td[data-ym="stat"][data-ym-empty] { color: var(--ym-faint); }
/* short faint line between stat columns (a dot would read like the decimal in .474) */
html.ym-on table[data-ym-table~="roster"] [data-ym="stat"] ~ [data-ym="stat"] {
  background: linear-gradient(var(--ym-sep), var(--ym-sep)) left center / 1px 14px no-repeat !important;
}

/* lineup totals */
html.ym-on table[data-ym-table~="roster"] > tfoot > tr { border-top: 2px solid color-mix(in srgb, currentColor 28%, transparent); }
html.ym-on table[data-ym-table~="roster"] > tfoot td[data-ym="pos"] { display: block !important; visibility: hidden; }
html.ym-on table[data-ym-table~="roster"] > tfoot td[data-ym="player"] {
  padding-top: 8px !important; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ym-faint);
}
html.ym-on table[data-ym-table~="roster"] > tfoot td[data-ym="stat"] { font-weight: 700; padding-bottom: 10px !important; }

/* players with no game on the selected date */
html.ym-on table[data-ym-table~="roster"] tr.ym-idle td[data-ym="player"] { opacity: .6; }
html.ym-on:not(.ym-idle-show) table[data-ym-table~="roster"] tr.ym-idle td[data-ym="stat"] { display: none !important; }
html.ym-on:not(.ym-idle-show) table[data-ym-table~="roster"] tr.ym-idle td[data-ym="player"] { padding-bottom: 7px !important; }

/* rows whose cells don't line up with the header (e.g. empty slots during a swap) */
html.ym-on table[data-ym-table~="roster"] tr[data-ym-odd] { grid-template-columns: 44px 1fr; }
html.ym-on table[data-ym-table~="roster"] tr[data-ym-odd] > td:not(:first-child) { grid-column: 2; text-align: left; padding: 8px 6px !important; }
html.ym-on table[data-ym-table~="roster"] tr[data-ym-odd] > td:first-child { grid-row: 1 / span 9; }

/* too many columns for the phone: let the table scroll sideways instead */
html.ym-on #team-roster .tablewrap.ym-scroll { overflow-x: auto !important; }
html.ym-on table[data-ym-table~="roster"][data-ym-table~="many"] { width: max-content !important; min-width: 100% !important; }
html.ym-on table[data-ym-table~="roster"][data-ym-table~="many"] tr:not([style*="none"]) { grid-template-columns: 44px repeat(var(--ym-n), 46px); }

/* landscape / wide: everything on one line */
html.ym-on.ym-wide table[data-ym-table~="roster"] tr:not([style*="none"]) {
  grid-template-columns: 48px minmax(200px, 1fr) repeat(var(--ym-n, 9), 50px);
}
html.ym-on.ym-wide table[data-ym-table~="roster"] td[data-ym="pos"] { grid-row: 1; }
html.ym-on.ym-wide table[data-ym-table~="roster"] td[data-ym="player"] { grid-column: 2; padding: 6px 8px 6px 6px !important; }
html.ym-on.ym-wide table[data-ym-table~="roster"] th[data-ym="player"] { display: block !important; grid-column: 2; }
html.ym-on.ym-wide table[data-ym-table~="roster"] td[data-ym="stat"] { padding: 6px 0 !important; }
html.ym-on.ym-wide:not(.ym-idle-show) table[data-ym-table~="roster"] tr.ym-idle td[data-ym="stat"] { display: block !important; visibility: hidden; }

/* ---- Matchup page ---- */
html.ym-on.ym-page-matchup #legend { display: none !important; }
html.ym-on.ym-page-matchup #yspmaincontent > .Mod { margin-bottom: 6px !important; }
/* week arrows + day tabs */
html.ym-on.ym-page-matchup #yspmaincontent > section:first-child > .Hd > .Grid-h-mid {
  display: flex !important; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px 0 4px; border: 0 !important;
}
html.ym-on.ym-page-matchup #yspmaincontent > section:first-child > .Hd > .Grid-h-mid > .Grid-u { width: auto !important; padding: 0 4px !important; }
html.ym-on.ym-page-matchup #yspmaincontent > section:first-child .Flyoutselectbox { width: auto !important; }
html.ym-on.ym-page-matchup .moduletabs { width: auto !important; }
html.ym-on.ym-page-matchup .moduletabs ul {
  display: flex !important; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 0 4px !important; margin: 0 !important; border: 0 !important;
}
html.ym-on.ym-page-matchup .moduletabs li { flex: none; float: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; width: auto !important; }
html.ym-on.ym-page-matchup .moduletabs a {
  display: block; padding: 6px 11px !important; border: 1px solid var(--ym-line) !important; border-radius: 15px;
  font-size: 12px !important; line-height: 16px !important; color: inherit !important; text-decoration: none !important; white-space: nowrap;
}
html.ym-on.ym-page-matchup .moduletabs li.Selected a { background: var(--ym-accent) !important; border-color: transparent !important; color: #fff !important; }
/* team vs team header */
html.ym-on #matchup-header { margin: 0 !important; padding: 6px 6px 0 !important; }
html.ym-on #matchup-header .Grid-h-mid {
  display: grid !important; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 6px;
}
html.ym-on #matchup-header .Grid-u-1-3 { width: auto !important; max-width: none !important; min-width: 0; padding: 0 !important; }
html.ym-on #matchup-header .Grid-u-1-3:not(:nth-child(2)) > div {
  display: flex !important; flex-direction: column; align-items: center; text-align: center !important; padding: 4px 0 !important; min-width: 0;
}
html.ym-on #matchup-header .Grid-u-1-3:not(:nth-child(2)) > div > * { width: auto !important; max-width: 100%; padding: 0 !important; min-width: 0; text-align: center !important; }
html.ym-on #matchup-header .Grid-u-1-3:not(:nth-child(2)) > div > :not(a) { align-self: stretch; } /* names wrap at full column width */
html.ym-on #matchup-header a:has(> img) { order: -1; margin-bottom: 4px; }
html.ym-on #matchup-header img { width: 40px !important; height: 40px !important; }
html.ym-on #matchup-header .Fz-xxl.Ell {
  font-size: 15px !important; line-height: 1.2 !important; white-space: normal !important;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: break-word;
}
html.ym-on #matchup-header .user-id { font-size: 11px; opacity: .7; }
html.ym-on #matchup-header .Grid-u-1-3:nth-child(2) table { margin: 0 !important; }
html.ym-on #matchup-header .Grid-u-1-3:nth-child(2) tr:has(.felo-matchup-button) { display: none; } /* "Compare Managers" */
html.ym-on #matchup-header td.Fz-xxl { font-size: 28px !important; font-weight: 700; padding: 0 6px !important; }
html.ym-on #matchup-header th { padding: 0 2px !important; }
html.ym-on #remaining-games { padding: 6px 8px !important; }
html.ym-on #remaining-games .Grid-h-mid { display: flex !important; justify-content: space-between; gap: 6px; font-size: 10px !important; }
html.ym-on #remaining-games .Grid-h-mid > .Grid-u-1-3 { width: auto !important; flex: none; white-space: nowrap; }
html.ym-on #remaining-games .Grid-h-mid span[class*="M"] { margin-left: 3px !important; margin-right: 3px !important; }
html.ym-on [id^="matchupcontent"] { overflow: visible !important; } /* lets the roster header stick */
/* category totals: compact 9-column board, winners highlighted */
html.ym-on #matchup-wall-header { margin: 0 !important; padding: 0 !important; }
html.ym-on #matchup-wall-header > :not(table):not(:has(table)) { display: none !important; } /* "*Non-scoring stats" note */
html.ym-on #matchup-wall-header * { width: auto !important; min-width: 0 !important; }
html.ym-on table[data-ym-table~="cats"] { display: block !important; width: 100% !important; margin: 4px 0 0 !important; border: 0 !important; font-size: 13px; }
html.ym-on table[data-ym-table~="cats"] > thead,
html.ym-on table[data-ym-table~="cats"] > tbody { display: block; }
/* team column shows just the logo; names are in the header and the roster toggle */
html.ym-on table[data-ym-table~="cats"] tr {
  display: grid !important; grid-template-columns: 26px repeat(9, minmax(0, 1fr)); column-gap: 2px;
  align-items: center; padding: 0 4px 0 6px; height: auto !important;
}
html.ym-on table[data-ym-table~="cats"] > tbody > tr { border-top: 1px solid var(--ym-line); }
html.ym-on table[data-ym-table~="cats"] td,
html.ym-on table[data-ym-table~="cats"] th {
  display: block; padding: 7px 0 !important; border: 0 !important; background: none !important; text-align: center !important;
  white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums;
}
html.ym-on table[data-ym-table~="cats"] [data-ym="hide"] { display: none !important; }
html.ym-on table[data-ym-table~="cats"] th { font-size: 10px !important; font-weight: 700; color: var(--ym-faint); padding: 6px 0 !important; }
html.ym-on table[data-ym-table~="cats"] [data-ym="team"] { font-size: 0 !important; line-height: 0; }
/* Yahoo pads the team cell's inner box 16px, which pushed the logo under the first value */
html.ym-on table[data-ym-table~="cats"] [data-ym="team"] * { padding: 0 !important; margin: 0 !important; width: auto !important; }
html.ym-on table[data-ym-table~="cats"] td[data-ym="team"] > div,
html.ym-on table[data-ym-table~="cats"] td[data-ym="team"] > div > div { display: flex !important; justify-content: center; }
html.ym-on table[data-ym-table~="cats"] [data-ym="team"] img { width: 22px !important; height: 22px !important; }
html.ym-on table[data-ym-table~="cats"] td[data-ym="stat"] { font-weight: 400; font-size: 12px !important; }
html.ym-on table[data-ym-table~="cats"] td[data-ym="stat"]:is(.Fw-b, [class~="Fw(b)"]) { /* old / React page */
  font-weight: 700; color: var(--ym-accent);
  background: color-mix(in srgb, var(--ym-accent) 14%, transparent) !important; border-radius: 6px;
}
/* league scoreboard at the bottom ("Matchups"): one aligned line per matchup.
   Yahoo nests each side as name/logo + score boxes; flatten them into one 7-column grid. */
html.ym-on #matchupweek { margin: 16px 0 0 !important; }
html.ym-on #matchupweek > header { display: flex !important; align-items: center; justify-content: space-between; padding: 0 8px 8px !important; }
html.ym-on #matchupweek > header h2 { font-size: 18px !important; }
html.ym-on #matchupweek .Submod > .Grid-h-mid { display: flex !important; justify-content: space-between; padding: 8px !important; }
html.ym-on #matchupweek .Submod > .Grid-h-mid > * { width: auto !important; display: flex !important; align-items: center; gap: 6px; white-space: nowrap; }
html.ym-on #matchupweek .Grid-table {
  display: grid !important; grid-template-columns: 30px minmax(0, 1fr) 20px 16px 20px minmax(0, 1fr) 30px;
  grid-template-areas: "la na sa vs sb nb lb"; align-items: center; column-gap: 6px;
  width: auto !important; padding: 8px !important; box-sizing: border-box;
}
html.ym-on #matchupweek .Grid-table > div:not(:nth-child(2)),
html.ym-on #matchupweek .Grid-table > div:not(:nth-child(2)) > .Grid-h-mid,
html.ym-on #matchupweek .Grid-table .Grid-u-3-4,
html.ym-on #matchupweek .Grid-table .Grid-u-3-4 > div { display: contents !important; }
html.ym-on #matchupweek .Grid-table * { padding: 0 !important; margin: 0 !important; max-width: none !important; }
html.ym-on #matchupweek .Grid-table > div:first-child span:has(img) { grid-area: la; }
html.ym-on #matchupweek .Grid-table > div:last-child span:has(img) { grid-area: lb; }
html.ym-on #matchupweek .Grid-table > div:first-child .Grid-u-3-4 > div > div { grid-area: na; text-align: left !important; }
html.ym-on #matchupweek .Grid-table > div:last-child .Grid-u-3-4 > div > div { grid-area: nb; text-align: right !important; }
html.ym-on #matchupweek .Grid-table > div:first-child .Grid-u-1-4 { grid-area: sa; text-align: right !important; }
html.ym-on #matchupweek .Grid-table > div:last-child .Grid-u-1-4 { grid-area: sb; text-align: left !important; }
html.ym-on #matchupweek .Grid-table > div:nth-child(2) { grid-area: vs; display: block !important; width: auto !important; text-align: center; }
html.ym-on #matchupweek .Grid-table .Grid-u-3-4 > div > div,
html.ym-on #matchupweek .Grid-table .Grid-u-1-4 { display: block !important; width: auto !important; min-width: 0; }
html.ym-on #matchupweek .Grid-table .Ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px !important; }
html.ym-on #matchupweek .Grid-table .Fz-lg { font-size: 17px !important; font-weight: 700; }
html.ym-on #matchupweek .Grid-table img { width: 30px !important; height: 30px !important; display: block; }

/* "Today's Stats | Matchup Totals" (older matchup page; links to Yahoo's day tabs) */
#ym-period { display: none; }
html.ym-on #ym-period { display: flex; justify-content: center; gap: 6px; margin: 12px 8px 0; }
#ym-period a {
  padding: 6px 12px; border: 1px solid var(--ym-line); border-radius: 15px;
  font-size: 12px; color: inherit !important; text-decoration: none !important; white-space: nowrap;
}
#ym-period a[aria-current] { background: var(--ym-accent); border-color: transparent; color: #fff !important; }

/* team toggle above the rosters */
html.ym-on #ym-sides { display: flex; margin: 12px 8px 6px; border: 1px solid var(--ym-line); border-radius: 10px; overflow: hidden; }
#ym-sides { display: none; }
#ym-sides button {
  flex: 1; min-width: 0; height: 36px; padding: 0 8px; border: 0; background: none; color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
#ym-sides button + button { border-left: 1px solid var(--ym-line); }
#ym-sides button[aria-selected="true"] { background: var(--ym-accent); color: #fff; }
/* rosters: same rows as My Team, one team at a time */
html.ym-on table[data-ym-table~="roster"][data-ym-show="a"] [data-ym-side="b"],
html.ym-on table[data-ym-table~="roster"][data-ym-show="b"] [data-ym-side="a"] { display: none !important; }
html.ym-on table[data-ym-table~="mu"] td[data-ym="pos"] {
  justify-self: center; align-self: center; display: flex; align-items: center; justify-content: center;
  min-width: 36px; height: 26px !important; padding: 0 4px !important; box-sizing: border-box; border-radius: 7px;
  font-size: 11px; font-weight: 700; color: inherit !important;
  background: color-mix(in srgb, currentColor 9%, transparent) !important;
}
html.ym-on table[data-ym-table~="mu"] { border: 0 !important; }

/* React matchup page (#redzone, Oct 2026): header, categories, stat tabs, rosters, scoreboard */
html.ym-on #redzone, html.ym-on #redzone .RedZone, html.ym-on #redzone .RedZone * { max-width: 100%; }
html.ym-on #redzone [class*="Px(15px)"], html.ym-on #redzone [class*="Px(10px)"] { padding-left: 0 !important; padding-right: 0 !important; }
html.ym-on #redzone table { margin: 4px 0 !important; box-shadow: none !important; }
html.ym-on #matchup { overflow: visible !important; height: auto !important; } /* lets the roster header stick */
/* "Today's Stats | Matchup Totals" as chips; "Show Dropped Players" below them */
html.ym-on .RedZone > div:has(> ul + label) { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 10px 0 0 !important; }
html.ym-on .RedZone > div:has(> ul + label) > ul { display: flex !important; gap: 6px; padding: 0 !important; }
html.ym-on .RedZone > div:has(> ul + label) > ul > li {
  padding: 6px 12px !important; border: 1px solid var(--ym-line); border-radius: 15px; font-size: 12px;
}
html.ym-on .RedZone > div:has(> ul + label) > ul > li[class~="Fw(b)"] { background: var(--ym-accent); border-color: transparent; }
html.ym-on .RedZone > div:has(> ul + label) > ul > li[class~="Fw(b)"] a { color: #fff !important; }
html.ym-on .RedZone > div:has(> ul + label) > label { position: static !important; font-size: 12px; }
/* team lines: big header at the top, compact rows in the league scoreboard */
html.ym-on [data-ym-line] {
  display: grid !important; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 6px;
}
html.ym-on [data-ym-line] > * { width: auto !important; min-width: 0; flex: none !important; }
html.ym-on [data-ym-line] [data-ym-box] > div { padding: 0 !important; min-width: 0; }
html.ym-on [data-ym-line] [data-ym-box] a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
html.ym-on [data-ym-line] [data-ym-box="mid"] > div { display: flex !important; align-items: center; gap: 8px; }
html.ym-on [data-ym-line] [data-ym-box="mid"] > div > div { flex: none !important; min-width: 0 !important; width: auto !important; }
html.ym-on [data-ym-line] [data-ym-box="mid"] .felo-matchup-button { padding: 3px 8px !important; font-size: 11px !important; }
html.ym-on [data-ym-line="head"] { padding: 8px 6px 4px; }
html.ym-on [data-ym-line="head"] [data-ym-box]:not([data-ym-box="mid"]) > div {
  flex-direction: column !important; align-items: center !important; text-align: center;
}
html.ym-on [data-ym-line="head"] [data-ym-box]:not([data-ym-box="mid"]) > div > div { align-items: center !important; }
html.ym-on [data-ym-line="head"] img { width: 44px !important; height: 44px !important; margin-bottom: 4px; }
html.ym-on [data-ym-line="head"] [data-ym-box] a { font-size: 15px !important; font-weight: 700; white-space: normal; text-align: center; }
html.ym-on [data-ym-line="head"] [data-ym-box="mid"] { font-size: 28px !important; font-weight: 700; }
html.ym-on [data-ym-line="row"] { padding: 8px; }
html.ym-on [data-ym-line="row"] [data-ym-box="a"] > div { flex-direction: row !important; justify-content: flex-start; gap: 8px; }
html.ym-on [data-ym-line="row"] [data-ym-box="b"] > div { flex-direction: row-reverse !important; justify-content: flex-start; gap: 8px; }
html.ym-on [data-ym-line="row"] [data-ym-box="a"] > div > div { align-items: flex-start !important; text-align: left; }
html.ym-on [data-ym-line="row"] [data-ym-box="b"] > div > div { align-items: flex-end !important; text-align: right; }
html.ym-on [data-ym-line="row"] img { width: 30px !important; height: 30px !important; flex: none; }
html.ym-on [data-ym-line="row"] [data-ym-box] a { font-size: 13px !important; }
html.ym-on [data-ym-line="row"] [data-ym-box]:not([data-ym-box="mid"]) > div > div > div:nth-child(2) { display: none; } /* manager name */
html.ym-on [data-ym-line="row"] [data-ym-box="mid"] { font-size: 17px !important; font-weight: 700; }
html.ym-on [data-ym-line] [data-ym-box]:not([data-ym-box="mid"]) > div > div > div { font-size: 11px; }
/* React roster player cell (no .ysf-player-name): name, team-pos, notes icon, game status on one line */
html.ym-on table[data-ym-table~="mu"] td[data-ym="player"] > div:not(:has(.ysf-player-name)) {
  display: flex !important; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap;
}
html.ym-on table[data-ym-table~="mu"] td[data-ym="player"] > div:not(:has(.ysf-player-name)) > a:first-child {
  min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; font-size: 14px !important; font-weight: 600;
}
html.ym-on table[data-ym-table~="mu"] td[data-ym="player"] > div:not(:has(.ysf-player-name)) > span { flex: none; padding: 0 !important; font-size: 11px !important; color: var(--ym-faint); }
html.ym-on table[data-ym-table~="mu"] td[data-ym="player"] > div:not(:has(.ysf-player-name)) > div { float: none !important; flex: none; order: 2; }
html.ym-on table[data-ym-table~="mu"] td[data-ym="player"] > div:not(:has(.ysf-player-name)) > :last-child:not(div) {
  order: 3; margin-left: auto; flex: none; display: inline !important; font-size: 11px !important; color: var(--ym-faint) !important;
}

/* ---- Players page (free agents) ---- */
html.ym-on.ym-page-players #page-header { margin: 0 !important; padding: 10px 8px 0 !important; }
html.ym-on.ym-page-players #page-header h1 { font-size: 20px !important; margin: 0 !important; }
html.ym-on #playersearch, html.ym-on #playerfilter { padding-left: 8px !important; padding-right: 8px !important; }
/* search: full width */
html.ym-on #playersearch, html.ym-on #playersearch * { width: auto !important; }
html.ym-on #playersearch .Control-inline { display: block !important; margin-top: 8px; }
html.ym-on #playersearch form { display: flex !important; }
html.ym-on #playersearch input { flex: 1; min-width: 0; font-size: 16px !important; } /* 16px: no zoom-on-focus */
/* position chips scroll sideways; "Show my team" under them */
html.ym-on #pos_filter_row { display: flex !important; flex-direction: column; gap: 6px; }
html.ym-on #pos_filter_row > div { display: block !important; margin: 0 !important; width: auto !important; max-width: 100%; }
html.ym-on #pos_filter_row .Control-label { display: none !important; }
html.ym-on #posfilter { overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap !important; margin-top: 8px !important; }
html.ym-on #posfilter label { flex: none; padding: 6px 12px !important; font-size: 12px !important; }
/* the four dropdowns: 2 x 2 */
html.ym-on #playerfilter .selects { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; margin-top: 10px !important; }
html.ym-on #playerfilter .selects > div { width: auto !important; margin: 0 !important; min-width: 0; }
html.ym-on #playerfilter .selects select { min-width: 0 !important; }
html.ym-on #playerfilter :is(form, fieldset, .yui3-widget) { min-width: 0 !important; width: auto !important; } /* fieldset defaults to min-content */
html.ym-on #playerfilter .selects > div:empty,
html.ym-on #playerfilter .selects > div:not(:has(select)) { display: none !important; }
html.ym-on #playerfilter .selects select { width: 100% !important; max-width: none !important; height: 36px !important; font-size: 13px !important; }
html.ym-on #playerfilter .selects .Control-label { font-size: 11px !important; }
/* player rows: [+ / star] | name line, status line, 9-category line */
html.ym-on #players-table-wrapper, html.ym-on #players-table-wrapper .players { overflow: visible !important; width: auto !important; }
html.ym-on table[data-ym-table~="fa"] > tbody > tr { grid-template-rows: auto auto auto; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="add"] { grid-column: 1; grid-row: 1 / span 2; justify-self: center; align-self: center; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="watch"] { grid-column: 1; grid-row: 3; justify-self: center; align-self: center; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="add"] a {
  display: flex !important; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%;
  font-size: 18px !important; background: color-mix(in srgb, #1a9f53 16%, transparent);
}
html.ym-on table[data-ym-table~="fa"] td[data-ym="watch"] a { display: flex !important; align-items: center; justify-content: center; width: 30px; height: 26px; font-size: 15px !important; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="player"] { grid-row: 1; padding-bottom: 0 !important; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="status"],
html.ym-on table[data-ym-table~="fa"] td[data-ym="rank"],
html.ym-on table[data-ym-table~="fa"] td[data-ym="ros"] {
  grid-row: 2; text-align: left !important; padding: 0 0 2px 6px !important; font-size: 11px; color: var(--ym-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
html.ym-on table[data-ym-table~="fa"] td[data-ym="status"] { grid-column: 2 / span 3; font-weight: 700; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="rank"] { grid-column: 5 / span 3; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="ros"] { grid-column: 8 / span 3; }
html.ym-on table[data-ym-table~="fa"] :is(td[data-ym="status"], td[data-ym="rank"], td[data-ym="ros"]) * { display: inline !important; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="rank"]::before { content: "Rank "; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="ros"]::after { content: " rostered"; }
html.ym-on table[data-ym-table~="fa"] td[data-ym="stat"] { grid-row: 3; }
/* header: only the category labels (col 1 kept as a spacer) */
html.ym-on table[data-ym-table~="fa"] > thead [data-ym]:not([data-ym="stat"]):not([data-ym="add"]) { display: none !important; }
html.ym-on table[data-ym-table~="fa"] > thead [data-ym="add"] { grid-column: 1; grid-row: 1; font-size: 0 !important; }
/* paging */
html.ym-on #players-table > .Grid-spread-mid { display: flex !important; justify-content: center; padding: 12px 8px !important; }
html.ym-on #players-table > .Grid-spread-mid > :not(:has(.pagingnavlist)) { display: none !important; } /* icon legend */
html.ym-on .pagingnavlist { display: flex !important; gap: 10px; white-space: nowrap; }
html.ym-on .pagingnavlist li { margin: 0 !important; display: flex !important; align-items: center; }
html.ym-on .pagingnavlist li:not(:has(a)) { padding: 8px 16px; opacity: .45; font-size: 13px; } /* disabled "Previous 25" */
html.ym-on .pagingnavlist a {
  display: block; padding: 8px 16px; border: 1px solid var(--ym-line); border-radius: 18px; font-size: 13px; text-decoration: none !important;
}

/* ---- League home ---- */
/* the right rail holds the NBA scoreboard here: show it below the main column */
html.ym-on.ym-page-league #yspsub { display: block !important; width: auto !important; float: none !important; padding: 0 8px !important; }
html.ym-on.ym-page-league #yspmaincontent > *,
html.ym-on.ym-page-league #yspsub > * { width: auto !important; max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; }
html.ym-on.ym-page-league #yspmaincontent > .Mod { margin-bottom: 14px !important; }
html.ym-on.ym-page-league #yspmaincontent > * > :is(header, .Hd),
html.ym-on.ym-page-league #yspsub > * > :is(header, .Hd) { padding-left: 8px !important; padding-right: 8px !important; }
html.ym-on.ym-page-league .F-mod-header { font-size: 18px !important; }
/* league name, logo, announcements, season picker */
html.ym-on #leaguehome-billboard { margin: 0 !important; padding: 0 8px !important; }
html.ym-on #leaguehome-billboard .Grid-h-mid { margin: 8px 0 !important; padding: 0 !important; white-space: normal !important; }
html.ym-on #leaguehome-billboard h1 { flex-wrap: nowrap !important; align-items: center; gap: 10px; font-size: 18px !important; height: auto !important; }
html.ym-on #leaguehome-billboard h1 > * { min-width: 0; }
html.ym-on #leaguehome-billboard h1 * { white-space: normal !important; }
html.ym-on #leaguehome-billboard h1 .Ai-c { flex-wrap: wrap; gap: 2px 8px; }
html.ym-on #leaguehome-billboard img { width: 44px !important; height: 44px !important; }
/* tab rows (Standings / Schedule ..., All Transactions / Added ...) scroll sideways */
html.ym-on.ym-page-league .Nav-h { display: flex !important; flex-wrap: nowrap !important; overflow-x: auto; scrollbar-width: none; white-space: nowrap; padding: 0 8px !important; }
html.ym-on.ym-page-league .Nav-h > li { flex: none; float: none !important; }
/* standings: rank, team, W-L-T, Pct, GB, Waiver, Moves ("Last Week" hidden) */
html.ym-on #standingstable { width: 100% !important; table-layout: fixed; font-size: 12px; }
html.ym-on #standingstable :is(th, td) { padding: 8px 2px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
html.ym-on #standingstable :is(th, td):nth-child(1) { width: 30px; text-align: center !important; }
html.ym-on #standingstable :is(th, td):nth-child(2) { width: auto; text-align: left !important; }
html.ym-on #standingstable :is(th, td):nth-child(3) { width: 44px; }
html.ym-on #standingstable :is(th, td):nth-child(4) { width: 38px; }
html.ym-on #standingstable :is(th, td):nth-child(5) { width: 28px; }
html.ym-on #standingstable :is(th, td):nth-child(6) { display: none !important; }
html.ym-on #standingstable :is(th, td):nth-child(7),
html.ym-on #standingstable :is(th, td):nth-child(8) { width: 42px; }
html.ym-on #standingstable th { font-size: 10px !important; }
html.ym-on #standingstable td:nth-child(2) img { width: 22px !important; height: 22px !important; }
html.ym-on #standingstable td:nth-child(2) > a:has(img) { padding-right: 6px !important; vertical-align: middle; }
html.ym-on #standingstable td:nth-child(2) > a.Ell {
  max-width: calc(100% - 32px) !important; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* your team: highlighted in standings and in the week's matchups */
html.ym-on .ym-mine { background: color-mix(in srgb, var(--ym-accent) 9%, transparent) !important; }
/* commish notes / updates: author on one line, text full width below */
html.ym-on #commishupdates .Grid-u-1-3,
html.ym-on #commishupdates .Grid-u-2-3 { display: block !important; width: auto !important; max-width: none !important; padding: 0 8px !important; }
html.ym-on #commishupdates .Grid-u-1-3 { margin-bottom: 6px; }
html.ym-on #commishupdates .Grid-u-1-3 .Grid-u { display: inline-flex !important; flex-wrap: wrap; align-items: baseline; gap: 0 6px; width: auto !important; }
html.ym-on #commishupdates .Grid-u-1-3 :is(.D-b, .Block) { display: inline !important; }
html.ym-on #commishupdates .Grid-u-1-3 img { width: 28px !important; height: 28px !important; }
html.ym-on #commishupdates .Grid-u-1-3 figure { margin: 0 8px 0 0 !important; }
html.ym-on #commishupdates li { padding: 10px 0 !important; }
/* fantasy news: smaller thumbnails so headlines get the width */
html.ym-on #stream a:has(img) > div:has(img) { width: 112px !important; min-width: 112px; height: 76px !important; flex: none; }
html.ym-on #stream a:has(img) > div:has(img) * { width: 100% !important; height: 100% !important; }
html.ym-on #stream img { object-fit: cover; border-radius: 8px; }
html.ym-on #stream { padding: 0 8px !important; }
/* NBA scores */
html.ym-on.ym-page-league #scoreboard { margin-left: auto !important; margin-right: auto !important; }
html.ym-on.ym-page-league #scoreboard * { max-width: 100%; }

/* Player card (Yahoo's YUI modal): full screen, one scrolling column.
   Inside: close button, avatar rail, main column (hero, tabs, tables), news column. */
html.ym-on .yui3-overlay:has(#react-playernote-overlay) {
  position: fixed !important; inset: 0 !important; left: 0 !important; top: 0 !important;
  width: auto !important; height: auto !important; max-width: none !important; max-height: none !important;
}
html.ym-on #react-playernote-overlay {
  height: 100% !important; overflow-x: hidden !important; overflow-y: auto !important;
  overscroll-behavior: contain; border-radius: 0 !important;
}
html.ym-on #player-note-content,
html.ym-on #player-note-content > div { width: auto !important; height: auto !important; min-height: 100%; }
html.ym-on #player-note-content div:has(> .close-card) {
  flex-direction: column !important; align-items: stretch !important; height: auto !important; min-height: 100%;
}
html.ym-on #player-note-content .close-card {
  position: fixed !important; top: 8px !important; right: 8px !important; z-index: 20;
  width: 40px; height: 40px; border-radius: 50% !important; padding: 8px !important;
  background: var(--ym-bg, #fff) !important; box-shadow: 0 2px 10px rgba(0,0,0,.3);
}
/* avatar rail -> horizontal strip */
html.ym-on #player-note-content .close-card + div { width: auto !important; }
html.ym-on #player-note-content .player-sidebar {
  width: auto !important; height: auto !important; overflow-x: auto !important; overflow-y: hidden !important;
  padding: 6px 56px 6px 8px !important; scrollbar-width: none;
}
html.ym-on #player-note-content .close-card + div ul { display: flex !important; gap: 6px; width: max-content; }
html.ym-on #player-note-content .close-card + div li { flex: none; margin: 0 !important; }
/* "Rostered By" box: compact card in the empty space beside the rank, clear of the photo.
   Rows: owner (logo, team) + % rostered, then the action button (Drop/Add/...) + watch star. */
html.ym-on #player-note-content section.roster-status {
  /* photo column is 160px and the rank ends ~192px in, so start just past it */
  position: absolute !important; left: 200px; right: 8px; bottom: 8px; z-index: 2;
  width: auto !important; height: auto !important; padding: 0 !important;
}
html.ym-on #player-note-content section.roster-status > div {
  /* owner name gets room first; "% Rostered" shrinks if space runs out */
  display: grid !important; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); grid-template-areas: "owner pct" "actions actions";
  align-items: center; gap: 4px 8px; width: auto !important; height: auto !important;
  padding: 6px 6px 6px 8px !important; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.25);
}
html.ym-on #player-note-content section.roster-status > div > div:first-child {
  grid-area: owner; padding: 0 !important; align-items: center; min-width: 0; font-size: 12px !important;
}
html.ym-on #player-note-content section.roster-status > div > div:first-child img { width: 22px !important; height: 22px !important; flex: none; }
html.ym-on #player-note-content section.roster-status > div > div:first-child > div { padding-left: 6px !important; min-width: 0; }
html.ym-on #player-note-content section.roster-status > div > div:first-child > div > div { display: none; } /* "Rostered By" label */
html.ym-on #player-note-content section.roster-status > div > div:first-child a {
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700;
}
html.ym-on #player-note-content section.roster-status > div > div:last-child {
  grid-area: pct; margin: 0 !important; padding: 0 !important; background: none !important;
  font-size: 10px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; opacity: .7;
}
html.ym-on #player-note-content section.roster-status .actions { grid-area: actions; margin: 0 !important; gap: 6px; }
html.ym-on #player-note-content section.roster-status .roster-actions { height: auto !important; }
html.ym-on #player-note-content section.roster-status .actions > * > *,
html.ym-on #player-note-content section.roster-status .actions > button { padding-top: 4px !important; padding-bottom: 4px !important; }
html.ym-on #player-note-content section.roster-status .actions span { font-size: 12px !important; }
html.ym-on #player-note-content section.roster-status .actions > button { width: 30px; height: 30px; padding: 4px !important; flex: none; }
/* main column: let the whole sheet scroll instead of the inner panes */
html.ym-on #player-note-content .close-card + div + div { width: auto !important; overflow: visible !important; }
html.ym-on #player-note-content .close-card + div + div > div,
html.ym-on #player-note-content .close-card + div + div > div > div:last-child,
html.ym-on #player-note-content .close-card + div + div > div > div:last-child > section,
html.ym-on #player-note-content .close-card + div + div > div > div:last-child > section > div {
  height: auto !important; overflow: visible !important;
}
html.ym-on #player-note-content .close-card + div + div > div > div:last-child > section > header > div {
  overflow-x: auto !important; scrollbar-width: none;
}
html.ym-on #player-note-content .close-card + div + div > div > div:last-child > section > header ul { white-space: nowrap; }
html.ym-on #player-note-content .close-card + div + div [class*="Px(24px)"] { padding-left: 10px !important; padding-right: 10px !important; }
html.ym-on #player-note-content div:has(> table) { overflow-x: auto !important; max-width: 100%; }
/* news column below */
html.ym-on #player-note-content .close-card + div + div + div { width: auto !important; }
html.ym-on #player-note-content .close-card + div + div + div > div,
html.ym-on #player-note-content .close-card + div + div + div > div > div { height: auto !important; overflow: visible !important; }
html.ym-on #player-note-content .close-card + div + div + div > div > div { padding: 16px 12px !important; }
html.ym-on #player-note-content .player-notes { width: auto !important; }
/* empty ad slot between news items */
html.ym-on #player-note-content div:has(> div > [id*="-LREC"]),
html.ym-on #player-note-content [id*="-LREC"] { display: none !important; }
`;

  function injectStyle() {
    if (document.getElementById('ym-style')) return;
    const style = document.createElement('style');
    style.id = 'ym-style';
    style.textContent = CSS;
    (document.head || html).appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Scaling. With "Desktop site" on, Firefox lays the page out ~980px wide and
  // shrinks it to the screen. Zooming the page by layout-width / screen-width
  // makes our phone-sized layout fill the screen at a readable size.
  // ---------------------------------------------------------------------------
  // documentElement.clientWidth is the layout viewport width. Unlike innerWidth
  // it ignores pinch-zoom and content overflow, so zooming can't feed back into it.
  function autoZoom(layoutWidth) {
    const sw = screen.width || layoutWidth;
    const coarse = matchMedia('(pointer: coarse)').matches;
    return coarse && layoutWidth > sw * 1.15 ? layoutWidth / sw : 1;
  }

  function applyZoom() {
    const layoutWidth = html.clientWidth || window.innerWidth;
    if (!settings.on) {
      html.style.removeProperty('zoom');
      html.classList.remove('ym-wide');
      // Keep the "turn back on" button finger-sized on the shrunken desktop page.
      html.style.setProperty('--ym-pill-zoom', String(autoZoom(layoutWidth)));
      return;
    }
    const z = Math.min(4, Math.max(0.5, Math.round(autoZoom(layoutWidth) * settings.scale * 1000) / 1000));
    if (z === 1) html.style.removeProperty('zoom');
    else if (html.style.zoom !== String(z)) html.style.zoom = String(z);
    html.classList.toggle('ym-wide', layoutWidth / z >= 640);
  }

  function setViewportMeta(on) {
    let meta = document.getElementById('ym-viewport');
    if (!on) { meta?.remove(); return; }
    if (meta || !document.head) return;
    meta = document.createElement('meta');
    meta.id = 'ym-viewport';
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(meta);
  }

  function applyMode() {
    html.classList.add(`ym-page-${page}`);
    html.classList.toggle('ym-on', settings.on);
    html.classList.toggle('ym-idle-show', settings.idle === 'show');
    // `viewport: false` is a dev switch for testing the zoom path in browsers
    // that honour an injected viewport tag.
    setViewportMeta(settings.on && settings.viewport !== false);
    applyZoom();
  }

  // ---------------------------------------------------------------------------
  // Small DOM helpers
  // ---------------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  // Yahoo's icon font uses private-use characters; drop them from read text.
  const text = el => (el ? el.textContent.replace(/[\uE000-\uF8FF]/g, '').replace(/\s+/g, ' ').trim() : '');

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  // replaceChildren() would print null/false as text; skip them like el() does.
  const fill = (node, ...children) => node.replaceChildren(...children.filter(c => c != null && c !== false));

  function setAttr(node, name, value) {
    if (value == null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
    else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  // Tables are tagged with data attributes rather than classes: React-rendered
  // tables (Matchup page) can rewrite their class attribute on updates.
  function tagTable(table, tag, on = true) {
    const tags = new Set((table.getAttribute('data-ym-table') || '').split(' ').filter(Boolean));
    if (on) tags.add(tag); else tags.delete(tag);
    setAttr(table, 'data-ym-table', [...tags].join(' ') || null);
  }

  function isTransparent(color) {
    return !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);
  }

  // Sticky bars need an opaque background that matches Yahoo's current theme.
  function syncThemeColors() {
    const ref = $('#yspmain') || document.body;
    if (!ref) return;
    let bg = '';
    for (let n = ref; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (!isTransparent(c)) { bg = c; break; }
    }
    html.style.setProperty('--ym-bg', bg || '#fff');
    html.style.setProperty('--ym-fg', getComputedStyle(ref).color);
  }

  // Remove the fixed desktop widths on every wrapper between <body> and the main content.
  function markChain() {
    for (let n = $('#yspmaincontent'); n && n !== html; n = n.parentElement) {
      n.classList.add('ym-chain');
    }
  }

  // ---------------------------------------------------------------------------
  // Top bar, team summary, settings
  // ---------------------------------------------------------------------------
  const pathOf = a => new URL(a.getAttribute('href') || '', location.href).pathname;
  const teamIdOf = a => (pathOf(a).match(/^\/nba\/\d+\/(\d+)/) || [])[1];

  // Yahoo's header "My Team" link always points at the signed-in user's team,
  // even while viewing someone else's roster.
  function ownTeamId() {
    const link = $$('#ybar-navigation a').find(a => text(a) === 'My Team');
    const m = link && pathOf(link).match(/^\/nba\/(\d+)\/(\d+)/);
    if (m && m[1] === leagueId) return m[2];
    return readJSON(LEAGUE_KEY, {}).own || teamId;
  }

  // The matchup card on a team page shows that team and its opponent.
  function cardMatchup() {
    const ids = $$('#team-card-matchup a').map(teamIdOf).filter(Boolean);
    const target = $('#team-card-matchup [data-target]');
    return { ids: [...new Set(ids)], href: target && target.getAttribute('data-target') };
  }

  // Remember my current opponent and matchup link so they're known on other teams' pages too.
  function rememberLeague() {
    const own = ownTeamId();
    const { ids } = cardMatchup();
    const saved = readJSON(LEAGUE_KEY, {});
    const next = { ...saved, own };
    delete next.mu; // older versions stored a matchup link here
    if (teamId === own) {
      next.opp = ids.find(id => id !== own) || saved.opp;
    } else if (ids.includes(own)) {
      next.opp = teamId; // this team is playing me this week
    }
    if (JSON.stringify(next) !== JSON.stringify(saved)) writeJSON(LEAGUE_KEY, next);
    return next;
  }

  // Yahoo's plain matchup address opens my current matchup, current week, totals.
  const matchupHref = () => `/nba/${leagueId}/matchup`;

  function buildBar() {
    if ($('#ym-bar')) return;
    const own = ownTeamId();
    const nav = el('nav', { 'aria-label': 'League' },
      el('a', { href: `/nba/${leagueId}/${own}`, class: teamId === own ? 'ym-cur' : null }, 'My Team'),
      el('a', { href: matchupHref(), class: page === 'matchup' ? 'ym-cur' : null }, 'Matchup'),
      el('a', { href: `/nba/${leagueId}/players`, class: page === 'players' ? 'ym-cur' : null }, 'Players'),
      el('a', { href: `/nba/${leagueId}`, class: page === 'league' ? 'ym-cur' : null }, 'League'),
    );
    const leagues = el('button', {
      type: 'button', class: 'ym-lg', 'aria-label': 'Switch league', 'data-ym-sheet': 'ym-leagues', onclick: openLeagues,
    }, '🏀');
    const gear = el('button', {
      type: 'button', 'aria-label': 'Layout settings', 'data-ym-sheet': 'ym-sheet', onclick: () => toggleSheet('ym-sheet'),
    }, '⚙︎');
    document.body.prepend(el('div', { id: 'ym-bar' }, leagues, nav, gear));
    document.body.append(
      buildSheet(),
      el('div', { id: 'ym-leagues', class: 'ym-sheet ym-start', hidden: true, role: 'dialog', 'aria-label': 'My leagues' }),
      el('div', { id: 'ym-teams', class: 'ym-sheet ym-start', hidden: true, role: 'dialog', 'aria-label': 'League teams' }),
      el('button', { id: 'ym-pill', type: 'button', onclick: () => setSetting('on', true) }, 'Mobile layout'),
    );
  }

  // ---------------------------------------------------------------------------
  // League switcher. Yahoo builds its "My Teams & Leagues" menu only when the
  // header's "Fantasy Basketball" item is hovered. On tap we hover it for the
  // user (Yahoo's own code loads the menu, as on desktop), read the basketball
  // teams out of it, and keep them in storage so the list shows instantly next time.
  // ---------------------------------------------------------------------------
  let leaguesFresh = false;
  let leaguesLoading = false;

  function harvestYahooLeagues() {
    const links = $$('#navtray-fantasy a').filter(a => /^\/nba\/\d+\/\d+$/.test(pathOf(a)));
    if (!links.length) return false;
    writeJSON(LEAGUES_KEY, links.map(a => {
      const [team, league, score, vs] = $$('*', a).filter(n => !n.childElementCount).map(text).filter(Boolean);
      return { path: pathOf(a), team, league, score, vs };
    }));
    leaguesFresh = true;
    return true;
  }

  function hoverYahooMenu(on) {
    const link = $$('#ybar-navigation a').find(a => text(a) === 'Fantasy Basketball');
    if (!link) return false;
    const types = on ? ['pointerover', 'pointerenter', 'mouseover', 'mouseenter'] : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'];
    for (const target of [link.closest('li') || link, link]) {
      for (const type of types) {
        const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
        target.dispatchEvent(new Ev(type, { bubbles: !/enter|leave/.test(type), relatedTarget: document.body }));
      }
    }
    return true;
  }

  function openLeagues() {
    if (!toggleSheet('ym-leagues')) return;
    if (leaguesFresh || harvestYahooLeagues()) return renderLeagues();
    if (!hoverYahooMenu(true)) return renderLeagues();
    leaguesLoading = true;
    renderLeagues();
    const started = Date.now();
    const poll = setInterval(() => {
      if (!harvestYahooLeagues() && Date.now() - started < 6000) return;
      clearInterval(poll);
      hoverYahooMenu(false);
      leaguesLoading = false;
      renderLeagues();
    }, 250);
  }

  function renderLeagues() {
    const sheet = $('#ym-leagues');
    if (!sheet) return;
    const here = `/nba/${leagueId}/${ownTeamId()}`;
    const list = readJSON(LEAGUES_KEY, []);
    if (!list.some(e => e.path === here)) {
      list.unshift({ path: here, team: text($('#team-card .title .F-reset')), league: document.title.split(' - ')[0] });
    }
    fill(sheet,
      el('h3', {}, 'My leagues'),
      el('div', { class: 'ym-list' }, ...list.map(e => el('a', { href: e.path, 'aria-current': e.path === here ? 'page' : null },
        el('span', { class: 'ym-main' }, el('b', {}, e.team || 'Team'), el('small', {}, e.league || '')),
        leaguesFresh && e.score ? el('span', { class: 'ym-side' }, el('b', {}, e.score), el('small', {}, e.vs || '')) : null))),
      leaguesLoading ? el('p', { class: 'ym-hint' }, 'Loading your leagues from Yahoo…') : null,
    );
  }

  // ---------------------------------------------------------------------------
  // League teams: Yahoo's team-name dropdown, with my current opponent on top.
  // ---------------------------------------------------------------------------
  function openTeams() {
    if (!toggleSheet('ym-teams')) return;
    const sheet = $('#ym-teams');
    const { own, opp } = rememberLeague();
    const teams = $$('#team-card .title .Dropdown a')
      .map(a => ({ href: a.getAttribute('href'), id: teamIdOf(a), name: text(a) }))
      .filter(t => t.id);
    const rank = t => (t.id === opp ? 0 : t.id === own ? 1 : 2);
    teams.sort((a, b) => rank(a) - rank(b)); // stable: keeps Yahoo's order otherwise

    fill(sheet,
      el('h3', {}, 'League teams'),
      teams.length
        ? el('div', { class: 'ym-list' }, ...teams.map(t => el('a', { href: t.href, class: t.id === opp ? 'ym-opp' : null },
          el('span', { class: 'ym-main' }, el('b', {}, t.name)),
          t.id === opp ? el('span', { class: 'ym-tag ym-opp-tag' }, 'Current opponent')
            : t.id === own ? el('span', { class: 'ym-tag' }, 'You') : null)))
        : el('p', { class: 'ym-hint' }, 'No team list on this page.'),
      el('div', { class: 'ym-foot' }, el('button', {
        type: 'button', class: 'ym-btn', onclick: () => { toggleSheet(null); html.classList.toggle('ym-show-card'); },
      }, 'Show / hide Yahoo team card')),
    );
  }

  function buildSummary() {
    const card = $('#team-card');
    if (!card || $('#ym-summary')) return;
    const name = text($('.title .F-reset', card)) || document.title.split(' - ')[1]?.split(' | ')[0] || 'My team';
    const record = text($('.right .Fw-b', card));
    const place = text($('.right em', card)).replace(/[()]/g, '').replace(/^record$/i, '');
    const mu = $('#team-card-matchup', card);
    const muTitle = text(mu && mu.querySelector('.Pbot-med')).replace(/^Week\s+/i, 'Wk ');
    const scores = mu ? $$('.Fz-lg', mu).map(text) : [];

    const notes = teamNotes();
    const { opp } = rememberLeague();
    const summary = el('div', { id: 'ym-summary' },
      el('div', { class: 'ym-id' },
        el('button', {
          type: 'button', class: 'ym-team', title: 'League teams', 'data-ym-sheet': 'ym-teams', onclick: openTeams,
        }, name),
        teamId === opp ? el('span', { class: 'ym-tag ym-opp-tag' }, 'Current opponent') : null,
        el('span', { class: 'ym-rec' }, [record, place].filter(Boolean).join(' · '))),
      mu ? el('a', { class: 'ym-mu', href: cardMatchup().href || matchupHref() },
        muTitle || 'Matchup',
        scores.length === 2 ? el('b', {}, `${scores[0]}–${scores[1]}`) : null) : null,
      notes.chips.length ? el('span', { class: 'ym-notes' }, notes.chips.join(' · ')) : null,
    );
    card.before(summary);
    // The long notes box is redundant once its numbers are in the summary.
    if (notes.chips.length && !notes.rest) $('#teamnotes')?.classList.add('ym-compacted');
  }

  // "You have used 0 of your 5 player adds..." -> "Adds 0/5". Anything we don't
  // recognise is reported in `rest` so the original box stays visible.
  function teamNotes() {
    let rest = text($('#teamnotes'));
    const chips = [];
    const take = (re, fmt) => {
      const m = rest.match(re);
      if (m) { chips.push(fmt(m)); rest = rest.replace(m[0], ''); }
    };
    take(/You have used (\d+) of (?:your )?(\d+) player adds[^.]*\.?/i, m => `Adds ${m[1]}/${m[2]}`);
    take(/You have used (\d+) of (\d+) IL positions[^.]*\.?/i, m => `IL ${m[1]}/${m[2]}`);
    take(/Waiver Priority:\s*([\w-]+)/i, m => `Waiver ${m[1]}`);
    return { chips, rest: rest.trim() };
  }

  function buildSheet() {
    const valueOut = el('span', { class: 'ym-val' });
    const idleBtns = ['collapse', 'show'].map(v => el('button', {
      type: 'button', 'data-v': v, onclick: () => setSetting('idle', v),
    }, v === 'collapse' ? 'Collapse' : 'Show stats'));

    const sheet = el('div', { id: 'ym-sheet', class: 'ym-sheet', hidden: true, role: 'dialog', 'aria-label': 'Layout settings' },
      el('div', { class: 'ym-row' }, el('span', {}, 'Text size'),
        el('span', { class: 'ym-seg' },
          el('button', { type: 'button', onclick: () => setSetting('scale', clampScale(settings.scale - 0.1)) }, 'A−'),
          el('button', { type: 'button', onclick: () => setSetting('scale', 1) }, valueOut),
          el('button', { type: 'button', onclick: () => setSetting('scale', clampScale(settings.scale + 0.1)) }, 'A+'))),
      el('div', { class: 'ym-row' }, el('span', {}, 'No game today'), el('span', { class: 'ym-seg' }, ...idleBtns)),
      el('div', { class: 'ym-row' }, el('span', {}, 'Yahoo header'),
        el('button', { type: 'button', class: 'ym-btn', onclick: () => html.classList.toggle('ym-show-ybar') }, 'Show / hide')),
      el('div', { class: 'ym-row' }, el('span', {}, 'Original desktop page'),
        el('button', { type: 'button', class: 'ym-btn', onclick: () => { toggleSheet(null); setSetting('on', false); } }, 'Switch off')),
    );
    sheet.refresh = () => {
      valueOut.textContent = `${Math.round(settings.scale * 100)}%`;
      for (const b of idleBtns) b.setAttribute('aria-pressed', String(b.dataset.v === settings.idle));
    };
    sheet.refresh();
    return sheet;
  }

  const clampScale = v => Math.min(1.6, Math.max(0.6, Math.round(v * 10) / 10));

  // Open the sheet with this id (closing any other), or close it if it's open.
  // toggleSheet(null) closes all. Returns true when the sheet ends up open.
  function toggleSheet(id) {
    let opened = false;
    for (const sheet of $$('.ym-sheet')) {
      const open = sheet.id === id && sheet.hidden;
      sheet.hidden = !open;
      opened ||= open;
    }
    return opened;
  }

  function setSetting(key, value) {
    settings = { ...settings, [key]: value };
    saveSettings();
    applyMode();
    $('#ym-sheet')?.refresh?.();
    if (settings.on) scheduleEnhance();
  }

  // ---------------------------------------------------------------------------
  // Roster table
  // ---------------------------------------------------------------------------
  // Classify each column from the header rows: position, player, opponent,
  // scoring categories, or meta columns (rank, % started...) that we hide.
  function classifyColumns(table) {
    const head = table.tHead;
    if (!head || !head.rows.length) return null;
    const labelRow = head.rows[head.rows.length - 1];

    // Group header (row above) tells us which columns are "Rank" / "Fantasy".
    const groups = [];
    if (head.rows.length > 1) {
      for (const cell of head.rows[head.rows.length - 2].cells) {
        for (let i = 0; i < cell.colSpan; i++) groups.push(text(cell));
      }
    }

    // One entry per column slot, so header cells spanning several columns
    // (e.g. "Action" on other teams' pages) still line up with the row cells.
    const kinds = [];
    const labels = [];
    for (const cell of labelRow.cells) {
      const label = text(cell);
      const cls = cell.classList;
      const group = groups[kinds.length] || '';
      let kind = 'stat';
      if (cls.contains('pos')) kind = 'pos';
      else if (cls.contains('player')) kind = 'player';
      else if (cls.contains('edit') || cls.contains('Spacer')) kind = 'hide';
      else if (/^opp/i.test(label)) kind = 'opp';
      else if (/^(rank|fantasy)$/i.test(group)) kind = 'hide';
      else if (/\*$/.test(label)) kind = 'hide'; // starred columns are not scoring categories
      else if (!label || /^action$/i.test(label)) kind = 'hide';
      for (let i = 0; i < cell.colSpan; i++) { kinds.push(kind); labels.push(label); }
    }
    return { labelRow, kinds, labels };
  }

  // Column kind for each cell of a row, following colSpan; null if the row
  // doesn't cover the same number of columns as the header.
  function cellKinds(row, kinds) {
    let slot = 0;
    const out = Array.from(row.cells, cell => {
      const kind = kinds[slot];
      slot += cell.colSpan;
      return kind;
    });
    return slot === kinds.length ? out : null;
  }

  function enhanceTable(table) {
    const cols = classifyColumns(table);
    if (!cols) return;
    const { kinds, labels } = cols;
    tagTable(table, 'roster');

    // If this view has the scoring categories, show only those on the stat line.
    const hasCats = labels.some((l, i) => kinds[i] === 'stat' && CATS.includes(l.toUpperCase()));
    const finalKinds = kinds.map((k, i) =>
      k === 'stat' && hasCats && !CATS.includes(labels[i].toUpperCase()) ? 'hide' : k);
    const n = finalKinds.filter(k => k === 'stat').length;
    table.style.setProperty('--ym-n', String(Math.max(n, 1)));
    tagTable(table, 'many', n > 10);
    table.closest('.tablewrap')?.classList.toggle('ym-scroll', n > 10);

    const headKinds = cellKinds(cols.labelRow, finalKinds) || [];
    Array.from(cols.labelRow.cells).forEach((cell, i) =>
      setAttr(cell, 'data-ym', headKinds[i] === 'opp' ? 'hide' : headKinds[i]));

    for (const body of [...table.tBodies, table.tFoot]) {
      if (body) for (const row of body.rows) enhanceRow(row, finalKinds);
    }
  }

  function enhanceRow(row, columnKinds) {
    const cells = Array.from(row.cells);
    const kinds = cellKinds(row, columnKinds);
    setAttr(row, 'data-ym-odd', !kinds && cells.length > 0 ? '' : null);
    if (!kinds) return;

    let opp = '';
    cells.forEach((cell, i) => {
      const kind = kinds[i] === 'opp' ? 'hide' : kinds[i];
      setAttr(cell, 'data-ym', kind);
      if (kinds[i] === 'opp') opp = text(cell);
      if (kind === 'stat') {
        const v = text(cell);
        setAttr(cell, 'data-ym-empty', v === '' || v === '-' || v === '-/-' ? '' : null);
      }
    });

    // No opponent on the selected date -> idle (collapsed by default).
    // Only judged on real player rows in views that have an Opp column.
    const player = cells[kinds.indexOf('player')];
    const detail = player && player.querySelector('.ysf-player-detail');
    const status = text(detail);
    const isPlayer = !!(player && player.querySelector('.ysf-player-name'));
    row.classList.toggle('ym-idle', isPlayer && kinds.includes('opp') && !opp && !status);
    // Show the opponent next to the name when Yahoo has no game-status text.
    if (detail) setAttr(detail, 'data-ym-opp', opp && !status ? opp : null);
  }

  function enhanceRoster() {
    for (const table of $$('#team-roster table.ysf-rosterswapper, #team-roster table[id^="statTable"]')) {
      enhanceTable(table);
    }
  }

  // Mark every cell of a table from per-column-slot attribute values.
  function markCells(table, slots) {
    for (const row of table.rows) {
      const cells = Array.from(row.cells);
      let slot = 0;
      const spans = cells.map(cell => { const at = slot; slot += cell.colSpan; return at; });
      const odd = slot !== slots.length;
      setAttr(row, 'data-ym-odd', odd && cells.length > 0 ? '' : null);
      if (odd) continue;
      cells.forEach((cell, i) => {
        const { kind, side } = slots[spans[i]];
        setAttr(cell, 'data-ym', kind);
        setAttr(cell, 'data-ym-side', side || null);
        if (kind === 'stat' && cell.tagName === 'TD') {
          const v = text(cell);
          setAttr(cell, 'data-ym-empty', v === '' || v === '-' || v === '-/-' ? '' : null);
        }
      });
    }
  }

  // Header labels -> one entry per column slot.
  function headerSlots(table) {
    const labelRow = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
    if (!labelRow) return null;
    const slots = [];
    for (const cell of labelRow.cells) {
      for (let i = 0; i < cell.colSpan; i++) slots.push({ label: text(cell), hidden: cell.classList.contains('Hidden') });
    }
    return slots;
  }

  // ---------------------------------------------------------------------------
  // Matchup page
  // ---------------------------------------------------------------------------
  let matchupSide = null; // 'a' | 'b': which team's roster is shown on the phone

  const isTeamLink = a => /^\/nba\/\d+\/\d+$/.test(pathOf(a)) && !!text(a);

  // "Team A | score vs score | Team B" blocks: the page header and each line of
  // the league scoreboard below. Tag them (and their three parts) for styling.
  function markMatchupLines() {
    const hasTeam = box => box.querySelector('img') && $$('a', box).some(isTeamLink);
    const lines = $$('#redzone div').filter(d => d.childElementCount === 3
      && /^(vs\.?)?$/i.test(text(d.children[1]).replace(/[\d\s]/g, '')) // "4 vs. 4" (header) or "4 4" (scoreboard)
      && hasTeam(d.children[0]) && hasTeam(d.children[2]));
    lines.forEach((line, i) => {
      setAttr(line, 'data-ym-line', i === 0 ? 'head' : 'row');
      ['a', 'mid', 'b'].forEach((box, j) => setAttr(line.children[j], 'data-ym-box', box));
    });
  }

  function matchupSides() {
    const head = $('[data-ym-line="head"]') || $('#matchup-header');
    const links = head ? $$('a', head).filter(isTeamLink) : [];
    const side = link => (link ? { id: teamIdOf(link), name: text(link) } : null);
    return { a: side(links[0]), b: links.length > 1 ? side(links[links.length - 1]) : null };
  }

  // Find a table by its last header row's labels.
  function findTable(test) {
    return $$('#yspmaincontent table').find(t => {
      const slots = t.tHead && headerSlots(t);
      return slots && test(slots.map(s => s.label.toLowerCase()));
    });
  }

  // Category totals: keep the 9 scoring categories; Yahoo marks each winner in bold.
  function enhanceCategories() {
    const table = findTable(labels => labels[0] === 'team' && labels.includes('fg%'));
    const slots = table && headerSlots(table);
    if (!slots) return;
    tagTable(table, 'cats');
    markCells(table, slots.map(s => ({
      kind: /^team$/i.test(s.label) ? 'team' : CATS.includes(s.label.toUpperCase()) ? 'stat' : 'hide',
    })));
  }

  // Both rosters share one table: team A's columns, a shared slot "Pos" column,
  // then team B's columns. Show one team at a time with the same row layout as My Team.
  function enhanceMatchupRoster(sides) {
    const table = findTable(labels => labels.filter(l => l === 'player').length === 2 && labels.includes('pos'));
    const slots = table && headerSlots(table);
    if (!slots) return;
    const center = slots.findIndex(s => /^pos$/i.test(s.label) && !s.hidden);
    if (center < 0) return;
    markCells(table, slots.map((s, i) => {
      if (i === center) return { kind: 'pos' };
      const side = i < center ? 'a' : 'b';
      if (/^player$/i.test(s.label)) return { kind: 'player', side };
      if (CATS.includes(s.label.toUpperCase())) return { kind: 'stat', side };
      return { kind: 'hide' };
    }));
    tagTable(table, 'roster');
    tagTable(table, 'mu');
    table.style.setProperty('--ym-n', String(slots.filter((s, i) => i < center && CATS.includes(s.label.toUpperCase())).length || 9));

    // Day tabs are full page loads; keep showing the same team (this browser session only).
    if (!matchupSide) {
      let shown = null;
      try { shown = sessionStorage.getItem('ym:mu-team'); } catch { /* storage blocked */ }
      const own = ownTeamId();
      const pick = id => (sides.a && sides.a.id === id ? 'a' : sides.b && sides.b.id === id ? 'b' : null);
      matchupSide = pick(shown) || pick(own) || 'a';
    }
    setAttr(table, 'data-ym-show', matchupSide);

    // Goes right above the table's scroll box (#matchup on the React page).
    const anchor = table.closest('#matchup') || table.closest('div, section');
    let toggle = $('#ym-sides');
    if (!toggle || toggle.nextElementSibling !== anchor) {
      toggle?.remove();
      const show = side => {
        matchupSide = side;
        try { sessionStorage.setItem('ym:mu-team', sides[side] ? sides[side].id : ''); } catch { /* storage blocked */ }
        scheduleEnhance();
      };
      toggle = el('div', { id: 'ym-sides', class: 'ym-seg', role: 'tablist' }, ...['a', 'b'].map(side =>
        el('button', { type: 'button', role: 'tab', 'data-side': side, onclick: () => show(side) },
          sides[side] ? sides[side].name : side.toUpperCase())));
      anchor.before(toggle);
    }
    for (const b of toggle.children) setAttr(b, 'aria-selected', String(b.dataset.side === matchupSide));
  }

  // NBA game day in US Eastern time, rolled back 6 hours so last night's games
  // stay "today" until morning (matches what Yahoo's new Today's Stats shows).
  function fantasyToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(Date.now() - 6 * 3600e3)); // "2026-10-21"
  }

  // The older matchup page has no "Today's Stats | Matchup Totals" switch (the new
  // React one does). Add one above the team toggle, pointing at Yahoo's own day tabs.
  function ensurePeriodSwitch() {
    const toggle = $('#ym-sides');
    const existing = $('#ym-period');
    if (!toggle || $('#redzone .RedZone ul a')) { existing?.remove(); return; }
    const tabs = $$('.moduletabs a').map(a => ({ a, date: new URL(a.href, location.href).searchParams.get('date') }));
    const totals = tabs.find(t => t.date === 'totals');
    const today = tabs.find(t => t.date === fantasyToday());
    if (!totals && !today) { existing?.remove(); return; }
    const selected = tabs.find(t => t.a.closest('li')?.classList.contains('Selected'));
    const item = (tab, label) => tab && el('a', {
      href: tab.a.getAttribute('href'), 'aria-current': selected === tab ? 'true' : null,
    }, label);
    const sw = el('div', { id: 'ym-period' }, item(today, "Today's Stats"), item(totals, 'Matchup Totals'));
    if (existing && existing.nextElementSibling === toggle && existing.innerHTML === sw.innerHTML) return;
    existing?.remove();
    toggle.before(sw);
  }

  function enhanceMatchup() {
    markMatchupLines();
    const sides = matchupSides();
    // Remember my opponent when this is my matchup, so team pages can highlight them.
    const own = ownTeamId();
    if (own && sides.a && sides.b && [sides.a.id, sides.b.id].includes(own)) {
      const saved = readJSON(LEAGUE_KEY, {});
      const next = { ...saved, own, opp: sides.a.id === own ? sides.b.id : sides.a.id };
      if (JSON.stringify(next) !== JSON.stringify(saved)) writeJSON(LEAGUE_KEY, next);
    }
    enhanceCategories();
    enhanceMatchupRoster(sides);
    ensurePeriodSwitch();
  }

  // Highlight my team's row in the standings and the week's matchups list.
  function markMine() {
    const own = ownTeamId();
    if (!own) return;
    const ownPath = `/nba/${leagueId}/${own}`;
    for (const row of $$('#standingstable tbody tr, #matchupweek li, [data-ym-line="row"]')) {
      row.classList.toggle('ym-mine', $$('a', row).some(a => pathOf(a) === ownPath));
    }
  }

  // ---------------------------------------------------------------------------
  // Players page (free agents)
  // ---------------------------------------------------------------------------
  // Columns: add (+), watch (star), player, opp, roster status, GP, ranks,
  // % rostered, minutes, then stats. Keep add/watch, status, current rank,
  // % rostered and the 9 categories; hide the rest.
  function enhancePlayers() {
    const table = $('#players-table-wrapper table');
    const slots = table && headerSlots(table);
    if (!slots) return;
    const head = table.tHead;
    const groups = [];
    if (head.rows.length > 1) {
      for (const cell of head.rows[head.rows.length - 2].cells) {
        for (let i = 0; i < cell.colSpan; i++) groups.push(text(cell));
      }
    }
    const playerSlot = slots.findIndex(s => /^players?$/i.test(s.label));
    let actions = 0;
    const kinds = slots.map((s, i) => {
      const label = s.label;
      if (i === playerSlot) return 'player';
      if (!label && i < playerSlot) return ['add', 'watch'][actions++] || 'hide';
      if (/^opp/i.test(label)) return 'opp';
      if (/roster status/i.test(label)) return 'status';
      if (/^rank/i.test(groups[i] || '') && /^current$/i.test(label)) return 'rank';
      if (/^%\s*ros/i.test(label)) return 'ros';
      if (CATS.includes(label.toUpperCase())) return 'stat';
      return 'hide';
    });
    markCells(table, kinds.map(kind => ({ kind: kind === 'opp' ? 'hide' : kind })));
    tagTable(table, 'roster');
    tagTable(table, 'fa');
    table.style.setProperty('--ym-n', String(kinds.filter(k => k === 'stat').length || 9));

    // Show the opponent next to the name when Yahoo has no game-status text.
    const oppSlot = kinds.indexOf('opp');
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        const detail = row.querySelector('td[data-ym="player"] .ysf-player-detail');
        const opp = oppSlot >= 0 && row.cells[oppSlot] ? text(row.cells[oppSlot]) : '';
        if (detail) setAttr(detail, 'data-ym-opp', opp && !text(detail) ? opp : null);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  let pending = false;
  function scheduleEnhance() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      try { enhance(); } catch (err) { console.error('[ym]', err); }
    });
  }

  function enhance() {
    if (!document.body) return;
    buildBar();
    if (!settings.on) return;
    markChain();
    if (page === 'team') {
      buildSummary();
      enhanceRoster();
    } else if (page === 'matchup') {
      enhanceMatchup();
      markMine();
    } else if (page === 'players') {
      enhancePlayers();
    } else if (page === 'league') {
      markMine();
    }
    syncThemeColors();
  }

  function start() {
    applyMode();
    enhance();
    // Yahoo swaps stat tabs and lineup changes in place; re-apply after each update.
    new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
    // Yahoo's scripts set <html> classes too; put ours back if they get replaced.
    new MutationObserver(() => {
      if (html.classList.contains('ym-on') !== settings.on) applyMode();
    }).observe(html, { attributes: true, attributeFilter: ['class'] });
    // The layout width isn't final until the first layout, and changing it
    // doesn't always fire window resize, so re-measure on every viewport signal.
    window.addEventListener('resize', applyZoom);
    window.addEventListener('load', applyZoom);
    window.visualViewport?.addEventListener('resize', applyZoom);
    requestAnimationFrame(applyZoom);
    document.addEventListener('click', e => {
      if (!e.target.closest('.ym-sheet, [data-ym-sheet]')) toggleSheet(null);
    });
  }

  injectStyle();
  html.classList.add(`ym-page-${page}`);
  html.classList.toggle('ym-on', settings.on);
  applyZoom();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
