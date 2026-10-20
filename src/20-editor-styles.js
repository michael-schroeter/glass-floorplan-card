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
.ebtn.red { color: rgb(255, 128, 118); background: rgba(var(--red), .13); box-shadow: inset 0 0 0 1px rgba(var(--red), .32); }
.ebtn.red .ic, .ebtn.redfill .ic { --ip: currentColor; }
.ebtn.red:hover { background: rgba(var(--red), .22); }
.ebtn.redfill { background: linear-gradient(180deg, rgb(255, 92, 82), rgb(var(--red))); color: #fff; box-shadow: 0 6px 18px rgba(var(--red), .32); }
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
.erail .ereset { margin-top: auto; color: rgb(255, 128, 118); flex: none; }
.erail .ereset .ic { --ip: currentColor; }
.erail .ereset:hover { background: rgba(var(--red), .14); color: rgb(255, 150, 140); }

/* laptop / phone */
.eview { padding: 2px; border-radius: 11px; }
.eview button { height: 30px; padding: 0 11px; font-size: 13px; }
.eview button .ic { font-size: 16px; }

/* canvas: the live card on a screen of the real size, invisible handles on top */
.ecv { position: relative; z-index: 1; overflow: hidden; touch-action: none; cursor: default; background: radial-gradient(90% 80% at 50% 0%, rgba(40, 46, 70, .35), rgba(10, 11, 16, 0) 70%), #050608; }
.ecv.pan, .ecv.panning { cursor: grab; }
.ecv.panning { cursor: grabbing; }
.ecv.draw { cursor: crosshair; }
.elive { position: absolute; left: 0; top: 0; z-index: 0; transform-origin: 0 0; pointer-events: none; overflow: hidden; }
.elive > * { display: block; width: 100%; }
.eframe { position: absolute; z-index: 1; pointer-events: none; border-radius: 12px; box-shadow: 0 0 0 1px rgba(255, 255, 255, .14), 0 30px 90px rgba(0, 0, 0, .65); }
.eframe.phone { border-radius: 30px; box-shadow: 0 0 0 7px #0c0c0e, 0 0 0 8.5px #3a3b40, 0 30px 90px rgba(0, 0, 0, .65); }
.eframe small { position: absolute; left: 4px; bottom: calc(100% + 9px); font-size: 12px; font-weight: 600; color: var(--t3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.eframe.phone small { bottom: calc(100% + 16px); left: 12px; }
.ecv .ul { position: absolute; z-index: 2; pointer-events: none; transform-origin: 0 0; user-select: none; -webkit-user-drag: none; }
.world { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.world > * { pointer-events: auto; }
.eroom { position: absolute; border-radius: 12px; transition: box-shadow .15s, background .15s; }
.tool-rooms .eroom:hover, .tool-sketch .eroom:hover { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .55); background: rgba(255, 255, 255, .04); }
.ul-on .eroom { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .5); }
.eroom.hot { box-shadow: inset 0 0 0 2px rgba(var(--blue), .95), 0 0 0 5px rgba(var(--blue), .2) !important; background: rgba(var(--blue), .1); }
.eroom.na em { position: absolute; left: 8px; bottom: 8px; padding: 3px 8px; border-radius: 99px; font-style: normal; font-size: 11px; font-weight: 650; white-space: nowrap; pointer-events: none;
  background: rgba(var(--orange), .2); color: rgb(255, 190, 90); box-shadow: inset 0 0 0 1px rgba(var(--orange), .45); }
.eroom.ghost { pointer-events: none; background: rgba(var(--blue), .1); box-shadow: none; outline: 1.5px dashed rgba(100, 170, 255, .95); outline-offset: -2px; }
.eroom .en { position: absolute; left: 9px; top: 7px; right: 6px; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; text-shadow: 0 1px 6px rgba(0, 0, 0, .5); }
.eroom .en b { display: block; font-weight: inherit; overflow: hidden; text-overflow: ellipsis; }
.efu { position: absolute; border-radius: calc(var(--fr, 8) * 1px); }
.efu.c { border-radius: 50%; }
.tool-furniture .efu { cursor: move; }
.tool-furniture .efu:hover { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .6); }
.efu.sel { box-shadow: inset 0 0 0 2px rgba(var(--blue), .95), 0 0 0 4px rgba(var(--blue), .2); }
.eopen { position: absolute; border-radius: 6px; cursor: pointer; }
.tool-openings .eopen { background: rgba(100, 170, 255, .28); box-shadow: inset 0 0 0 1px rgba(140, 195, 255, .55); }
.tool-openings .eopen:hover { background: rgba(100, 170, 255, .5); }
.eopen.ghost { opacity: .8; pointer-events: none; background: rgba(255, 255, 255, .55) !important; box-shadow: 0 0 12px rgba(255, 255, 255, .5); }
.eopen.sel { background: rgba(var(--blue), .45); box-shadow: 0 0 0 2px rgb(var(--blue)), 0 0 14px rgba(var(--blue), .6); }
.emk { position: absolute; width: var(--s, 36px); height: var(--s, 36px); margin: calc(var(--s, 36px) / -2) 0 0 calc(var(--s, 36px) / -2); border-radius: 50%; cursor: grab; touch-action: none; transition: box-shadow .15s; }
.emk:hover { box-shadow: 0 0 0 2px rgba(255, 255, 255, .75); }
.emk.sel { box-shadow: 0 0 0 3px rgb(var(--blue)), 0 0 0 8px rgba(var(--blue), .25); }
.emk.ghost { box-shadow: 0 0 0 2px rgba(var(--blue), .9); outline: 1.5px dashed rgba(255, 255, 255, .7); outline-offset: 3px; }
.emk.dock { border-radius: 30%; }
.emk.warn::after { content: '!'; position: absolute; right: -4px; top: -4px; width: 15px; height: 15px; border-radius: 50%; background: rgb(var(--orange)); color: #1a0e00; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.ewid { position: absolute; border-radius: 14px; cursor: move; box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .5); outline: 1.5px dashed rgba(255, 255, 255, .45); outline-offset: 3px; }
.ewid span { position: absolute; left: 8px; top: 8px; padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 650; color: #0c0c0e; background: rgba(255, 255, 255, .85); pointer-events: none; }
.ewid.auto { outline-color: rgba(255, 255, 255, .25); }
.ewid.sel { box-shadow: inset 0 0 0 2px rgb(var(--blue)); outline-color: rgba(var(--blue), .7); }
.ehl { position: absolute; z-index: 4; pointer-events: none; border-radius: 34px; box-shadow: 0 0 0 2.5px rgb(var(--blue)), 0 0 0 9px rgba(var(--blue), .22), 0 0 46px rgba(var(--blue), .5); animation: ehl 2.4s ease-in-out infinite; }
@keyframes ehl { 50% { box-shadow: 0 0 0 2.5px rgb(var(--blue)), 0 0 0 14px rgba(var(--blue), .12), 0 0 60px rgba(var(--blue), .35); } }
.ehd { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgb(var(--blue)), 0 2px 6px rgba(0, 0, 0, .4); z-index: 20; touch-action: none; }
.ehd.ew { cursor: ew-resize; } .ehd.ns { cursor: ns-resize; } .ehd.nwse { cursor: nwse-resize; } .ehd.nesw { cursor: nesw-resize; }
.esel { position: absolute; pointer-events: none; border-radius: 12px; box-shadow: 0 0 0 2px rgb(var(--blue)), 0 0 0 6px rgba(var(--blue), .18); z-index: 19; }
.eguide { position: absolute; pointer-events: none; background: rgba(255, 70, 200, .85); z-index: 18; }
.eguide.v { width: 1px; top: 0; bottom: 0; } .eguide.h { height: 1px; left: 0; right: 0; }
.edraw { position: absolute; pointer-events: none; border-radius: 12px; background: rgba(var(--blue), .16); box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .95); z-index: 17; }
.edim { position: absolute; z-index: 21; pointer-events: none; padding: 3px 8px; border-radius: 7px; font-size: 11.5px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap;
  background: rgba(var(--blue), .92); color: #fff; transform: translate(-50%, -130%); }
.emeas { position: absolute; z-index: 21; pointer-events: none; }
.emeas i { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: rgb(255, 70, 200); box-shadow: 0 0 0 2px #fff; }
/* red: what a delete button would remove */
.del-sel .esel, .del-sel .emk.sel, .del-sel .eopen.sel, .del-sel .efu.sel, .del-sel .eroom.hot { box-shadow: 0 0 0 2.5px rgb(var(--red)), 0 0 0 7px rgba(var(--red), .25) !important; background: rgba(var(--red), .24) !important; }
.del-all .eroom, .del-all .efu, .del-all .emk { background: rgba(var(--red), .2); box-shadow: inset 0 0 0 1.5px rgba(var(--red), .85); }
.ezoom { position: absolute; right: 14px; bottom: 14px; z-index: 6; display: flex; gap: 4px; padding: 4px; border-radius: 14px;
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 10px 28px rgba(0, 0, 0, .4); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.ezoom button { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
.ezoom button:hover { background: rgba(255, 255, 255, .1); }
.ecv .elight { position: absolute; left: 14px; bottom: 14px; z-index: 6; align-items: center; padding: 4px; border-radius: 14px;
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 10px 28px rgba(0, 0, 0, .4); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.ecv .elight .lbl { display: grid; place-items: center; width: 30px; font-size: 17px; }
.ecv .elight button { height: 34px; padding: 0 11px; border-radius: 10px; flex: none; }
.ehint { position: absolute; left: 50%; bottom: 16px; z-index: 6; transform: translateX(-50%); max-width: min(560px, calc(100% - 420px)); padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 500; color: var(--t2);
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); text-align: center; pointer-events: none; transition: opacity .3s; }
.ehint:empty { opacity: 0; }

/* floating toolbar next to the selected furniture */
.efloat { position: absolute; z-index: 25; display: flex; align-items: center; gap: 2px; padding: 4px 4px 4px 12px; border-radius: 14px; white-space: nowrap;
  background: rgba(36, 36, 42, .86); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 12px 30px rgba(0, 0, 0, .45); -webkit-backdrop-filter: blur(24px) saturate(170%); backdrop-filter: blur(24px) saturate(170%); }
.efloat span { font-size: 12px; font-weight: 600; color: var(--t2); margin-right: 6px; font-variant-numeric: tabular-nums; }
.efloat button { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
.efloat button:hover { background: rgba(255, 255, 255, .12); }
.efloat button[data-act="del"] .ic { --ip: rgb(255, 120, 110); }
.efloat button[data-act="del"]:hover { background: rgba(var(--red), .22); }
.ecv:focus { outline: none; }

/* inspector */
.eins { position: relative; z-index: 4; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding: 18px 18px 30px;
  background: linear-gradient(270deg, rgba(24, 24, 30, .78), rgba(20, 20, 26, .6)); box-shadow: inset 1px 0 0 rgba(255, 255, 255, .06); }
.eins h2 { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
.eback { display: inline-flex; align-items: center; gap: 2px; height: 32px; margin: -6px 0 10px -8px; padding: 0 12px 0 4px; border-radius: 10px; font-size: 14.5px; font-weight: 600; color: rgb(100, 170, 255); transition: background .15s; }
.eback .ic { --ip: currentColor; font-size: 20px; }
.eback:hover { background: rgba(var(--blue), .14); }
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
.egrp.fold { width: calc(100% - 8px); height: 30px; margin: 8px 4px 2px; justify-content: flex-start; gap: 6px; border-radius: 9px; }
.egrp.fold:hover { color: var(--t2); }
.egrp.fold .ic { font-size: 14px; transition: transform .25s var(--snap); }
.egrp.fold.closed .ic { transform: rotate(-90deg); }
.egrp.fold span { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.egrp.fold small { font-size: 11px; font-weight: 600; letter-spacing: 0; color: var(--t3); font-variant-numeric: tabular-nums; }
.egroupby { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.egroupby .eseg { flex: 1; }
.efoldall { flex: none; height: 32px; padding: 0 6px; font-size: 12.5px; font-weight: 600; color: rgb(100, 170, 255); }
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
.erow .eadd.del { color: rgb(255, 128, 118); background: rgba(var(--red), .14); }
.erow .eadd.del .ic { --ip: currentColor; }
.erow .eadd.del:hover { background: rgba(var(--red), .26); }
.eempty { padding: 16px; border-radius: 14px; background: rgba(255, 255, 255, .04); font-size: 13px; line-height: 1.45; color: var(--t2); }
.ecard { margin-top: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.ecard.drop { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .7); }
.ecard.pick { cursor: pointer; transition: box-shadow .2s, background .2s; }
.ecard.pick:hover { background: rgba(255, 255, 255, .08); }
.ecard.cur { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); background: rgba(var(--blue), .1); }
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
.edrag-ghost.pill { width: auto; height: 36px; margin: -18px 0 0 -18px; padding: 0 14px 0 10px; gap: 7px; display: flex; border-radius: 99px; font-size: 13.5px; font-weight: 650; color: #0c0c0e; }
.edrag-ghost.pill .ic { font-size: 17px; }
.echip.area { cursor: grab; touch-action: none; }
.echip.area small { margin-left: 2px; padding: 1px 6px; border-radius: 99px; font-size: 11px; font-weight: 700; background: rgba(255, 255, 255, .12); color: var(--t1); }
.echip.area.done { color: rgb(var(--green)); background: rgba(var(--green), .1); box-shadow: inset 0 0 0 1px rgba(var(--green), .3); }
.echip.area.done .ic { --ip: currentColor; }
.echip.area.empty { opacity: .55; }
.eroom .en em { display: block; margin-top: 2px; font-style: normal; font-size: 10.5px; font-weight: 600; color: rgb(var(--orange)); }

/* a question (start over …) */
.econfirm { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, .45); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.ecbox { width: min(420px, 100%); padding: 22px 22px 18px; border-radius: 22px; background: linear-gradient(160deg, rgba(52, 52, 60, .92), rgba(30, 30, 36, .94));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), 0 30px 80px rgba(0, 0, 0, .55); }
.ecbox h2 { margin: 0 0 8px; font-size: 19px; font-weight: 700; letter-spacing: -.02em; }
.ecbox p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--t2); }
.ecbox .ebtns { margin-top: 18px; }

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
  .ehint { display: none; }
  .eview button span, .elight .lbl { display: none; }
  .eview button { padding: 0 9px; }
  .erail .ereset { margin-top: 0; margin-left: auto; }
}
`;
