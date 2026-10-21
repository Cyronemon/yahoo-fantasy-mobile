// ==UserScript==
// @name         Yahoo Fantasy Basketball – Mobile
// @namespace    https://github.com/Cyronemon/yahoo-fantasy-mobile
// @version      0.1.0
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
  const DEFAULTS = { on: true, scale: 1, idle: 'collapse' };

  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }
  let settings = loadSettings();
  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* storage blocked */ }
  }

  // ---------------------------------------------------------------------------
  // Page detection
  // ---------------------------------------------------------------------------
  // My Team: /nba/<league>/<team> (optionally /team), with any query string.
  const TEAM_PATH = /^\/nba\/(\d+)\/(\d+)(?:\/team)?\/?$/;
  const teamMatch = location.pathname.match(TEAM_PATH);
  if (!teamMatch) return; // Other pages are left untouched for now.
  const [, leagueId, teamId] = teamMatch;

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
#ym-bar, #ym-summary, #ym-sheet, #ym-pill { display: none; }
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
html.ym-show-card #ym-summary .ym-team::after { content: " ▴"; }
#ym-summary .ym-rec { font-size: 12px; color: var(--ym-faint); white-space: nowrap; }
#ym-summary .ym-mu {
  grid-area: mu; display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 14px; border: 1px solid var(--ym-line);
  font-size: 12px; color: inherit; text-decoration: none; white-space: nowrap;
}
#ym-summary .ym-mu b { font-size: 14px; }
#ym-summary .ym-notes { grid-area: notes; font-size: 11px; color: var(--ym-faint); }
html.ym-on:not(.ym-show-card) #teamnotes.ym-compacted { display: none !important; }

