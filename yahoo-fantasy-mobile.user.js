// ==UserScript==
// @name         Yahoo Fantasy Basketball – Mobile
// @namespace    https://github.com/Cyronemon/yahoo-fantasy-mobile
// @version      0.3.0
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
html.ym-on table.ym-roster {
  display: block !important; width: 100% !important; min-width: 0 !important; overflow: visible !important;
  font-size: 13px; border: 0 !important; margin: 0 !important;
}
html.ym-on table.ym-roster > thead,
html.ym-on table.ym-roster > tbody,
html.ym-on table.ym-roster > tfoot { display: block; }
html.ym-on table.ym-roster > caption { display: none; }
html.ym-on table.ym-roster > thead {
  position: sticky; top: var(--ym-bar-h); z-index: 50;
  background: var(--ym-bg, #fff); border-bottom: 1px solid var(--ym-line);
}
html.ym-on table.ym-roster > thead > tr:not(:last-child) { display: none !important; }
html.ym-on table.ym-roster tr:not([style*="none"]) {
  display: grid !important;
  grid-template-columns: 44px repeat(var(--ym-n, 9), minmax(0, 1fr));
  align-items: center; height: auto !important; padding: 0 6px 0 4px; box-sizing: border-box;
}
html.ym-on table.ym-roster > tbody > tr { border-top: 1px solid var(--ym-line); }
html.ym-on table.ym-roster td,
html.ym-on table.ym-roster th {
  display: block; width: auto !important; min-width: 0; height: auto !important;
  padding: 0 !important; border: 0 !important; background: none !important; text-align: center;
}
html.ym-on table.ym-roster [data-ym="hide"] { display: none !important; }

/* header labels */
html.ym-on table.ym-roster th { font-size: 10px !important; font-weight: 700; letter-spacing: .02em; color: var(--ym-faint); padding: 7px 0 6px !important; white-space: nowrap; }
html.ym-on table.ym-roster th[data-ym="stat"] { text-align: center !important; }
html.ym-on table.ym-roster th a { color: inherit !important; }
html.ym-on table.ym-roster th[data-ym="pos"] { grid-column: 1; grid-row: 1; } /* matchup tables put it mid-row */
html.ym-on table.ym-roster th[data-ym="player"] { display: none; text-align: left; padding-left: 6px !important; }

/* position chip: Yahoo's own swap target */
html.ym-on table.ym-roster td[data-ym="pos"] { grid-column: 1; grid-row: 1 / span 2; align-self: center; }
html.ym-on table.ym-roster .pos-label {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: auto !important; min-width: 36px !important; height: 26px; padding: 0 4px; box-sizing: border-box;
  border-radius: 7px; font-size: 11px; font-weight: 700; letter-spacing: .02em;
  background: color-mix(in srgb, var(--ym-accent) 16%, transparent); color: inherit;
}
html.ym-on table.ym-roster tr.bench .pos-label { background: color-mix(in srgb, currentColor 9%, transparent); }
html.ym-on table.ym-roster tr[data-pos="IL"] .pos-label,
html.ym-on table.ym-roster tr[data-pos="IL+"] .pos-label { background: color-mix(in srgb, #cc0e25 18%, transparent); }
html.ym-on table.ym-roster > tbody > tr:not(.editable) .pos-label { background: none; box-shadow: inset 0 0 0 1px var(--ym-line); }
html.ym-on table.ym-roster > tbody > tr:not(.bench) + tr.bench { border-top: 2px solid color-mix(in srgb, currentColor 28%, transparent); }

/* player line */
html.ym-on table.ym-roster td[data-ym="player"] { grid-column: 2 / -1; grid-row: 1; text-align: left; padding: 7px 0 1px 6px !important; overflow: hidden; }
html.ym-on table.ym-roster td[data-ym="player"] > div { width: auto !important; }
html.ym-on table.ym-roster td[data-ym="player"] .Lh-0.Relative,
html.ym-on table.ym-roster td[data-ym="player"] img { display: none !important; }
html.ym-on table.ym-roster td[data-ym="player"] .D-f.Jc-fs { padding: 0 !important; }
html.ym-on table.ym-roster td[data-ym="player"] .Pstart-sm[style] { width: auto !important; flex: 1; min-width: 0; padding: 0 !important; }
html.ym-on table.ym-roster td[data-ym="player"] .D-f.Jc-sb { display: block !important; }
html.ym-on table.ym-roster td[data-ym="player"] .Ta-start.Truncate { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
html.ym-on table.ym-roster .ysf-player-name { display: flex !important; align-items: baseline; gap: 5px; min-width: 0; flex: 0 1 auto; overflow: hidden; line-height: 18px !important; }
html.ym-on table.ym-roster .ysf-player-name a.name { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 600; }
html.ym-on table.ym-roster .ysf-player-name .D-b { display: inline !important; flex: none; color: var(--ym-faint); }
html.ym-on table.ym-roster .ysf-player-name .D-b .Fz-xxs { font-size: 11px !important; }
html.ym-on table.ym-roster .ysf-player-status { flex: none; order: 1; }
html.ym-on table.ym-roster .ysf-player-status span { padding: 1px 4px !important; border-radius: 4px; font-size: 10px; font-weight: 700; background: color-mix(in srgb, #cc0e25 14%, transparent); }
html.ym-on table.ym-roster .player-status { flex: none; order: 2; padding: 0 !important; }
html.ym-on table.ym-roster .ysf-player-name .D-b { order: 3; }
html.ym-on table.ym-roster .ysf-player-detail { margin-left: auto; flex: none; font-size: 11px !important; color: var(--ym-faint); line-height: 18px !important; }
html.ym-on table.ym-roster .ysf-player-detail a { color: inherit !important; }
html.ym-on table.ym-roster .ysf-player-detail[data-ym-opp]:not(:has(.ysf-game-status a))::before { content: attr(data-ym-opp); }

/* stat line */
html.ym-on table.ym-roster td[data-ym="stat"] {
  padding: 1px 0 7px !important; font-size: 12px; font-variant-numeric: tabular-nums; text-align: center !important;
  white-space: nowrap; overflow: hidden; text-overflow: clip;
}
html.ym-on table.ym-roster td[data-ym="stat"].ym-empty { color: var(--ym-faint); }
/* short faint line between stat columns (a dot would read like the decimal in .474) */
html.ym-on table.ym-roster [data-ym="stat"] ~ [data-ym="stat"] {
  background: linear-gradient(var(--ym-sep), var(--ym-sep)) left center / 1px 14px no-repeat !important;
}

/* lineup totals */
html.ym-on table.ym-roster > tfoot > tr { border-top: 2px solid color-mix(in srgb, currentColor 28%, transparent); }
html.ym-on table.ym-roster > tfoot td[data-ym="pos"] { display: block !important; visibility: hidden; }
html.ym-on table.ym-roster > tfoot td[data-ym="player"] {
  padding-top: 8px !important; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ym-faint);
}
html.ym-on table.ym-roster > tfoot td[data-ym="stat"] { font-weight: 700; padding-bottom: 10px !important; }

/* players with no game on the selected date */
html.ym-on table.ym-roster tr.ym-idle td[data-ym="player"] { opacity: .6; }
html.ym-on:not(.ym-idle-show) table.ym-roster tr.ym-idle td[data-ym="stat"] { display: none !important; }
html.ym-on:not(.ym-idle-show) table.ym-roster tr.ym-idle td[data-ym="player"] { padding-bottom: 7px !important; }

/* rows whose cells don't line up with the header (e.g. empty slots during a swap) */
html.ym-on table.ym-roster tr.ym-odd { grid-template-columns: 44px 1fr; }
html.ym-on table.ym-roster tr.ym-odd > td:not(:first-child) { grid-column: 2; text-align: left; padding: 8px 6px !important; }
html.ym-on table.ym-roster tr.ym-odd > td:first-child { grid-row: 1 / span 9; }

/* too many columns for the phone: let the table scroll sideways instead */
html.ym-on #team-roster .tablewrap.ym-scroll { overflow-x: auto !important; }
html.ym-on table.ym-roster.ym-many { width: max-content !important; min-width: 100% !important; }
html.ym-on table.ym-roster.ym-many tr:not([style*="none"]) { grid-template-columns: 44px repeat(var(--ym-n), 46px); }

/* landscape / wide: everything on one line */
html.ym-on.ym-wide table.ym-roster tr:not([style*="none"]) {
  grid-template-columns: 48px minmax(200px, 1fr) repeat(var(--ym-n, 9), 50px);
}
html.ym-on.ym-wide table.ym-roster td[data-ym="pos"] { grid-row: 1; }
html.ym-on.ym-wide table.ym-roster td[data-ym="player"] { grid-column: 2; padding: 6px 8px 6px 6px !important; }
html.ym-on.ym-wide table.ym-roster th[data-ym="player"] { display: block !important; grid-column: 2; }
html.ym-on.ym-wide table.ym-roster td[data-ym="stat"] { padding: 6px 0 !important; }
html.ym-on.ym-wide:not(.ym-idle-show) table.ym-roster tr.ym-idle td[data-ym="stat"] { display: block !important; visibility: hidden; }

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
html.ym-on table.ym-cats { display: block !important; width: 100% !important; margin: 4px 0 0 !important; border: 0 !important; font-size: 13px; }
html.ym-on table.ym-cats > thead,
html.ym-on table.ym-cats > tbody { display: block; }
/* team column shows just the logo; names are in the header and the roster toggle */
html.ym-on table.ym-cats tr {
  display: grid !important; grid-template-columns: 28px repeat(9, minmax(0, 1fr)); align-items: center; padding: 0 4px 0 6px; height: auto !important;
}
html.ym-on table.ym-cats > tbody > tr { border-top: 1px solid var(--ym-line); }
html.ym-on table.ym-cats td,
html.ym-on table.ym-cats th {
  display: block; padding: 7px 0 !important; border: 0 !important; background: none !important; text-align: center !important;
  white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums;
}
html.ym-on table.ym-cats [data-ym="hide"] { display: none !important; }
html.ym-on table.ym-cats th { font-size: 10px !important; font-weight: 700; color: var(--ym-faint); padding: 6px 0 !important; }
html.ym-on table.ym-cats [data-ym="team"] { text-align: left !important; font-size: 0 !important; line-height: 0; }
html.ym-on table.ym-cats [data-ym="team"] img { width: 20px !important; height: 20px !important; margin: 0 !important; }
html.ym-on table.ym-cats td[data-ym="stat"] { font-weight: 400; font-size: 12px !important; }
html.ym-on table.ym-cats td[data-ym="stat"].Fw-b {
  font-weight: 700; color: var(--ym-accent);
  background: color-mix(in srgb, var(--ym-accent) 14%, transparent) !important; border-radius: 6px;
}
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
html.ym-on table.ym-roster[data-ym-show="a"] [data-ym-side="b"],
html.ym-on table.ym-roster[data-ym-show="b"] [data-ym-side="a"] { display: none !important; }
html.ym-on table.ym-mu-roster td[data-ym="pos"] {
  justify-self: center; align-self: center; display: flex; align-items: center; justify-content: center;
  min-width: 36px; height: 26px; padding: 0 4px !important; box-sizing: border-box; border-radius: 7px;
  font-size: 11px; font-weight: 700; color: inherit !important;
  background: color-mix(in srgb, currentColor 9%, transparent) !important;
}
html.ym-on table.ym-mu-roster { border: 0 !important; }

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
    const { ids, href } = cardMatchup();
    const saved = readJSON(LEAGUE_KEY, {});
    const next = { ...saved, own };
    if (teamId === own) {
      next.opp = ids.find(id => id !== own) || saved.opp;
      next.mu = href || saved.mu;
    } else if (ids.includes(own)) {
      next.opp = teamId; // this team is playing me this week
    }
    if (JSON.stringify(next) !== JSON.stringify(saved)) writeJSON(LEAGUE_KEY, next);
    return next;
  }

  const matchupHref = () => readJSON(LEAGUE_KEY, {}).mu || `/nba/${leagueId}/matchup`;

  function buildBar() {
    if ($('#ym-bar')) return;
    const own = ownTeamId();
    const nav = el('nav', { 'aria-label': 'League' },
      el('a', { href: `/nba/${leagueId}/${own}`, class: teamId === own ? 'ym-cur' : null }, 'My Team'),
      el('a', { href: matchupHref(), class: page === 'matchup' ? 'ym-cur' : null }, 'Matchup'),
      el('a', { href: `/nba/${leagueId}/players` }, 'Players'),
      el('a', { href: `/nba/${leagueId}` }, 'League'),
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
    table.classList.add('ym-roster');

    // If this view has the scoring categories, show only those on the stat line.
    const hasCats = labels.some((l, i) => kinds[i] === 'stat' && CATS.includes(l.toUpperCase()));
    const finalKinds = kinds.map((k, i) =>
      k === 'stat' && hasCats && !CATS.includes(labels[i].toUpperCase()) ? 'hide' : k);
    const n = finalKinds.filter(k => k === 'stat').length;
    table.style.setProperty('--ym-n', String(Math.max(n, 1)));
    table.classList.toggle('ym-many', n > 10);
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
    row.classList.toggle('ym-odd', !kinds && cells.length > 0);
    if (!kinds) return;

    let opp = '';
    cells.forEach((cell, i) => {
      const kind = kinds[i] === 'opp' ? 'hide' : kinds[i];
      setAttr(cell, 'data-ym', kind);
      if (kinds[i] === 'opp') opp = text(cell);
      if (kind === 'stat') {
        const v = text(cell);
        cell.classList.toggle('ym-empty', v === '' || v === '-' || v === '-/-');
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
      row.classList.toggle('ym-odd', odd && cells.length > 0);
      if (odd) continue;
      cells.forEach((cell, i) => {
        const { kind, side } = slots[spans[i]];
        setAttr(cell, 'data-ym', kind);
        setAttr(cell, 'data-ym-side', side || null);
        if (kind === 'stat' && cell.tagName === 'TD') {
          const v = text(cell);
          cell.classList.toggle('ym-empty', v === '' || v === '-' || v === '-/-');
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

  function matchupSides() {
    const cols = $$('#matchup-header .Grid-u-1-3');
    const sideOf = col => {
      const link = col && $$('a', col).find(a => /^\/nba\/\d+\/\d+$/.test(pathOf(a)) && text(a));
      return link ? { id: teamIdOf(link), name: text(link) } : null;
    };
    return { a: sideOf(cols[0]), b: sideOf(cols[2]) };
  }

  // Category totals: keep the 9 scoring categories; Yahoo marks each winner in bold.
  function enhanceCategories() {
    const table = $('#matchup-wall-header table');
    const slots = table && headerSlots(table);
    if (!slots) return;
    table.classList.add('ym-cats');
    markCells(table, slots.map(s => ({
      kind: /^team$/i.test(s.label) ? 'team' : CATS.includes(s.label.toUpperCase()) ? 'stat' : 'hide',
    })));
  }

  // Both rosters share one table: team A's columns, a shared slot "Pos" column,
  // then team B's columns. Show one team at a time with the same row layout as My Team.
  function enhanceMatchupRoster(sides) {
    const table = $$('#yspmaincontent table[id^="statTable"]').find(t => t.tHead);
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
    table.classList.add('ym-roster', 'ym-mu-roster');
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

    let toggle = $('#ym-sides');
    if (!toggle || toggle.nextElementSibling !== table.closest('div, section')) {
      toggle?.remove();
      const show = side => {
        matchupSide = side;
        try { sessionStorage.setItem('ym:mu-team', sides[side] ? sides[side].id : ''); } catch { /* storage blocked */ }
        scheduleEnhance();
      };
      toggle = el('div', { id: 'ym-sides', class: 'ym-seg', role: 'tablist' }, ...['a', 'b'].map(side =>
        el('button', { type: 'button', role: 'tab', 'data-side': side, onclick: () => show(side) },
          sides[side] ? sides[side].name : side.toUpperCase())));
      table.closest('div, section').before(toggle);
    }
    for (const b of toggle.children) setAttr(b, 'aria-selected', String(b.dataset.side === matchupSide));
  }

  function enhanceMatchup() {
    const sides = matchupSides();
    // Remember my opponent when this is my matchup, so team pages can highlight them.
    const own = ownTeamId();
    if (own && sides.a && sides.b && [sides.a.id, sides.b.id].includes(own)) {
      const saved = readJSON(LEAGUE_KEY, {});
      const next = { ...saved, own, opp: sides.a.id === own ? sides.b.id : sides.a.id, mu: location.pathname + location.search };
      if (JSON.stringify(next) !== JSON.stringify(saved)) writeJSON(LEAGUE_KEY, next);
    }
    enhanceCategories();
    enhanceMatchupRoster(sides);
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
