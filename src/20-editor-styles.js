/* ================================================================== Floor plan editor: styles (same glass language as the card) */
const EDITOR_STYLES = `
dialog.ed { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #08090c; color: var(--t1); overflow: hidden; }
dialog.ed::backdrop { background: rgba(0, 0, 0, .6); }
dialog.ed[open] { display: block; }
.ew { position: absolute; inset: 0; display: grid; grid-template-columns: 84px minmax(0, 1fr) 340px; grid-template-rows: 60px minmax(0, 1fr); }
.ew .bg { z-index: 0; }

/* top bar */
.etop { grid-column: 1 / -1; position: relative; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 0 14px 0 18px;
  background: linear-gradient(180deg, rgba(30, 30, 36, .82), rgba(22, 22, 28, .7)); box-shadow: inset 0 -1px 0 rgba(255, 255, 255, .07);
  -webkit-backdrop-filter: blur(30px) saturate(160%); backdrop-filter: blur(30px) saturate(160%); }
.etop h1 { margin: 0 auto 0 6px; font-size: 17px; font-weight: 650; letter-spacing: -.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.etop h1 small { margin-left: 10px; font-size: 13px; font-weight: 500; color: var(--t3); }
.ebtn { height: 36px; padding: 0 14px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-size: 14px; font-weight: 600; white-space: nowrap;
  background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); color: var(--t1); transition: background .2s, transform .3s var(--snap), opacity .2s; }
.ebtn:hover { background: rgba(255, 255, 255, .15); }
.ebtn:active { transform: scale(.96); }
.ebtn:disabled { opacity: .35; cursor: default; transform: none; }
.ebtn .ic { font-size: 17px; }
.ebtn.icon { width: 36px; padding: 0; }
.ebtn.white { background: linear-gradient(180deg, #fff, #ebebef); color: #0c0c0e; box-shadow: 0 4px 14px rgba(0, 0, 0, .25); }
.ebtn.white .ic, .ebtn.blue .ic { --ip: currentColor; }
.ebtn.blue { background: linear-gradient(180deg, #2b95ff, rgb(var(--blue))); color: #fff; box-shadow: 0 6px 18px rgba(var(--blue), .3); }
.ebtn.red { color: rgb(255, 120, 110); }
.ebtn.sm { height: 30px; padding: 0 11px; font-size: 13px; border-radius: 9px; }
.ebtn.wide { width: 100%; }
.esep { width: 1px; height: 24px; background: rgba(255, 255, 255, .1); margin: 0 4px; }

/* tool rail */
.erail { position: relative; z-index: 4; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 0; overflow-y: auto; scrollbar-width: none;
  background: linear-gradient(90deg, rgba(24, 24, 30, .7), rgba(20, 20, 26, .5)); box-shadow: inset -1px 0 0 rgba(255, 255, 255, .06); }
.erail button { width: 68px; min-height: 58px; padding: 7px 2px 6px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: rgba(235, 235, 245, .75); transition: background .2s, color .2s, transform .3s var(--snap); }
.erail button .ic { font-size: 23px; }
.erail button span { font-size: 10.5px; font-weight: 600; letter-spacing: -.005em; line-height: 1.1; text-align: center; }
.erail button:hover { background: rgba(255, 255, 255, .07); color: var(--t1); }
.erail button:active { transform: scale(.94); }
.erail button.act { background: linear-gradient(180deg, #fff, #ececf0); color: #0c0c0e; box-shadow: 0 4px 14px rgba(0, 0, 0, .3); }
.erail button.act .ic { --ip: currentColor; }
.erail .rsep { width: 40px; height: 1px; margin: 6px 0; background: rgba(255, 255, 255, .08); flex: none; }

/* canvas */
.ecv { position: relative; z-index: 1; overflow: hidden; touch-action: none; cursor: default; background: radial-gradient(80% 70% at 30% 10%, rgba(46, 64, 120, .18), rgba(30, 40, 80, 0) 70%); }
.ecv.pan, .ecv.panning { cursor: grab; }
.ecv.panning { cursor: grabbing; }
.ecv.draw { cursor: crosshair; }
.ecv .grid { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, rgba(255, 255, 255, .1) .9px, rgba(255, 255, 255, 0) 1.3px); }
.ecv .ul { position: absolute; pointer-events: none; transform-origin: 0 0; user-select: none; -webkit-user-drag: none; }
.world { position: absolute; inset: 0; pointer-events: none; }
.world > * { pointer-events: auto; }
.eroom { position: absolute; border-radius: 10px; overflow: hidden;
  background: linear-gradient(165deg, rgba(255, 255, 255, .07), rgba(255, 255, 255, .025)), rgba(22, 22, 28, .55);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16), 0 6px 18px rgba(0, 0, 0, .2); }
.ul-on .eroom { background: rgba(30, 32, 40, .38); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .55); }
.eroom .en { position: absolute; left: 9px; top: 7px; right: 6px; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; text-shadow: 0 1px 6px rgba(0, 0, 0, .5); }
.eroom .en small { display: block; margin-top: 1px; font-size: 11px; font-weight: 500; color: var(--t2); }
.eroom.lb .en { top: auto; bottom: 7px; }
.eroom.hot { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9), 0 0 0 4px rgba(var(--blue), .18); }
.eroom.dim { opacity: .55; }
.efu { position: absolute; border-radius: calc(var(--fr, 8) * 1px); background: linear-gradient(165deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .04)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .17); }
.efu.c { border-radius: 50%; }
.efu.rug { background: rgba(255, 255, 255, .03); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
.efu.tv { background: linear-gradient(180deg, rgba(190, 210, 255, .3), rgba(120, 160, 255, .2)); }
.efu .fic { position: absolute; inset: 0; display: grid; place-items: center; font-size: min(22px, 70%); opacity: .55; pointer-events: none; }
.tool-furniture .efu:hover, .tool-furniture .efu.sel { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); }
.tool-furniture .efu { cursor: move; }
.eopen { position: absolute; border-radius: 4px; cursor: pointer; }
.eopen.win { background: rgb(205, 222, 248); box-shadow: 0 0 8px rgba(200, 220, 255, .55); }
.eopen.pas { background: rgba(255, 255, 255, .5); box-shadow: 0 0 0 1px rgba(255, 255, 255, .3); }
.eopen.ent { background: #fff; box-shadow: 0 0 10px rgba(255, 255, 255, .7); }
.eopen.ghost { opacity: .55; pointer-events: none; }
.eopen.sel { box-shadow: 0 0 0 2px rgb(var(--blue)), 0 0 12px rgba(var(--blue), .6); }
.emk { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; display: grid; place-items: center; cursor: grab; touch-action: none;
  background: rgba(255, 255, 255, .14); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25), 0 4px 12px rgba(0, 0, 0, .35); transition: transform .25s var(--snap), opacity .2s; }
.emk .ic { font-size: 18px; pointer-events: none; }
.emk.light { background: radial-gradient(circle at 50% 28%, rgb(252, 236, 196), rgb(246, 200, 89) 72%); }
.emk.light .ic { --ip: currentColor; color: rgba(44, 30, 2, .9); }
.emk.cover { background: radial-gradient(circle at 50% 28%, #fff, rgb(206, 226, 255) 72%); }
.emk.cover .ic, .emk.climate .ic, .emk.dock .ic, .emk.door .ic { --ip: currentColor; color: rgba(10, 24, 60, .85); }
.emk.climate { background: radial-gradient(circle at 50% 28%, rgb(255, 214, 170), rgb(255, 150, 62) 72%); }
.emk.dock { background: radial-gradient(circle at 50% 28%, #fff, #c8ccd6 72%); border-radius: 30%; }
.emk.door { background: radial-gradient(circle at 50% 28%, #e8ffe9, rgb(48, 209, 88) 75%); }
.emk.media { background: radial-gradient(circle at 50% 28%, rgb(220, 232, 255), rgb(150, 185, 255) 72%); }
.emk.media .ic { --ip: currentColor; color: rgba(10, 24, 60, .85); }
.emk.other { background: rgba(255, 255, 255, .2); }
.emk.off { opacity: .28; transform: scale(.82); }
.emk:hover { transform: scale(1.1); }
.emk.sel { box-shadow: 0 0 0 3px rgb(var(--blue)), 0 0 0 7px rgba(var(--blue), .25), 0 6px 16px rgba(0, 0, 0, .45); }
.emk.drag { cursor: grabbing; transform: scale(1.15); }
.emk.warn::after { content: '!'; position: absolute; right: -4px; top: -4px; width: 15px; height: 15px; border-radius: 50%; background: rgb(var(--orange)); color: #1a0e00; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.ewid { position: absolute; border-radius: 14px; display: grid; place-items: center; text-align: center; font-size: 12px; font-weight: 600; color: var(--t2); cursor: move;
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .05) 0 8px, rgba(255, 255, 255, .02) 8px 16px); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .22); }
.ewid .ic { font-size: 20px; margin: 0 auto 3px; }
.ewid.sel { box-shadow: inset 0 0 0 2px rgb(var(--blue)); color: var(--t1); }
.ewid.auto { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .14); }
.ehd { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgb(var(--blue)), 0 2px 6px rgba(0, 0, 0, .4); z-index: 20; touch-action: none; }
.ehd.e, .ehd.w { cursor: ew-resize; } .ehd.n, .ehd.s { cursor: ns-resize; } .ehd.nw, .ehd.se { cursor: nwse-resize; } .ehd.ne, .ehd.sw { cursor: nesw-resize; }
.esel { position: absolute; pointer-events: none; border-radius: 10px; box-shadow: 0 0 0 2px rgb(var(--blue)), 0 0 0 6px rgba(var(--blue), .18); z-index: 19; }
.eguide { position: absolute; pointer-events: none; background: rgba(255, 70, 200, .85); z-index: 18; }
.eguide.v { width: 1px; top: 0; bottom: 0; } .eguide.h { height: 1px; left: 0; right: 0; }
.edraw { position: absolute; pointer-events: none; border-radius: 10px; background: rgba(var(--blue), .14); box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); z-index: 17; }
.edim { position: absolute; z-index: 21; pointer-events: none; padding: 3px 8px; border-radius: 7px; font-size: 11.5px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap;
  background: rgba(var(--blue), .92); color: #fff; transform: translate(-50%, -130%); }
.emeas { position: absolute; z-index: 21; pointer-events: none; }
.emeas i { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: rgb(255, 70, 200); box-shadow: 0 0 0 2px #fff; }
.ezoom { position: absolute; right: 14px; bottom: 14px; z-index: 6; display: flex; gap: 4px; padding: 4px; border-radius: 14px;
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 10px 28px rgba(0, 0, 0, .4); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.ezoom button { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
.ezoom button:hover { background: rgba(255, 255, 255, .1); }
.ehint { position: absolute; left: 50%; bottom: 16px; z-index: 6; transform: translateX(-50%); max-width: min(560px, calc(100% - 140px)); padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 500; color: var(--t2);
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); text-align: center; pointer-events: none; transition: opacity .3s; }
.ehint:empty { opacity: 0; }

/* floating toolbar next to the selected furniture */
.efloat { position: absolute; z-index: 25; display: flex; align-items: center; gap: 2px; padding: 4px 4px 4px 12px; border-radius: 14px; white-space: nowrap;
  background: rgba(36, 36, 42, .86); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 12px 30px rgba(0, 0, 0, .45); -webkit-backdrop-filter: blur(24px) saturate(170%); backdrop-filter: blur(24px) saturate(170%); }
.efloat span { font-size: 12px; font-weight: 600; color: var(--t2); margin-right: 6px; font-variant-numeric: tabular-nums; }
.efloat button { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
.efloat button:hover { background: rgba(255, 255, 255, .12); }
.efloat button[data-act="del"] .ic { --ip: rgb(255, 120, 110); }
.ecv:focus { outline: none; }

/* inspector */
.eins { position: relative; z-index: 4; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding: 18px 18px 30px;
  background: linear-gradient(270deg, rgba(24, 24, 30, .78), rgba(20, 20, 26, .6)); box-shadow: inset 1px 0 0 rgba(255, 255, 255, .06); }
.eins h2 { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
.eins h3 { margin: 22px 0 9px; font-size: 11.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t3); display: flex; align-items: center; justify-content: space-between; }
.eins p.lead { margin: 0 0 14px; font-size: 13.5px; line-height: 1.45; color: var(--t2); }
.eins p.small { margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--t3); }
.efield { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.efield > label { font-size: 12.5px; font-weight: 600; color: var(--t2); }
.efield.row { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
.einp, .esel2 { width: 100%; height: 38px; padding: 0 12px; border-radius: 11px; border: 0; outline: none; font: inherit; font-size: 14px; color: var(--t1);
  background: rgba(255, 255, 255, .08); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); transition: box-shadow .2s, background .2s; -webkit-user-select: text; user-select: text; }
.einp:focus, .esel2:focus { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); background: rgba(255, 255, 255, .1); }
.einp.num { width: 92px; text-align: right; font-variant-numeric: tabular-nums; }
.esel2 { appearance: none; -webkit-appearance: none; padding-right: 30px; background-image: linear-gradient(45deg, transparent 50%, rgba(235, 235, 245, .6) 50%), linear-gradient(135deg, rgba(235, 235, 245, .6) 50%, transparent 50%);
  background-position: calc(100% - 17px) 17px, calc(100% - 12px) 17px; background-size: 5px 5px; background-repeat: no-repeat; }
.esel2 option { background: #26262c; color: #f5f5f7; }
.eseg { position: relative; display: flex; padding: 3px; border-radius: 12px; background: rgba(0, 0, 0, .28); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.eseg button { position: relative; z-index: 1; flex: 1; min-width: 0; height: 32px; border-radius: 9px; font-size: 12.5px; font-weight: 600; color: var(--t2); display: flex; align-items: center; justify-content: center; gap: 5px; transition: color .2s, background .2s; white-space: nowrap; padding: 0 6px; }
.eseg button .ic { font-size: 15px; }
.eseg button.act { color: var(--t1); background: rgba(255, 255, 255, .16); box-shadow: 0 2px 6px rgba(0, 0, 0, .25), inset 0 0 0 1px rgba(255, 255, 255, .08); }
.eseg button.act .ic { --ip: currentColor; }
.erange { width: 100%; accent-color: #fff; }
.etgl { position: relative; flex: none; width: 46px; height: 28px; border-radius: 99px; background: rgba(120, 120, 128, .32); transition: background .25s; }
.etgl::after { content: ''; position: absolute; left: 2px; top: 2px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, .3); transition: transform .3s var(--snap); }
.etgl.on { background: rgb(var(--green)); }
.etgl.on::after { transform: translateX(18px); }
.ebtns { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.ebtns .ebtn { flex: 1; }
.echips { display: flex; flex-wrap: wrap; gap: 6px; }
.echip { height: 32px; padding: 0 11px; border-radius: 99px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--t2);
  background: rgba(255, 255, 255, .07); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .09); transition: background .2s, color .2s; }
.echip .ic { font-size: 15px; }
.echip:hover { background: rgba(255, 255, 255, .12); color: var(--t1); }
.echip.act { background: #fff; color: #0c0c0e; box-shadow: none; }
.echip.act .ic { --ip: currentColor; }
.echip.chk.act { background: rgba(var(--blue), .9); color: #fff; }
.epal { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.epal button { height: 74px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--t2);
  background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); cursor: grab; transition: background .2s, transform .3s var(--snap), color .2s; touch-action: none; }
.epal button .ic { font-size: 25px; }
.epal button:hover { background: rgba(255, 255, 255, .11); color: var(--t1); }
.epal button:active { transform: scale(.95); }
.eicons { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.eicons button { height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 20px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.eicons button:hover { background: rgba(255, 255, 255, .11); }
.eicons button.act { background: #fff; }
.eicons button.act .ic { --ip: #0c0c0e; }
.esearch { position: relative; }
.esearch .ic { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); font-size: 16px; opacity: .7; pointer-events: none; }
.esearch .einp { padding-left: 34px; }
.elist { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
.egrp { margin: 12px 4px 4px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--t3); display: flex; justify-content: space-between; align-items: center; }
.egrp button { font-size: 11.5px; font-weight: 600; letter-spacing: 0; text-transform: none; color: rgb(100, 170, 255); }
.erow { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 6px 8px 6px 10px; border-radius: 12px; cursor: grab; touch-action: none; transition: background .15s; }
.erow:hover { background: rgba(255, 255, 255, .07); }
.erow .ei { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; background: rgba(255, 255, 255, .08); }
.erow > div { flex: 1; min-width: 0; }
.erow b { display: block; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erow small { display: block; margin-top: 1px; font-size: 11.5px; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erow .eadd { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; background: rgba(255, 255, 255, .08); }
.erow .eadd:hover { background: rgba(255, 255, 255, .16); }
.erow.placed .ei { background: rgba(var(--green), .22); }
.erow.placed .eadd { background: none; color: rgb(var(--green)); cursor: pointer; }
.erow.placed .eadd .ic { --ip: currentColor; }
.erow.on { background: rgba(var(--blue), .16); }
.eempty { padding: 16px; border-radius: 14px; background: rgba(255, 255, 255, .04); font-size: 13px; line-height: 1.45; color: var(--t2); }
.ecard { margin-top: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.ecard.drop { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .7); }
.elayer { display: flex; align-items: center; gap: 10px; min-height: 48px; }
.elayer .ei { flex: none; width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 19px; background: rgba(255, 255, 255, .09); }
.elayer > div { flex: 1; min-width: 0; }
.elayer b { display: block; font-size: 14px; font-weight: 600; }
.elayer small { display: block; font-size: 12px; line-height: 1.35; color: var(--t3); }
.elayer .mv { display: flex; gap: 2px; }
.elayer .mv button { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 14px; color: var(--t2); }
.elayer .mv button:hover { background: rgba(255, 255, 255, .1); }
.edrag-ghost { position: fixed; z-index: 1000; pointer-events: none; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; display: grid; place-items: center; font-size: 20px;
  background: rgba(255, 255, 255, .9); box-shadow: 0 10px 30px rgba(0, 0, 0, .5); }
.edrag-ghost .ic { --ip: #0c0c0e; }
.edrag-ghost.sq { border-radius: 12px; }

/* preview */
.eprev { position: absolute; inset: 60px 0 0 0; z-index: 30; display: none; background: #08090c; }
.eprev.on { display: block; }
.eprev .pbar { position: absolute; left: 50%; top: 12px; z-index: 3; transform: translateX(-50%); }
.eprev .frame { position: absolute; inset: 60px 0 0 0; overflow: auto; }
.eprev .frame.phone { inset: 60px 0 0 0; display: flex; justify-content: center; align-items: flex-start; overflow: hidden; }
.eprev .phonebox { width: 390px; height: min(780px, calc(100% - 20px)); border-radius: 40px; overflow-y: auto; overflow-x: hidden; box-shadow: 0 0 0 10px #000, 0 0 0 12px #3a3b40, 0 30px 80px rgba(0, 0, 0, .6); scrollbar-width: none; }

/* toast */
.etoast { position: absolute; left: 50%; top: 74px; z-index: 40; padding: 10px 18px; border-radius: 999px; font-size: 13.5px; font-weight: 600; white-space: nowrap;
  background: rgba(50, 50, 56, .9); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 18px 44px rgba(0, 0, 0, .45); opacity: 0; transform: translate(-50%, -10px); transition: opacity .25s, transform .4s var(--sp); pointer-events: none; }
.etoast.show { opacity: 1; transform: translate(-50%, 0); }

/* narrow screens: rail at the bottom, inspector as a sheet */
@media (max-width: 760px) {
  .ew { grid-template-columns: minmax(0, 1fr); grid-template-rows: 56px minmax(0, 1fr) auto 72px; }
  .etop h1 small { display: none; }
  .ecv { grid-row: 2; }
  .eins { grid-row: 3; max-height: 42vh; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08); }
  .erail { grid-row: 4; flex-direction: row; overflow-x: auto; padding: 6px 8px; justify-content: flex-start; }
  .erail button { width: 64px; min-height: 56px; flex: none; }
  .erail .rsep { width: 1px; height: 36px; margin: 0 4px; }
  .etop { padding: 0 10px; gap: 6px; }
  .etop h1 { display: none; }
  .etop .undo { margin-left: auto; }
  .etop .ebtn.lbl span { display: none; }
  .etop .ebtn.lbl { padding: 0 11px; }
  .etop .esep { display: none; }
  .emk { width: 26px; height: 26px; margin: -13px 0 0 -13px; }
  .emk .ic { font-size: 14px; }
  .ehint { display: none; }
}
`;