/* Settings sheet */
html.ym-on #ym-sheet:not([hidden]) {
  display: block; position: fixed; z-index: 9001; top: var(--ym-bar-h); right: 6px; left: 6px;
  max-width: 360px; margin-left: auto; padding: 12px; box-sizing: border-box;
  background: var(--ym-bg, #fff); color: var(--ym-fg, #232a31);
  border: 1px solid var(--ym-line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.25);
  font: 14px/1.3 "YahooSans VF", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
#ym-sheet .ym-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; }
#ym-sheet .ym-row + .ym-row { border-top: 1px solid var(--ym-line); }
#ym-sheet .ym-seg { display: inline-flex; border: 1px solid var(--ym-line); border-radius: 8px; overflow: hidden; }
#ym-sheet .ym-seg button, #ym-sheet .ym-btn {
  min-width: 36px; height: 32px; padding: 0 10px; border: 0; background: none; color: inherit;
  font: inherit; font-size: 13px; cursor: pointer;
}
#ym-sheet .ym-seg button + button { border-left: 1px solid var(--ym-line); }
#ym-sheet .ym-seg button[aria-pressed="true"] { background: var(--ym-accent); color: #fff; }
#ym-sheet .ym-btn { border: 1px solid var(--ym-line); border-radius: 8px; }
#ym-sheet .ym-val { min-width: 48px; text-align: center; font-variant-numeric: tabular-nums; }

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
html.ym-on table.ym-roster th { font-size: 10px; font-weight: 700; letter-spacing: .02em; color: var(--ym-faint); padding: 7px 0 6px !important; white-space: nowrap; }
html.ym-on table.ym-roster th a { color: inherit !important; }
html.ym-on table.ym-roster th[data-ym="pos"] { grid-column: 1; }
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
  padding: 1px 0 7px !important; font-size: 12px; font-variant-numeric: tabular-nums;
  white-space: nowrap; overflow: hidden; text-overflow: clip;
}
html.ym-on table.ym-roster td[data-ym="stat"].ym-empty { color: var(--ym-faint); }

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
  const text = el => (el ? el.textContent.replace(/[-]/g, '').replace(/\s+/g, ' ').trim() : '');

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

  // Remove the fixed desktop widths on every wrapper between <body> and the roster.
  function markChain() {
    const start = $('#team-roster');
    for (let n = start && start.parentElement; n && n !== html; n = n.parentElement) {
      n.classList.add('ym-chain');
    }
  }

  // ---------------------------------------------------------------------------
  // Top bar, team summary, settings
  // ---------------------------------------------------------------------------
  function matchupHref() {
    const target = $('#team-card-matchup [data-target]');
    return target ? target.getAttribute('data-target') : `/nba/${leagueId}/matchup`;
  }

  function buildBar() {
    if ($('#ym-bar')) return;
    const nav = el('nav', { 'aria-label': 'League' },
      el('a', { href: `/nba/${leagueId}/${teamId}`, class: 'ym-cur' }, 'My Team'),
      el('a', { href: matchupHref() }, 'Matchup'),
      el('a', { href: `/nba/${leagueId}/players` }, 'Players'),
      el('a', { href: `/nba/${leagueId}` }, 'League'),
    );
    const gear = el('button', { type: 'button', 'aria-label': 'Layout settings', onclick: toggleSheet }, '⚙︎');
    document.body.prepend(el('div', { id: 'ym-bar' }, nav, gear));
    document.body.append(buildSheet(), el('button', {
      id: 'ym-pill', type: 'button', onclick: () => setSetting('on', true),
    }, 'Mobile layout'));
  }

  function buildSummary() {
    const card = $('#team-card');
    if (!card || $('#ym-summary')) return;
    const name = text($('.title .F-reset', card)) || document.title.split(' - ')[1]?.split(' | ')[0] || 'My team';
    const record = text($('.right .Fw-b', card));
    const place = text($('.right em', card)).replace(/[()]/g, '');
    const mu = $('#team-card-matchup', card);
    const muTitle = text(mu && mu.querySelector('.Pbot-med')).replace(/^Week\s+/i, 'Wk ');
    const scores = mu ? $$('.Fz-lg', mu).map(text) : [];

    const notes = teamNotes();
    const summary = el('div', { id: 'ym-summary' },
      el('div', { class: 'ym-id' },
        el('button', {
          type: 'button', class: 'ym-team', title: 'Show team card',
          onclick: () => html.classList.toggle('ym-show-card'),
        }, name),
        el('span', { class: 'ym-rec' }, [record, place].filter(Boolean).join(' · '))),
      mu ? el('a', { class: 'ym-mu', href: matchupHref() },
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

    const sheet = el('div', { id: 'ym-sheet', hidden: true, role: 'dialog', 'aria-label': 'Layout settings' },
      el('div', { class: 'ym-row' }, el('span', {}, 'Text size'),
        el('span', { class: 'ym-seg' },
          el('button', { type: 'button', onclick: () => setSetting('scale', clampScale(settings.scale - 0.1)) }, 'A−'),
          el('button', { type: 'button', onclick: () => setSetting('scale', 1) }, valueOut),
          el('button', { type: 'button', onclick: () => setSetting('scale', clampScale(settings.scale + 0.1)) }, 'A+'))),
      el('div', { class: 'ym-row' }, el('span', {}, 'No game today'), el('span', { class: 'ym-seg' }, ...idleBtns)),
      el('div', { class: 'ym-row' }, el('span', {}, 'Yahoo header'),
        el('button', { type: 'button', class: 'ym-btn', onclick: () => html.classList.toggle('ym-show-ybar') }, 'Show / hide')),
      el('div', { class: 'ym-row' }, el('span', {}, 'Original desktop page'),
        el('button', { type: 'button', class: 'ym-btn', onclick: () => { toggleSheet(); setSetting('on', false); } }, 'Switch off')),
    );
    sheet.refresh = () => {
      valueOut.textContent = `${Math.round(settings.scale * 100)}%`;
      for (const b of idleBtns) b.setAttribute('aria-pressed', String(b.dataset.v === settings.idle));
    };
    sheet.refresh();
    return sheet;
  }

  const clampScale = v => Math.min(1.6, Math.max(0.6, Math.round(v * 10) / 10));

  function toggleSheet() {
    const sheet = $('#ym-sheet');
    if (sheet) sheet.hidden = !sheet.hidden;
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

    const kinds = Array.from(labelRow.cells).map((cell, i) => {
      const label = text(cell);
      const cls = cell.classList;
      if (cls.contains('pos')) return 'pos';
      if (cls.contains('player')) return 'player';
      if (cls.contains('edit') || cls.contains('Spacer')) return 'hide';
      if (/^opp/i.test(label)) return 'opp';
      if (/^(rank|fantasy)$/i.test(groups[i] || '')) return 'hide';
      if (/\*$/.test(label)) return 'hide'; // starred columns are not scoring categories
      if (!label) return 'hide';
      return 'stat';
    });
    return { labelRow, kinds, labels: Array.from(labelRow.cells).map(text) };
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

    Array.from(cols.labelRow.cells).forEach((cell, i) =>
      setAttr(cell, 'data-ym', finalKinds[i] === 'opp' ? 'hide' : finalKinds[i]));

    for (const body of [...table.tBodies, table.tFoot]) {
      if (body) for (const row of body.rows) enhanceRow(row, finalKinds);
    }
  }

  function enhanceRow(row, kinds) {
    const cells = Array.from(row.cells);
    const odd = cells.length !== kinds.length;
    row.classList.toggle('ym-odd', odd && cells.length > 0);
    if (odd) return;

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
    buildSummary();
    enhanceRoster();
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
      const sheet = $('#ym-sheet');
      if (sheet && !sheet.hidden && !e.target.closest('#ym-sheet, #ym-bar button')) sheet.hidden = true;
    });
  }

  injectStyle();
  html.classList.toggle('ym-on', settings.on);
  applyZoom();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
