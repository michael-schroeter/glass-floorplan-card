/* ================================================================== Styles (everything scales with --u = px per design unit) */
const STYLES = `
:host { display: block; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, [tabindex]:focus-visible { outline: 2px solid rgba(var(--blue), .9); outline-offset: 2px; }
.ic { width: 1em; height: 1em; fill: none; stroke: var(--ip, url(#gfcg)); stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; display: block; }
.ic .f { fill: var(--ip, url(#gfcg)); stroke: none; }
.defs { position: absolute; width: 0; height: 0; overflow: hidden; }
ha-icon, ha-state-icon { display: grid; place-items: center; color: rgba(232, 234, 240, .86); }

.root {
  --t1: #f5f5f7; --t2: rgba(235, 235, 245, .6); --t3: rgba(235, 235, 245, .36);
  --gold: 246, 200, 89; --blue: 10, 132, 255; --green: 48, 209, 88; --red: 255, 69, 58; --orange: 255, 159, 10;
  --u: .66px; --gap: calc(13 * var(--u)); --warm: 0; --day: 0;
  position: relative; height: 100%; overflow: hidden; isolation: isolate;
  background: #08090c; color: var(--t1);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif;
  font-size: 14px; line-height: 1.25; letter-spacing: -.01em;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.root.boot *, .root.boot *::before, .root.boot *::after { transition: none !important; animation: none !important; }

/* ---------------------------------------------------------------- Background */
.bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.bg i { position: absolute; inset: 0; transition: opacity 1.8s ease; }
.bg .g1 { background: radial-gradient(62% 80% at 2% 22%, rgba(132, 104, 44, .62), rgba(100, 78, 32, .26) 42%, rgba(60, 46, 20, 0) 76%); opacity: var(--warm); }
.bg .g2 { background: radial-gradient(50% 62% at 66% 100%, rgba(118, 64, 42, .55), rgba(86, 46, 30, .2) 46%, rgba(60, 30, 20, 0) 78%); opacity: calc(var(--warm) * .95); }
.bg .g3 { background: radial-gradient(70% 70% at 8% 6%, rgba(46, 64, 120, .30), rgba(30, 40, 80, 0) 70%), radial-gradient(60% 60% at 80% 100%, rgba(36, 46, 96, .24), rgba(30, 40, 80, 0) 70%); opacity: calc((1 - var(--warm)) * (1 - var(--day) * .6)); }
.bg .g4 { background: radial-gradient(90% 80% at 30% 0%, rgba(130, 150, 180, .2), rgba(80, 90, 110, 0) 72%), linear-gradient(180deg, rgba(40, 46, 58, .5), rgba(20, 22, 28, 0)); opacity: calc(var(--day) * (1 - var(--warm) * .5)); }
.bg .g5 { background: radial-gradient(60% 70% at 20% 10%, rgba(40, 90, 120, .34), rgba(30, 60, 90, 0) 70%), radial-gradient(60% 60% at 90% 90%, rgba(120, 70, 40, .26), rgba(80, 40, 20, 0) 70%); opacity: 0; }
.root[data-type="climate"] .bg .g5 { opacity: 1; }
.root[data-type="climate"] .bg .g1, .root[data-type="climate"] .bg .g2 { opacity: calc(var(--warm) * .35); }
.bg .dots { background-image: radial-gradient(circle, rgba(255, 255, 255, .08) .8px, rgba(255, 255, 255, 0) 1.25px); background-size: calc(27.6 * var(--u)) calc(27.6 * var(--u)); background-position: var(--dx, 0) var(--dy, 0); }

/* ---------------------------------------------------------------- Layout */
.lay { position: absolute; inset: 0; z-index: 1; }
.stage { position: absolute; left: var(--sx, 24px); top: var(--sy, 20px); width: var(--sw, 700px); height: var(--sh, 640px); }

/* ---------------------------------------------------------------- Floor plan */
.glows { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: opacity .6s ease; }
.glows i { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); width: calc(var(--r) * 3.1 * var(--u)); height: calc(var(--r) * 3.1 * var(--u));
  background: radial-gradient(closest-side, rgba(var(--c), .3), rgba(var(--c), .1) 52%, rgba(var(--c), 0)); opacity: 0;
  transform: translate(-50%, -50%) scale(.6); transition: opacity 1.1s ease, transform 1.6s cubic-bezier(.16, .8, .24, 1); }
.glows i.on { opacity: var(--o, 1); transform: translate(-50%, -50%) scale(1); }

.pas { position: absolute; z-index: 0; border-radius: calc(4 * var(--u)); background: rgba(255, 255, 255, .13); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05); pointer-events: none; }
.win { position: absolute; z-index: 4; height: max(2px, calc(3.4 * var(--u))); transform: translateY(-50%); border-radius: 4px; pointer-events: none;
  background: rgb(calc(196 + 59 * var(--day)), calc(208 + 47 * var(--day)), calc(232 + 23 * var(--day)));
  box-shadow: 0 0 calc(6 * var(--u)) rgba(200, 220, 255, calc(.35 + .4 * var(--day))), 0 0 calc(18 * var(--u)) rgba(200, 220, 255, calc(.12 + .3 * var(--day)));
  opacity: calc(.22 + .78 * var(--op, 1)); transition: opacity .8s ease; }
.win.v { height: auto; width: max(2px, calc(3.4 * var(--u))); transform: translateX(-50%); }
.win.fd { height: max(3px, calc(4.6 * var(--u))); background: #fff; opacity: 1; box-shadow: 0 0 calc(8 * var(--u)) rgba(255, 255, 255, .6), 0 0 calc(20 * var(--u)) rgba(255, 255, 255, .18); transition: background .4s, box-shadow .4s; }
.win.v.fd { height: auto; width: max(3px, calc(4.6 * var(--u))); }
.win.fd.open { background: rgb(var(--green)); box-shadow: 0 0 calc(10 * var(--u)) rgba(var(--green), .8), 0 0 calc(26 * var(--u)) rgba(var(--green), .4); }
/* shutters: in the covers layer a closed window shows a dark slat instead of daylight */
.win.cv::after { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: rgba(30, 32, 40, .92); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25);
  transform: scaleX(calc(1 - var(--op, 1))); transform-origin: 50% 50%; opacity: 0; transition: transform .8s var(--soft), opacity .4s; }
.win.v.cv::after { transform: scaleY(calc(1 - var(--op, 1))); }
.root[data-type="cover"] .win.cv { opacity: 1; }
.root[data-type="cover"] .win.cv::after { opacity: 1; }

.room { position: absolute; z-index: 1; border-radius: calc(15 * var(--u)); overflow: hidden; cursor: pointer; outline: none;
  background: linear-gradient(165deg, rgba(255, 255, 255, .055), rgba(255, 255, 255, .02) 55%, rgba(255, 255, 255, .015)), rgba(16, 16, 20, .42);
  -webkit-backdrop-filter: blur(10px) saturate(130%); backdrop-filter: blur(10px) saturate(130%);
  box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18);
  transition: box-shadow .6s ease, background .5s ease, transform var(--sp-ms) var(--sp); }
.room::after { content: ''; position: absolute; inset: 0; z-index: 5; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .05); transition: box-shadow .5s ease; }
.room .ri { position: absolute; inset: calc(var(--gap) / -2); pointer-events: none; }
.room.lit { box-shadow: 0 0 calc(26 * var(--u)) rgba(var(--lc), .12), 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18); }
.room.lit::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .58), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .07); }
.room:hover::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .28), inset 0 1px 0 rgba(255, 255, 255, .08); }
.room.lit:hover::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .85), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .1); }
.room:active { transform: scale(.994); }
.room:focus-visible::after { box-shadow: inset 0 0 0 2px rgba(var(--blue), .9); }
/* rooms without anything to show in the current layer are just floor plan (no pop-up, no hover) */
.room.idle { cursor: default; }
.room.idle:hover::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .05); }
.room.lit.idle:hover::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .58), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .07); }
.room.idle:active { transform: none; }

.rgl { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: opacity .6s ease; }
.rgl i { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); width: calc(var(--r) * 2 * var(--u)); height: calc(var(--r) * 2 * var(--u));
  background: radial-gradient(closest-side, rgba(var(--c), .74), rgba(var(--c), .4) 30%, rgba(var(--c), .14) 66%, rgba(var(--c), 0)); opacity: 0;
  transform: translate(-50%, -50%) scale(.72); transition: opacity .9s ease, transform 1.4s cubic-bezier(.16, .8, .24, 1); }
.rgl i.on { opacity: var(--o, 1); transform: translate(-50%, -50%) scale(1); }
/* spot light cones: 100° beams, brightest in the middle, soft towards the edges and with distance */
.rgl i.cone { border-radius: 0;
  --cb: rgba(var(--c), 0), rgba(var(--c), .34) 5deg, rgba(var(--c), .5) 18deg, rgba(var(--c), .62) 50deg, rgba(var(--c), .5) 82deg, rgba(var(--c), .34) 95deg, rgba(var(--c), 0) 100deg, rgba(var(--c), 0);
  background: var(--cones);
  -webkit-mask: radial-gradient(closest-side, #000 10%, rgba(0, 0, 0, .78) 30%, rgba(0, 0, 0, .34) 62%, rgba(0, 0, 0, .1) 84%, transparent);
  mask: radial-gradient(closest-side, #000 10%, rgba(0, 0, 0, .78) 30%, rgba(0, 0, 0, .34) 62%, rgba(0, 0, 0, .1) 84%, transparent);
  transform: translate(-50%, -50%) scale(.45) rotate(-14deg); transition: opacity 1s ease, transform 1.5s cubic-bezier(.16, .8, .24, 1); }
.rgl i.cone.on { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
/* daylight through the windows (direction = wall of the window) */
.rgl i.dl { border-radius: 0; transform: none; width: auto; height: auto; opacity: calc(var(--dli, 0) * var(--op, 1)); transition: opacity 2s ease;
  background: radial-gradient(50% 100% at 50% 0%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
.rgl i.dl.up { background: radial-gradient(50% 100% at 50% 100%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
.rgl i.dl.r { background: radial-gradient(100% 50% at 100% 50%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
.rgl i.dl.l { background: radial-gradient(100% 50% at 0% 50%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
/* climate layer: the room glows in its temperature colour */
.ctint { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .7s ease, background .7s ease;
  background: radial-gradient(120% 90% at 30% 20%, rgba(var(--tc), .26), rgba(var(--tc), .1) 55%, rgba(var(--tc), .04)); }
.root[data-type="climate"] .room.tt .ctint, .root[data-show-climate] .room.tt .ctint { opacity: 1; }
.root[data-type="climate"] .room.tt::after { box-shadow: inset 0 0 0 1px rgba(var(--tc), .55), inset 0 0 calc(22 * var(--u)) rgba(var(--tc), .1); }
.root[data-type="climate"] .room.tt { box-shadow: 0 0 calc(26 * var(--u)) rgba(var(--tc), .1), 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18); }

.fu { position: absolute; z-index: 1; pointer-events: none; border-radius: calc(var(--fr, 8) * var(--u));
  background: linear-gradient(165deg, rgba(255, 255, 255, .075), rgba(255, 255, 255, .03));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), inset 0 1px 0 rgba(255, 255, 255, .05); transition: background .5s, box-shadow .5s; }
.fu.c { border-radius: 50%; }
.fu.rug { background: rgba(255, 255, 255, .025); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.fu.tv.on { background: linear-gradient(180deg, rgba(190, 210, 255, .55), rgba(120, 160, 255, .35)); box-shadow: inset 0 0 0 1px rgba(200, 220, 255, .75), 0 0 calc(16 * var(--u)) rgba(120, 165, 255, .7); }

.rl { position: absolute; z-index: 3; left: calc(16 * var(--u)); right: calc(8 * var(--u)); top: calc(13 * var(--u)); pointer-events: none; text-shadow: 0 1px 10px rgba(0, 0, 0, .3); }
.rl b { display: block; font-weight: 650; font-size: max(11px, calc(17 * var(--u))); letter-spacing: -.012em; line-height: 1.15; color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl span { display: block; margin-top: calc(3 * var(--u)); font-weight: 500; font-size: max(10.5px, calc(14 * var(--u))); color: var(--t2); min-height: 1em; transition: color .4s; white-space: nowrap; font-variant-numeric: tabular-nums; }
.room.lit .rl span { color: rgba(235, 235, 245, .66); }
.room.lb .rl { top: auto; bottom: calc(14 * var(--u)); }
.badge { position: absolute; z-index: 4; top: calc(11 * var(--u)); right: calc(11 * var(--u)); width: max(20px, calc(28 * var(--u))); height: max(20px, calc(28 * var(--u)));
  border-radius: 50%; display: grid; place-items: center; background: rgb(var(--blue)); color: #fff; font-size: max(11px, calc(14 * var(--u))); font-weight: 700;
  box-shadow: 0 4px 12px rgba(var(--blue), .45); transform: scale(0); transition: transform var(--pop-ms) var(--pop); }

/* Markers: lamps and devices as glowing glass buttons */
.lamp, .dev { position: absolute; z-index: 6; --ls: max(34px, calc(52 * var(--u))); width: var(--ls); height: var(--ls); margin: calc(var(--ls) / -2) 0 0 calc(var(--ls) / -2);
  border-radius: 50%; display: grid; place-items: center; transition: transform var(--sp-ms) var(--sp), opacity .35s ease, left .55s var(--soft), top .55s var(--soft); }
.dev { --ls: max(30px, calc(44 * var(--u))); }
.lamp > i, .dev > i { position: absolute; border-radius: 50%; pointer-events: none; }
.lamp .disc, .dev .disc { inset: 0; background: rgba(255, 255, 255, .12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .17), inset 0 1px 0 rgba(255, 255, 255, .12), 0 5px 14px rgba(0, 0, 0, .3);
  -webkit-backdrop-filter: blur(14px) saturate(150%); backdrop-filter: blur(14px) saturate(150%); transition: background .35s ease, box-shadow .45s ease; }
.lamp .halo, .dev .halo { inset: calc(var(--ls) * -.62); background: radial-gradient(closest-side, rgba(var(--c), .46), rgba(var(--c), .16) 55%, rgba(var(--c), 0));
  opacity: 0; transform: scale(.55); transition: opacity .5s ease, transform var(--soft-ms) var(--soft); }
.lamp.on .halo, .dev.on .halo { opacity: 1; transform: scale(1); }
.lamp.on .disc, .dev.on .disc { background: radial-gradient(circle at 50% 28%, rgb(var(--cl)), rgb(var(--c)) 72%);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .3), inset 0 -2px 6px rgba(0, 0, 0, .08), 0 0 0 calc(var(--ls) * .12) rgba(var(--c), .13), 0 3px 16px rgba(var(--c), .42); }
/* fixed size (not via inset): Safari/iOS would not stretch the SVG and the ring would sit off-centre */
.lamp .ring, .dev .ring { position: absolute; left: 6.5%; top: 6.5%; width: 87%; height: 87%; transform: rotate(-90deg); overflow: visible; pointer-events: none; }
.lamp .ring circle, .dev .ring circle { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke: rgba(0, 0, 0, .34); vector-effect: non-scaling-stroke;
  transition: stroke-dasharray .7s var(--soft), stroke .35s, opacity .35s; }
.lamp.on .ring circle { stroke: rgba(40, 26, 0, .36); }
.lamp.on.dk .ring circle, .dev.on.dk .ring circle { stroke: rgba(255, 255, 255, .5); }
.dev .ring circle { stroke: rgba(255, 255, 255, .78); }
.dev.on .ring circle { stroke: rgba(10, 24, 60, .45); }
.lamp > .ic, .dev > .ic, .dev > ha-icon, .dev > ha-state-icon { position: relative; font-size: calc(var(--ls) * .48); stroke-width: 1.95; transition: color .3s ease; pointer-events: none; }
.dev > .ic { font-size: calc(var(--ls) * .46); }
.dev > ha-icon, .dev > ha-state-icon { --mdc-icon-size: calc(var(--ls) * .5); }
.lamp.on > .ic { --ip: currentColor; color: rgba(44, 30, 2, .9); }
.lamp.on.dk > .ic { color: #fff; }
.dev.on > .ic { --ip: currentColor; color: rgba(10, 24, 60, .88); }
.dev.on > ha-icon, .dev.on > ha-state-icon { color: rgba(10, 24, 60, .88); }
.dev.on.dk > .ic, .dev.on.dk > ha-icon, .dev.on.dk > ha-state-icon { color: #fff; }
.lamp.na, .dev.na { opacity: .45; }
.lamp:hover, .dev:hover { transform: scale(1.08); }
.lamp.pressed, .dev.pressed { transform: scale(.9); transition-duration: .12s; }
.lamp .rip, .dev .rip { inset: 0; border: 1.5px solid rgba(var(--c), .9); box-shadow: 0 0 calc(var(--ls) * .25) rgba(var(--c), .5), inset 0 0 calc(var(--ls) * .2) rgba(var(--c), .35); opacity: 0; }
.dev.door.open .disc { background: rgb(var(--green)); box-shadow: 0 0 0 calc(var(--ls) * .14) rgba(var(--green), .18), 0 0 18px rgba(var(--green), .6); }
.dev.door.open > .ic { --ip: currentColor; color: #04210c; }
/* value markers (thermostats, sensors): the reading instead of an icon */
.dev.val { --ls: max(34px, calc(50 * var(--u))); }
.dev.val .vt { position: relative; font-size: max(11px, calc(16 * var(--u))); font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; pointer-events: none; transition: color .3s; }
.dev.val .vt small { font-size: .72em; font-weight: 600; opacity: .7; }
.dev.val.sens { --ls: max(30px, calc(44 * var(--u))); }
.dev.val.sens .vt { font-size: max(10px, calc(14 * var(--u))); }
.dev.val.sens .disc { background: rgba(255, 255, 255, .07); }
.dev.val.on .vt { color: rgba(30, 14, 0, .9); }
.dev.val.on.dk .vt { color: #fff; }
.dev .act { position: absolute; right: -6%; bottom: -6%; width: 40%; height: 40%; border-radius: 50%; display: grid; place-items: center; font-size: calc(var(--ls) * .22);
  background: rgba(28, 28, 34, .9); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2); opacity: 0; transform: scale(.4); transition: opacity .3s, transform var(--pop-ms) var(--pop); }
.dev .act .ic { --ip: rgb(var(--c)); stroke-width: 2.2; }
.dev.on .act { opacity: 1; transform: none; }
/* markers of other layers fade out */
.lamp.hid, .dev.hid { opacity: 0; transform: scale(.5); pointer-events: none; }
.root[data-glow="dim"] .rgl, .root[data-glow="dim"] .glows { opacity: .3; }
.root[data-glow="dim"] .room.lit::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14); }
.root[data-glow="dim"] .room.lit { box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18); }

/* Tooltip */
.tip { position: absolute; z-index: 30; left: 0; top: 0; pointer-events: none; padding: 7px 11px 7px; border-radius: 11px; white-space: nowrap;
  font-size: 12.5px; font-weight: 600; color: var(--t1); background: rgba(36, 36, 42, .8);
  -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), 0 10px 28px rgba(0, 0, 0, .4);
  opacity: 0; transform: translate(-50%, calc(-100% - 8px)) scale(.9); transform-origin: 50% 100%; transition: opacity .14s ease, transform .3s var(--snap); }
.tip.show { opacity: 1; transform: translate(-50%, calc(-100% - 12px)) scale(1); }
.tip.side { transform: translate(6px, -50%) scale(.9); transform-origin: 0 50%; }
.tip.side.show { transform: translate(12px, -50%) scale(1); }
.tip small { font-size: 12.5px; font-weight: 500; color: var(--t2); margin-left: 6px; font-variant-numeric: tabular-nums; }

/* Layers: vertical glass toolbar, a white knob springs to the chosen layer */
.tabs { position: absolute; z-index: 8; display: flex; flex-direction: column; gap: calc(4 * var(--u)); padding: max(4px, calc(6 * var(--u)));
  border-radius: 999px; transform: translate(-50%, -50%);
  background: linear-gradient(165deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .05));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), inset 0 1px 0 rgba(255, 255, 255, .08), 0 10px 30px rgba(0, 0, 0, .25);
  -webkit-backdrop-filter: blur(26px) saturate(160%); backdrop-filter: blur(26px) saturate(160%); }
.tabs button { position: relative; z-index: 1; display: grid; place-items: center; width: max(38px, calc(60 * var(--u))); height: max(38px, calc(60 * var(--u)));
  border-radius: 999px; color: rgba(235, 235, 245, .8); transition: color .35s ease, background .25s ease, transform .3s var(--snap); }
.tabs button .ic, .tabs button ha-icon { font-size: max(19px, calc(27 * var(--u))); --mdc-icon-size: max(19px, calc(27 * var(--u))); }
.tabs button span { display: none; }
.tabs button:not(.act):hover { background: rgba(255, 255, 255, .07); }
.tabs button:active { transform: scale(.92); }
.tabs button.act { color: #0c0c0e; }
.tabs button.act .ic { --ip: currentColor; }
.tabs button.act ha-icon { color: #0c0c0e; }
.tabs .knob { position: absolute; z-index: 0; top: 0; left: max(4px, calc(6 * var(--u))); right: max(4px, calc(6 * var(--u))); height: 0; border-radius: 999px;
  background: linear-gradient(180deg, #fff, #ececf0); box-shadow: 0 2px 10px rgba(0, 0, 0, .25), inset 0 -1px 0 rgba(0, 0, 0, .06);
  transition: transform var(--sp-ms) var(--sp), height var(--sp-ms) var(--sp); }

/* Layer card in the gap */
.gcard { position: absolute; z-index: 7; display: flex; flex-direction: column; border-radius: calc(26 * var(--u)); overflow: hidden;
  padding: max(12px, calc(20 * var(--u))) calc(24 * var(--u)) max(12px, calc(22 * var(--u)));
  background: linear-gradient(150deg, rgba(var(--g1, 44, 44, 50), .64), rgba(var(--g2, 30, 30, 36), .66));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .08), 0 22px 50px rgba(0, 0, 0, .34);
  -webkit-backdrop-filter: blur(30px) saturate(150%); backdrop-filter: blur(30px) saturate(150%); transition: background 1s ease; }
.gcard > .gv { display: flex; flex-direction: column; height: 100%; animation: fadein .5s cubic-bezier(.2, .8, .2, 1) both; }
.root.ev .gcard > .gv { animation: none; }
@keyframes fadein { from { opacity: 0; transform: translateY(10px) scale(.985); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
.gk { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: max(11px, calc(14 * var(--u))); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t2); }
.gk > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gk .bat { display: flex; align-items: center; gap: 5px; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
.gk .bat .ic { font-size: 1.25em; stroke-width: 1.6; }
.gt { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: calc(4 * var(--u)); }
.gt b { font-size: max(17px, calc(29 * var(--u))); font-weight: 700; letter-spacing: -.025em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.gt span { flex: none; font-size: max(12.5px, calc(16 * var(--u))); color: var(--t2); font-variant-numeric: tabular-nums; }
.gs { margin-top: calc(3 * var(--u)); font-size: max(12px, calc(15 * var(--u))); color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gt button.lnk { font-size: max(12.5px, calc(16 * var(--u))); font-weight: 600; color: rgb(100, 170, 255); }
.segs { display: flex; gap: calc(6 * var(--u)); margin: auto 0 0; padding-top: calc(10 * var(--u)); }
.segs i { position: relative; flex: 1; height: max(4px, calc(7 * var(--u))); border-radius: 99px; background: rgba(255, 255, 255, .13); overflow: hidden; transition: background .45s ease, box-shadow .45s ease; }
.segs i.on { background: rgb(var(--c)); box-shadow: 0 0 calc(10 * var(--u)) rgba(var(--c), .5); }
.segs i.part::after { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--p, 0%); border-radius: inherit; background: rgb(var(--c)); box-shadow: 0 0 calc(10 * var(--u)) rgba(var(--c), .5); transition: width .6s var(--soft); }
.prog { margin: auto 0 0; flex: none; height: max(5px, calc(7 * var(--u))); border-radius: 99px; background: rgba(255, 255, 255, .12); overflow: hidden; }
.prog i { display: block; height: 100%; width: var(--p, 0%); border-radius: inherit; background: linear-gradient(90deg, #64d2ff, rgb(var(--blue))); box-shadow: 0 0 12px rgba(var(--blue), .6); transition: width .8s var(--soft); }
.gbtns { display: flex; gap: calc(10 * var(--u)); margin-top: calc(16 * var(--u)); flex: none; }
/* cards with a subtitle line (climate, covers, own layers): a little tighter */
.gv.sub .gt { margin-top: calc(2 * var(--u)); }
.gv.sub .gs { margin-top: calc(1 * var(--u)); }
.gv.sub .segs { padding-top: calc(8 * var(--u)); }
.gv.sub .gbtns { margin-top: calc(12 * var(--u)); }
.gv.cv .gbtns { margin-top: auto; }
.gv.cv .prog:not([hidden]) + .gbtns { margin-top: calc(16 * var(--u)); }
.gbtn { flex: 1; min-width: 0; height: max(34px, calc(56 * var(--u))); border-radius: max(12px, calc(18 * var(--u))); display: flex; align-items: center; justify-content: center; gap: 7px;
  font-weight: 600; font-size: max(13.5px, calc(18 * var(--u))); letter-spacing: -.015em; white-space: nowrap;
  transition: transform .3s var(--snap), background .3s ease, opacity .3s ease, filter .2s; }
.gbtn > span { overflow: hidden; text-overflow: ellipsis; }
.gbtn .ic { font-size: 1.12em; }
.gbtn .ic.sm { font-size: .9em; opacity: .7; margin-left: -2px; }
.gbtn.glass { background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), inset 0 1px 0 rgba(255, 255, 255, .06); color: var(--t1); }
.gbtn.glass:hover { background: rgba(255, 255, 255, .15); }
.gbtn.white { background: linear-gradient(180deg, #fff, #ebebef); color: #0c0c0e; box-shadow: 0 4px 14px rgba(0, 0, 0, .2); }
.gbtn.blue { background: linear-gradient(180deg, #2b95ff, rgb(var(--blue))); color: #fff; box-shadow: 0 6px 18px rgba(var(--blue), .35); }
.gbtn.white .ic, .gbtn.blue .ic { --ip: currentColor; }
.gbtn:hover { filter: brightness(1.06); }
.gbtn:active { transform: scale(.96); }
.gbtn:disabled { opacity: .38; cursor: default; filter: none; transform: none; }
.gbtn.open { background: rgba(255, 255, 255, .2); }

/* Vacuum: room selection + robot */
.room.sel { background: linear-gradient(165deg, rgba(var(--blue), .3), rgba(var(--blue), .13)), rgba(16, 16, 20, .42); }
.root .room.sel::after, .root .room.lit.sel::after { box-shadow: inset 0 0 0 1.5px rgba(80, 160, 255, .95), inset 0 0 calc(24 * var(--u)) rgba(var(--blue), .2); }
.room.sel .badge { transform: scale(1); }
.room.sel .fu { background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(170, 205, 255, .3); }
.root .room.cur::after, .root .room.lit.cur::after { animation: curpulse 2.2s ease-in-out infinite; }
@keyframes curpulse { 0%, 100% { box-shadow: inset 0 0 0 1.5px rgba(80, 160, 255, .95), inset 0 0 calc(30 * var(--u)) rgba(var(--blue), .28); } 50% { box-shadow: inset 0 0 0 1.5px rgba(80, 160, 255, .45), inset 0 0 calc(12 * var(--u)) rgba(var(--blue), .1); } }
.room.cur { background: linear-gradient(165deg, rgba(var(--blue), .22), rgba(var(--blue), .08)), rgba(16, 16, 20, .42); }
.root[data-type="vacuum"] .room.busy { cursor: default; }
.root:not([data-type="vacuum"]) .trail { opacity: 0; }

.trail { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; transition: opacity 1.6s ease; }
.trail.fade { opacity: 0; }
.trail polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.trail .t1 { stroke: rgba(10, 132, 255, .18); }
.trail .t2 { stroke: rgba(120, 190, 255, .55); }
.bot { position: absolute; z-index: 5; --bs: max(20px, calc(34 * var(--u))); width: var(--bs); height: var(--bs); margin: calc(var(--bs) / -2) 0 0 calc(var(--bs) / -2);
  border-radius: 50%; pointer-events: none; opacity: 0; transform: scale(.6); transition: opacity .45s ease, transform var(--sp-ms) var(--sp); }
.bot.show { opacity: 1; transform: scale(1); }
.bot .bd { position: absolute; inset: 0; border-radius: 50%; transform: rotate(var(--rot, 0deg));
  background: radial-gradient(circle at 50% 30%, #fbfbfd, #cfd2da 72%, #b4b8c2);
  box-shadow: 0 3px 10px rgba(0, 0, 0, .5), inset 0 0 0 1px rgba(255, 255, 255, .7), inset 0 -2px 4px rgba(0, 0, 0, .15); }
.bot .bd::before { content: ''; position: absolute; left: 50%; top: 16%; width: 36%; height: 36%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle at 50% 40%, #4a4f5a, #22252c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .3); }
.bot .bd::after { content: ''; position: absolute; left: 50%; top: 4%; width: 18%; height: 7%; transform: translateX(-50%); border-radius: 9px; background: rgba(var(--blue), .9); }
.bot .bp { position: absolute; inset: -40%; border-radius: 50%; border: 2px solid rgba(var(--pc, 10, 132, 255), .7); opacity: 0; }
.bot.moving .bp { animation: botpulse 2s ease-out infinite; }
.bot.charging .bp { --pc: 48, 209, 88; animation: botpulse 2.6s ease-out infinite; }
/* invisible robot: no pulse in the background */
.bot:not(.show) .bp { animation: none; }
@keyframes botpulse { 0% { transform: scale(.45); opacity: .9; } 100% { transform: scale(1.15); opacity: 0; } }
.dockm { position: absolute; z-index: 4; --ds: max(22px, calc(36 * var(--u))); width: var(--ds); height: calc(var(--ds) * .8); margin: calc(var(--ds) * -.4) 0 0 calc(var(--ds) / -2);
  border-radius: calc(var(--ds) * .22); pointer-events: none; opacity: 0; transition: opacity .45s ease;
  background: linear-gradient(165deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .05)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16); }
.root[data-type="vacuum"] .dockm { opacity: 1; }

/* ---------------------------------------------------------------- Info tiles (same scale as the plan) */
.card { position: absolute; z-index: 7; min-width: 0; display: flex; flex-direction: column; overflow: hidden;
  border-radius: calc(22 * var(--u)); padding: calc(17 * var(--u)) calc(19 * var(--u)) calc(16 * var(--u));
  background: linear-gradient(160deg, rgba(46, 46, 54, .58), rgba(22, 23, 28, .64));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .095), inset 0 1px 0 rgba(255, 255, 255, .07), 0 calc(14 * var(--u)) calc(36 * var(--u)) rgba(0, 0, 0, .26);
  -webkit-backdrop-filter: blur(30px) saturate(160%); backdrop-filter: blur(30px) saturate(160%); transition: transform .4s var(--snap), box-shadow .3s ease, background .3s ease; }
.card { container-type: inline-size; }
.card.tap { cursor: pointer; }
/* narrow tiles (small plans, phones): less text */
@container (max-width: 84px) {
  .dslot .slide .tx { opacity: 0 !important; }
}
@container (max-width: 112px) {
  .k .when { display: none; }
  .dslot .slide .tx { font-size: 11px !important; letter-spacing: -.02em; padding-left: calc(var(--sh) - 10px) !important; }
}
.card.tap:hover { background: linear-gradient(160deg, rgba(56, 56, 64, .62), rgba(28, 29, 35, .68)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16), inset 0 1px 0 rgba(255, 255, 255, .09), 0 calc(16 * var(--u)) calc(40 * var(--u)) rgba(0, 0, 0, .3); }
.card.tap.pressed { transform: scale(.975); transition-duration: .12s; }
.card .k { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: max(12px, calc(14.5 * var(--u))); font-weight: 500; color: var(--t2); white-space: nowrap; }
.card .k .ic { font-size: max(16px, calc(21 * var(--u))); stroke-width: 1.8; }
.card .bot-row { margin-top: auto; min-width: 0; }
.card .v { font-size: max(22px, calc(31 * var(--u))); font-weight: 700; letter-spacing: -.03em; line-height: 1.08; font-variant-numeric: tabular-nums; white-space: nowrap; }
.card .s { margin-top: calc(4 * var(--u)); font-size: max(11.5px, calc(14.5 * var(--u))); font-weight: 500; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }
.card.dr .when { font-size: max(11px, calc(13 * var(--u))); color: var(--t3); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
.batring { position: relative; flex: none; width: 42px; height: 42px; }
.batring svg:not(.ic) { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.batring svg:not(.ic) circle { fill: none; stroke-width: 3.4; stroke-linecap: round; }
.batring .tk { stroke: rgba(255, 255, 255, .12); }
.batring .vl { stroke: rgba(235, 238, 245, .85); transition: stroke-dasharray .8s var(--soft); }
.batring > .ic { position: absolute; inset: 0; margin: auto; width: 42%; height: 42%; }
.art { flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; font-size: 22px;
  background: rgba(255, 255, 255, .08) center / cover no-repeat; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
.cbtn { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: var(--t1);
  background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); transition: transform .3s var(--snap), background .2s, color .2s; }
.cbtn:hover { background: rgba(255, 255, 255, .16); }
.cbtn:active { transform: scale(.9); }
.cbtn:disabled { opacity: .35; cursor: default; }
.cbtn.lg { width: 46px; height: 46px; font-size: 20px; }
.cbtn.on { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .3), 0 0 14px rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .18); }

/* tiles + layer card that did not fit into the plan: a column next to it, at a readable size */
.side { position: absolute; z-index: 7; display: flex; flex-direction: column; gap: max(10px, calc(13 * var(--su, .7px))); --u: var(--su, .7px); }
.side .card { position: relative; flex: 1 1 0; min-height: 0; max-height: calc(150 * var(--u)); }
.side .card.dr { flex-grow: 1.18; max-height: calc(176 * var(--u)); }
.side .gcard { position: relative; flex: none; height: calc(218 * var(--u)); margin-top: auto; }

/* Empty plan */
.empty-plan { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; z-index: 2; }
.empty-plan > div { max-width: 420px; padding: 30px 32px; border-radius: 28px; background: linear-gradient(160deg, rgba(46, 46, 54, .58), rgba(22, 23, 28, .64));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 22px 50px rgba(0, 0, 0, .34); }
.empty-plan .ic { font-size: 44px; margin: 0 auto 14px; stroke-width: 1.4; }
.empty-plan b { display: block; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
.empty-plan p { margin: 8px 0 0; color: var(--t2); font-size: 14px; line-height: 1.45; }

/* ---------------------------------------------------------------- Pop-up */
/* shown/hidden via display (inherited visibility is not always recomputed in Chrome after cancelled animations) */
.pop-wrap { position: fixed; z-index: 50; left: 0; top: 0; width: 0; height: 0; pointer-events: none; display: none; }
.pop-wrap.vis { display: block; }
.pop-wrap.open { pointer-events: auto; }
/* backdrop: softly blurred and a little darker – no grain, so nothing looks pixelated */
.scrim { position: absolute; inset: 0; background: rgba(10, 11, 15, .18);
  -webkit-backdrop-filter: blur(22px) saturate(140%) brightness(.78); backdrop-filter: blur(22px) saturate(140%) brightness(.78); }
/* glass shell: clear and tinted, light edge top left, reflection on the top edge */
.pshell { position: absolute; left: 0; top: 0; width: 0; height: 0; border-radius: 32px; overflow: hidden; pointer-events: none; contain: layout style;
  background: linear-gradient(165deg, rgba(255, 255, 255, .13), rgba(255, 255, 255, .045) 36%, rgba(255, 255, 255, .02) 68%, rgba(255, 255, 255, .055)), rgba(26, 26, 32, .4);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), inset 0 -1px 0 rgba(255, 255, 255, .06), inset 0 0 28px rgba(255, 255, 255, .04),
    0 40px 120px rgba(0, 0, 0, .5), 0 12px 34px rgba(0, 0, 0, .28);
  -webkit-backdrop-filter: blur(34px) saturate(210%) brightness(1.06); backdrop-filter: blur(34px) saturate(210%) brightness(1.06); }
.pshell::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.2px; pointer-events: none;
  background: linear-gradient(145deg, rgba(255, 255, 255, .62), rgba(255, 255, 255, .16) 26%, rgba(255, 255, 255, .05) 52%, rgba(255, 255, 255, .1) 78%, rgba(255, 255, 255, .32));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.pshell::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 60%; border-radius: inherit; pointer-events: none;
  background: radial-gradient(85% 75% at 22% 0%, rgba(255, 255, 255, .1), rgba(255, 255, 255, .03) 45%, rgba(255, 255, 255, 0) 72%); }
.pop:focus { outline: none; }
.pop { position: absolute; left: 0; top: 0; width: min(620px, calc(100% - 48px)); overflow: auto; overscroll-behavior: contain; border-radius: 32px;
  padding: 26px 28px 26px; scrollbar-width: none; transform-origin: 50% 50%; }
.pop::-webkit-scrollbar { display: none; }
.pop.wide { width: min(920px, calc(100% - 48px)); }
.pop.narrow { width: min(440px, calc(100% - 48px)); }
.pop.wxp { width: min(880px, calc(100% - 48px)); }
.ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ph h2 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; }
.ph p { margin: 5px 0 0; font-size: 14.5px; color: var(--t2); font-weight: 500; }
.x { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: var(--t2);
  background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); transition: background .2s, color .2s, transform .3s var(--snap); }
.x:hover { background: rgba(255, 255, 255, .17); color: var(--t1); }
.x:active { transform: scale(.9); }
.wgrid { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); gap: 34px; margin-top: 20px; }
.wbig { display: flex; align-items: center; gap: 16px; }
.wbig .wi .ic { font-size: 58px; stroke-width: 1.5; }
.wbig b { font-size: 78px; font-weight: 200; letter-spacing: -.045em; line-height: .95; font-variant-numeric: tabular-nums; }
.whl { margin-top: 8px; font-size: 15px; font-weight: 500; color: var(--t2); }
.wstats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 22px; }
.wstats div { display: grid; grid-template-columns: auto 1fr; column-gap: 11px; align-items: center; padding: 12px 14px; border-radius: 16px;
  background: rgba(255, 255, 255, .055); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.wstats .ic { grid-row: span 2; font-size: 21px; }
.wstats span { font-size: 12px; color: var(--t2); font-weight: 500; }
.wstats b { font-size: 15.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.days { display: flex; flex-direction: column; }
.day { display: grid; grid-template-columns: 52px 40px 34px minmax(0, 1fr) 34px; align-items: center; gap: 12px; height: 41px; font-size: 15px; font-weight: 500;
  border-top: 1px solid rgba(255, 255, 255, .07); font-variant-numeric: tabular-nums; }
.day:first-child { border-top: 0; }
.day .dn { font-weight: 600; }
.day .di { display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 21px; line-height: 1; }
.day .di small { margin-top: 2px; font-size: 10.5px; font-weight: 600; color: var(--t2); }
.day .lo { text-align: right; color: var(--t2); }
.day .bar { position: relative; height: 6px; border-radius: 99px; background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 .5px rgba(255, 255, 255, .05); }
.day .bar i { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, rgba(225, 230, 240, .55), rgba(250, 251, 253, .95)); box-shadow: 0 0 8px rgba(255, 255, 255, .18); }
.day .bar .now { width: 10px; height: 10px; top: -2px; margin-left: -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2.5px rgba(40, 40, 46, .95); }
.whrs { margin-top: 2px; }
.wnow { min-width: 0; }
.wnow .sec { margin-top: 22px; }
.hrs { display: flex; gap: 0; overflow-x: auto; scrollbar-width: none; padding: 2px 0 4px; margin: 0 -6px;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 34px), transparent); }
.hrs::-webkit-scrollbar { display: none; }
.hrs div { flex: none; width: 60px; display: flex; flex-direction: column; align-items: center; gap: 7px; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.hrs span { font-size: 13px; font-weight: 500; color: var(--t2); }
.hrs div:first-child span { color: var(--t1); font-weight: 600; }
.hrs .ic { font-size: 25px; stroke-width: 1.6; }
.hrs small { height: 12px; margin-top: -4px; font-size: 10.5px; font-weight: 600; color: var(--t2); }
.pcols { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 30px; margin-top: 22px; }
.pcol { min-width: 0; }
.pfull { margin-top: 22px; }
.sec { margin: 24px 0 12px; font-size: 12.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--t3); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.pv > .sec.first { margin-top: 0; }

.tiles { display: flex; flex-wrap: wrap; gap: 14px; }
.tile { flex: 1 1 0; min-width: 78px; max-width: 116px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.tile .tb { position: relative; width: 100%; height: 164px; border-radius: 26px; overflow: hidden; cursor: pointer; touch-action: none;
  background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .06);
  transition: transform .35s var(--snap), box-shadow .3s; }
.tile .tb:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), inset 0 1px 0 rgba(255, 255, 255, .08); }
.tile .tb.pressed { transform: scale(.96); }
/* hold → device page: the tile slowly presses in until the device opens */
.tile .tb.pressed:not(.drag) { transform: scale(.93); transition: transform .52s cubic-bezier(.3, .7, .4, 1), box-shadow .3s; }
.hold { border-radius: 14px; transition: transform .52s cubic-bezier(.3, .7, .4, 1), background .3s; }
.hold.holding { transform: scale(.97); background: rgba(255, 255, 255, .05); }
.drow.hold.holding, .nk.hold.holding { background: none; }
.tile .tb.drag { transform: scale(1.03); }
.tile .fill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--v, 0%); background: linear-gradient(0deg, rgb(var(--c)), rgb(var(--cl)));
  box-shadow: 0 -1px 0 rgba(255, 255, 255, .35) inset; transition: height .5s var(--soft); }
.tile .tb.drag .fill { transition: none; }
.tile .tb > .ic, .tile .tb > ha-icon, .tile .tb > ha-state-icon { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); font-size: 27px; --mdc-icon-size: 27px; transition: color .25s; }
.tile .tb.on:not(.lo) > .ic { --ip: currentColor; color: rgba(44, 30, 2, .85); }
.tile .tb.on.dk:not(.lo) > .ic { color: #fff; }
.tile .tb.on:not(.lo) > ha-icon, .tile .tb.on:not(.lo) > ha-state-icon { color: rgba(44, 30, 2, .85); }
.tile .tn { margin-top: 10px; font-size: 13.5px; font-weight: 600; line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile .tv { margin-top: 2px; font-size: 12.5px; color: var(--t2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tile.na { opacity: .45; }
.tile.grp .tb { background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16); }
.tiles .tdiv { flex: none; width: 1px; align-self: stretch; margin: 8px 2px 34px; background: rgba(255, 255, 255, .1); }
/* cover tiles: the shutter comes down from the top */
.tile.cov .fill { top: 0; bottom: auto; height: calc(100% - var(--v, 0%)); background: repeating-linear-gradient(180deg, rgba(210, 216, 228, .5) 0 9px, rgba(150, 156, 170, .5) 9px 10px);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .45), 0 4px 12px rgba(0, 0, 0, .25); transition: height .6s var(--soft); }
.tile.cov .tb { background: linear-gradient(180deg, rgba(190, 215, 255, .26), rgba(120, 160, 230, .12)); }
.tile.cov .tb > .ic { --ip: currentColor; color: rgba(245, 247, 255, .92); }
.tile.cov .tb.lo > .ic { --ip: url(#gfcg); }
.pop.one .tiles { justify-content: center; }
.pop.one .tile { max-width: 128px; }
.pop.one .tile .tb { height: 196px; border-radius: 30px; }
.pop.one .tile .tb > .ic { font-size: 32px; bottom: 20px; }

.crow { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.sws { display: flex; gap: 9px; flex-wrap: wrap; }
.sw { width: 28px; height: 28px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25), 0 2px 8px rgba(0, 0, 0, .3); transition: transform .3s var(--snap); }
.sw:hover { transform: scale(1.12); }
.sw:active { transform: scale(.92); }
.ks { position: relative; flex: 1; min-width: 180px; height: 34px; border-radius: 999px; cursor: pointer; touch-action: none;
  background: linear-gradient(90deg, rgb(255, 160, 60), rgb(255, 205, 135) 35%, rgb(255, 240, 222) 62%, rgb(214, 228, 255));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2), inset 0 1px 3px rgba(0, 0, 0, .2); }
.ks .kn { position: absolute; top: 50%; left: var(--v, 50%); width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .35), inset 0 0 0 1px rgba(0, 0, 0, .06); transition: left .35s var(--soft); }
.ks.drag .kn { transition: none; transform: scale(1.08); }
.hs { position: relative; height: 34px; border-radius: 999px; overflow: hidden; cursor: pointer; touch-action: none; background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
.hs .fl { position: absolute; inset: 0 auto 0 0; width: var(--v, 0%); background: rgba(255, 255, 255, .88); transition: width .35s var(--soft); }
.hs.drag .fl { transition: none; }
.hs .ic { --ip: currentColor; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 16px; color: rgba(20, 20, 24, .75); }

.np { display: flex; align-items: center; gap: 14px; }
.np .art { width: 60px; height: 60px; border-radius: 15px; font-size: 26px; }
.np .t1 { font-size: 16px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np .t2 { margin-top: 2px; font-size: 13.5px; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np > div:not(.art) { min-width: 0; flex: 1; }
.ctrls { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 16px 0 14px; }
.lgrow { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 12px 12px 14px; border-radius: 18px; background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.lgrow > .ic { font-size: 22px; }
.lgrow > div { flex: 1; min-width: 0; }
.lgrow b { display: block; font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgrow span { display: block; font-size: 13px; color: var(--t2); margin-top: 1px; }
.media + .media { margin-top: 22px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, .07); }
.media > .lgrow { margin-top: 0; }
.media:not(.compact) > .lgrow, .media.compact > :not(.lgrow) { display: none; }
.media.compact + .media, .media + .media.compact { margin-top: 12px; padding-top: 0; border-top: 0; }

.dwrap { display: flex; flex-direction: column; gap: 12px; }
.slide { --sh: 56px; --p: 0; position: relative; height: var(--sh); border-radius: 999px; overflow: hidden; touch-action: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .1)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), inset 0 1px 2px rgba(0, 0, 0, .25);
  transition: background .4s ease, box-shadow .4s ease; }
.slide::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--x, 0px) + var(--sh)); border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, .04), rgba(255, 255, 255, .14)); opacity: calc(var(--p) * 1.4); transition: width .5s var(--sp), opacity .3s; }
.slide.drag::before { transition: none; }
.slide .tx { position: absolute; inset: 0; display: grid; place-items: center; padding-left: calc(var(--sh) * .7); font-size: 15px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap;
  background: linear-gradient(90deg, rgba(235, 235, 245, .42) 0%, rgba(255, 255, 255, .95) 50%, rgba(235, 235, 245, .42) 100%) 0 0 / 240% 100%;
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 2.8s linear infinite;
  opacity: calc(1 - var(--p) * .9); transition: opacity .2s; }
@keyframes shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
.slide .kb { position: absolute; left: 4px; top: 4px; width: calc(var(--sh) - 8px); height: calc(var(--sh) - 8px); border-radius: 50%; display: grid; place-items: center;
  font-size: calc(var(--sh) * .4); color: #1c1c1e; cursor: grab; background: linear-gradient(180deg, #ffffff, #dcdee4);
  box-shadow: 0 3px 10px rgba(0, 0, 0, .35), inset 0 -1px 0 rgba(0, 0, 0, .08), inset 0 1px 0 #fff; transform: translateX(var(--x, 0px)); transition: transform .55s var(--sp), background .4s ease; }
.slide .kb .ic { --ip: currentColor; stroke-width: 2.2; }
.slide.drag .kb { transition: none; cursor: grabbing; }
.slide.done .tx { animation: none; -webkit-text-fill-color: rgba(255, 255, 255, .92); opacity: 1; padding-left: 0; padding-right: calc(var(--sh) * .7); }
.slide.ok { background: linear-gradient(180deg, rgba(var(--green), .26), rgba(var(--green), .18)); box-shadow: inset 0 0 0 1px rgba(var(--green), .45); }
.slide.ok .kb { background: linear-gradient(180deg, #5de68b, rgb(var(--green))); color: #fff; }
.card .dslot { margin: auto calc(-10 * var(--u)) calc(-6 * var(--u)); }
.card .slide { --sh: max(36px, calc(48 * var(--u))); }
.card .slide .tx { font-size: max(11.5px, calc(14 * var(--u))); padding-left: calc(var(--sh) - 8px); }
.muted { font-size: 13.5px; color: var(--t2); }
/* front door: doorbell + opened as info rows */
.dinfo { display: flex; flex-direction: column; gap: 2px; }
.drow { display: flex; align-items: center; gap: 10px; min-height: 30px; font-size: 14px; font-weight: 500; }
.drow .ic { font-size: 18px; flex: none; }
.drow span { flex: 1; min-width: 0; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drow b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.drow.new b { color: rgb(var(--orange)); }
/* helper sliders (input_number) */
.nrows { display: flex; flex-direction: column; gap: 14px; }
.nrow .nk { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 7px; font-size: 14px; font-weight: 500; color: var(--t2); }
.nrow .nk b { color: var(--t1); font-weight: 600; font-variant-numeric: tabular-nums; }
.nrow .hs { --c: 248, 216, 134; --cl: 252, 240, 210; }
.nrow .hs .fl { background: linear-gradient(90deg, rgb(var(--c)), rgb(var(--cl))); box-shadow: inset -1px 0 0 rgba(255, 255, 255, .5); }
.nrow .hs.drag { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2); }
.nrow.na { opacity: .45; pointer-events: none; }
/* sensor / device rows */
.srows { display: flex; flex-direction: column; gap: 8px; }
.srow { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 9px 12px 9px 14px; border-radius: 18px; background: rgba(255, 255, 255, .055); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.srow > .ic, .srow > ha-icon, .srow > ha-state-icon { font-size: 21px; --mdc-icon-size: 21px; flex: none; }
.srow > div { flex: 1; min-width: 0; }
.srow b { display: block; font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srow span { display: block; margin-top: 1px; font-size: 13px; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srow .sv { flex: none; font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.srow.on .sv { color: rgb(var(--orange)); }
.srow.na { opacity: .5; }
.tgl { position: relative; flex: none; width: 51px; height: 31px; border-radius: 99px; background: rgba(120, 120, 128, .32); transition: background .3s ease; }
.tgl::after { content: ''; position: absolute; left: 2px; top: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0, 0, 0, .25); transition: transform .35s var(--snap); }
.tgl.on { background: rgb(var(--green)); }
.tgl.on::after { transform: translateX(20px); }

.vrow { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 20px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.vrow .batring { width: 60px; height: 60px; }
.vrow b { display: block; font-size: 17px; font-weight: 650; }
.vrow span { display: block; margin-top: 2px; font-size: 13.5px; color: var(--t2); }
.empty { display: flex; align-items: center; gap: 12px; margin-top: 22px; padding: 16px 18px; border-radius: 18px; background: rgba(255, 255, 255, .05); color: var(--t2); font-size: 14px; }
.empty .ic { font-size: 22px; flex: none; }
.pf { display: flex; gap: 10px; margin-top: 26px; }
.pbtn { flex: 1; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; font-size: 15px;
  background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .06); transition: transform .3s var(--snap), background .2s, opacity .3s; }
.pbtn:hover { background: rgba(255, 255, 255, .15); }
.pbtn:active { transform: scale(.97); }
.pbtn:disabled { opacity: .38; cursor: default; }
.pbtn .ic { font-size: 18px; }

/* Thermostat: arc dial (drag the knob or use − / +) */
.therm + .therm { margin-top: 22px; padding-top: 22px; border-top: 1px solid rgba(255, 255, 255, .07); }
.therm .tn2 { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; font-size: 15px; font-weight: 600; }
.therm .tn2 span { font-size: 13px; font-weight: 500; color: var(--t2); }
.dialw { display: flex; align-items: center; justify-content: center; gap: 16px; }
.dial { position: relative; width: 210px; height: 196px; flex: none; touch-action: none; cursor: pointer; }
.dial svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.dial .trk { fill: none; stroke: rgba(255, 255, 255, .1); stroke-width: 16; stroke-linecap: round; }
.dial .arc { fill: none; stroke: url(#gfcdial); stroke-width: 16; stroke-linecap: round; opacity: .95; transition: opacity .3s; }
.dial.off .arc { opacity: .18; }
.dial .kn2 { fill: #fff; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .45)); transition: r .2s; }
.dial.drag .kn2 { r: 13; }
.dial .cur { fill: rgba(255, 255, 255, .9); }
.dial .mid { position: absolute; left: 0; right: 0; top: 52px; text-align: center; pointer-events: none; }
.dial .mid small { display: block; font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--t2); }
.dial .mid b { display: block; margin-top: 2px; font-size: 48px; font-weight: 250; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.dial .mid b sup { font-size: .42em; font-weight: 400; vertical-align: .9em; margin-left: 1px; }
.dial .mid span { display: block; margin-top: 6px; font-size: 13px; color: var(--t2); font-variant-numeric: tabular-nums; }
.hvac { position: relative; display: flex; margin-top: 12px; padding: 3px; border-radius: 13px; background: rgba(0, 0, 0, .25); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05); }
.hvac button { position: relative; z-index: 1; flex: 1; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--t2); transition: color .25s; }
.hvac button .ic { font-size: 16px; }
.hvac button.act { color: var(--t1); }
.hvac button.act .ic { --ip: currentColor; }
.hvac .knob { position: absolute; z-index: 0; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 10px; background: rgba(255, 255, 255, .17);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .25), inset 0 0 0 1px rgba(255, 255, 255, .08); transform: translateX(calc(100% * var(--i, 0))); transition: transform var(--sp-ms) var(--sp); }
.hvac.none .knob { opacity: 0; }

/* ---------------------------------------------------------------- Menu */
.menu { position: absolute; z-index: 60; left: 0; top: 0; min-width: 250px; max-width: 320px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: 6px; border-radius: 18px;
  background: linear-gradient(160deg, rgba(62, 62, 70, .82), rgba(40, 40, 46, .86));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), inset 0 1px 0 rgba(255, 255, 255, .08), 0 26px 70px rgba(0, 0, 0, .55);
  -webkit-backdrop-filter: blur(40px) saturate(190%); backdrop-filter: blur(40px) saturate(190%);
  transform-origin: var(--ox, 50%) var(--oy, 100%); pointer-events: none; visibility: hidden; }
.menu.open { pointer-events: auto; visibility: visible; }
.mi { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 12px 9px 11px; border-radius: 12px; text-align: left; font-size: 14.5px; font-weight: 500; color: var(--t1); transition: background .15s; }
.mi:hover { background: rgba(255, 255, 255, .1); }
.mi:active { background: rgba(255, 255, 255, .16); }
.mi .mic { flex: none; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 18px;
  background: linear-gradient(160deg, rgba(255, 255, 255, .14), rgba(255, 255, 255, .06)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
.mi > span { flex: 1; min-width: 0; }
.mi small { display: block; margin-top: 1px; font-size: 12px; font-weight: 400; color: var(--t3); }
.mi .chk { flex: none; font-size: 16px; opacity: 0; stroke-width: 2.2; }
.mi .mic ha-icon { --mdc-icon-size: 1.05em; }
.mi.act .chk { opacity: 1; }
.mi.ph .mic { opacity: .7; }
.mh { padding: 10px 12px 6px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--t3); }
.msep { height: 1px; margin: 6px 10px; background: rgba(255, 255, 255, .1); }
.mseg { position: relative; display: flex; margin: 2px 6px 8px; padding: 3px; border-radius: 11px; background: rgba(0, 0, 0, .25); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05); }
.mseg button { position: relative; z-index: 1; flex: 1; height: 30px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--t2); transition: color .25s; white-space: nowrap; padding: 0 6px; }
.mseg button.act { color: var(--t1); }
.mseg .knob { position: absolute; z-index: 0; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 8px; background: rgba(255, 255, 255, .17);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .25), inset 0 0 0 1px rgba(255, 255, 255, .08); transform: translateX(calc(100% * var(--i, 0))); transition: transform var(--sp-ms) var(--sp); }
.mnote { padding: 8px 12px 6px; font-size: 12px; line-height: 1.4; color: var(--t3); }

/* ---------------------------------------------------------------- Toast */
.toast { position: fixed; left: 50%; bottom: 26px; z-index: 70; padding: 12px 20px; border-radius: 999px; font-size: 14px; font-weight: 600; white-space: nowrap;
  background: rgba(50, 50, 56, .82); -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 18px 44px rgba(0, 0, 0, .45);
  opacity: 0; transform: translate(-50%, 24px) scale(.96); transition: opacity .25s ease, transform .5s var(--sp); pointer-events: none; }
.toast.show { opacity: 1; transform: translate(-50%, 0) scale(1); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;
