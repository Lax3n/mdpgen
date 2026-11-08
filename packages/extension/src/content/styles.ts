/** Popover façon macOS : matériau translucide, flèche vers le champ, boutons système. */
export const BUBBLE_CSS = `
:host { all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; display: block; }
:host([hidden]) { display: none !important; }
.popover {
  position: relative; box-sizing: border-box; width: 320px; padding: 14px 14px 12px;
  font: 13px/1.38 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased; letter-spacing: -0.08px;
  color: rgba(0, 0, 0, 0.85);
  background: rgba(250, 250, 250, 0.94);
  -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
  border-radius: 14px;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.14), 0 14px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
  transform-origin: top center;
  animation: mdpgen-in 170ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
:host([data-placement="above"]) .popover { transform-origin: bottom center; animation-name: mdpgen-in-up; }
@keyframes mdpgen-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes mdpgen-in-up { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .popover { animation: none !important; } }
.arrow { position: absolute; top: -9px; left: 20px; width: 22px; height: 10px; overflow: visible; }
.arrow path { fill: rgba(250, 250, 250, 0.97); stroke: rgba(0, 0, 0, 0.14); stroke-width: 1; }
:host([data-placement="above"]) .arrow { top: auto; bottom: -9px; transform: rotate(180deg); }
.header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.title { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; }
.title .glyph {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 6px;
  background: linear-gradient(180deg, #4aa3ff, #0a5fe0); color: #fff; box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.2);
}
.title .glyph svg { width: 12px; height: 12px; }
.brand { font-size: 11px; font-weight: 500; color: rgba(60, 60, 67, 0.6); letter-spacing: 0; }
.field {
  display: flex; align-items: center; gap: 4px; padding: 7px 6px 7px 10px; border-radius: 9px;
  background: rgba(120, 120, 128, 0.12); box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.06);
}
.value {
  flex: 1; min-width: 0; font: 13px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  overflow-wrap: anywhere; word-break: break-all; letter-spacing: 0.02em; color: rgba(0, 0, 0, 0.88);
}
.value.masked { letter-spacing: 0.14em; color: rgba(60, 60, 67, 0.6); }
.icon {
  flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: 0; border-radius: 6px; background: transparent; color: rgba(60, 60, 67, 0.7); cursor: default; padding: 0;
}
.icon:hover { background: rgba(120, 120, 128, 0.16); color: rgba(0, 0, 0, 0.85); }
.icon:active { background: rgba(120, 120, 128, 0.26); }
.icon svg { width: 15px; height: 15px; }
.meta { display: flex; align-items: center; gap: 6px; margin: 8px 2px 12px; font-size: 11px; color: rgba(60, 60, 67, 0.6); letter-spacing: 0; }
.meta .dot { width: 7px; height: 7px; border-radius: 50%; background: #34c759; box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08); }
.meta .strength { font-weight: 600; color: rgba(0, 0, 0, 0.75); }
.meta .strength-good ~ .dot, .meta .dot.strength-good { background: #ff9500; }
.meta .dot.strength-fair, .meta .dot.strength-weak { background: #ff3b30; }
.actions { display: flex; flex-direction: column; gap: 8px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 30px;
  padding: 5px 10px; border: 0; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600; cursor: default;
  color: rgba(0, 0, 0, 0.85); background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.16), 0 1px 1.5px rgba(0, 0, 0, 0.08);
  transition: filter 80ms ease, transform 80ms ease;
}
.btn:hover { filter: brightness(0.98); }
.btn:active { filter: brightness(0.94); transform: translateY(0.5px); }
.btn:disabled { opacity: 0.5; filter: none; transform: none; }
.btn.primary { color: #fff; background: linear-gradient(180deg, #3d9cff 0%, #0a7aff 100%); box-shadow: 0 0 0 0.5px rgba(0, 60, 180, 0.35), 0 1px 2px rgba(10, 122, 255, 0.3); }
.btn.primary:hover { filter: brightness(1.04); }
.btn.primary:active { filter: brightness(0.92); }
.btn svg { width: 15px; height: 15px; }
.error { margin-top: 8px; font-size: 11px; color: #ff3b30; }
.footer { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px; font-size: 11px; color: rgba(60, 60, 67, 0.45); letter-spacing: 0; }
.link { border: 0; background: none; padding: 0; color: rgba(60, 60, 67, 0.6); font: inherit; font-size: 11px; cursor: default; }
.link:hover { color: #0a7aff; }
[hidden] { display: none !important; }
@media (prefers-color-scheme: dark) {
  .popover { color: rgba(255, 255, 255, 0.86); background: rgba(44, 44, 46, 0.94); box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.16), 0 14px 40px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3); }
  .arrow path { fill: rgba(44, 44, 46, 0.97); stroke: rgba(255, 255, 255, 0.16); }
  .brand { color: rgba(235, 235, 245, 0.6); }
  .field { background: rgba(118, 118, 128, 0.24); box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.06); }
  .value { color: rgba(255, 255, 255, 0.9); }
  .value.masked { color: rgba(235, 235, 245, 0.6); }
  .icon { color: rgba(235, 235, 245, 0.7); }
  .icon:hover { background: rgba(118, 118, 128, 0.3); color: rgba(255, 255, 255, 0.9); }
  .meta { color: rgba(235, 235, 245, 0.6); }
  .meta .strength { color: rgba(255, 255, 255, 0.8); }
  .meta .dot { background: #30d158; }
  .meta .dot.strength-good { background: #ff9f0a; }
  .meta .dot.strength-fair, .meta .dot.strength-weak { background: #ff453a; }
  .btn { color: rgba(255, 255, 255, 0.9); background: rgba(118, 118, 128, 0.28); box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.12); }
  .btn:hover { filter: brightness(1.1); }
  .btn.primary { background: linear-gradient(180deg, #3d9cff 0%, #0a84ff 100%); box-shadow: 0 0 0 0.5px rgba(10, 132, 255, 0.5); }
  .error { color: #ff453a; }
  .footer { color: rgba(235, 235, 245, 0.4); }
  .link { color: rgba(235, 235, 245, 0.6); }
  .link:hover { color: #0a84ff; }
}
`;
