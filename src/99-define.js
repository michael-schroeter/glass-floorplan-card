/* ================================================================== Registration */
if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, GlassFloorplanCard);
if (!customElements.get(`${CARD_TAG}-editor`)) customElements.define(`${CARD_TAG}-editor`, GfcCardEditor);
if (!customElements.get('glass-floorplan-editor')) customElements.define('glass-floorplan-editor', GfcEditor);
/* for the demo page and the setup assistant */
window.GFC_EXAMPLE = exampleConfig;
window.GFC_TOYAML = toYaml;
window.GFC_AUTOCONFIG = autoConfig;
window.GFC_OPEN_EDITOR = (opts) => { const ed = document.createElement('glass-floorplan-editor'); ed.open(opts); return ed; };
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG, name: 'Glass Floorplan Card', preview: false, documentationURL: 'https://github.com/michael-schroeter/glass-floorplan-card',
    description: 'Your home as a glass floor plan: lamps glow in their real colour, rooms open as pop-ups – with layers for light, climate, covers and a Roborock vacuum.',
  });
}
console.info(`%c GLASS FLOORPLAN %c ${VERSION} `, 'background:#f6c859;color:#1c1400;border-radius:6px 0 0 6px;padding:2px 8px;font-weight:700', 'background:#111827;color:#fff;border-radius:0 6px 6px 0;padding:2px 8px');
