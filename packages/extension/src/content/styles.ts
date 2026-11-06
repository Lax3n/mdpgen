export const BUBBLE_CSS = `
:host { all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; display: block; }
:host([hidden]) { display: none !important; }
.card {
  box-sizing: border-box; width: 320px; padding: 12px 14px 10px;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #111827; background: #ffffff; border: 1px solid rgba(17, 24, 39, 0.12); border-radius: 12px;
  box-shadow: 0 12px 32px rgba(17, 24, 39, 0.18), 0 2px 6px rgba(17, 24, 39, 0.08);
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.brand { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: #1d4ed8; font-size: 12px; letter-spacing: 0.02em; }
.brand svg { width: 14px; height: 14px; }
.title { font-weight: 500; color: #374151; font-size: 12px; }
.pw { display: flex; align-items: center; gap: 6px; background: #f3f4f6; border-radius: 8px; padding: 6px 8px; }
.value {
  flex: 1; min-width: 0; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere; word-break: break-all; letter-spacing: 0.04em; color: #111827;
}
.value.masked { letter-spacing: 0.12em; color: #4b5563; }
.icon {
  flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: 0; border-radius: 6px; background: transparent; color: #4b5563; cursor: pointer; padding: 0;
}
.icon:hover { background: #e5e7eb; color: #111827; }
.icon svg { width: 16px; height: 16px; }
.meta { margin: 6px 2px 10px; color: #6b7280; font-size: 12px; }
.meta .strength-excellent, .meta .strength-strong { color: #047857; font-weight: 600; }
.meta .strength-good { color: #b45309; font-weight: 600; }
.meta .strength-fair, .meta .strength-weak { color: #b91c1c; font-weight: 600; }
.actions { display: flex; gap: 8px; }
.btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px;
  padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(17, 24, 39, 0.14); background: #ffffff;
  color: #111827; font: inherit; font-weight: 600; cursor: pointer;
}
.btn:hover { background: #f3f4f6; }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn.primary { background: #1d4ed8; border-color: #1d4ed8; color: #ffffff; }
.btn.primary:hover { background: #1e40af; }
.btn svg { width: 16px; height: 16px; }
.error { margin-top: 8px; color: #b91c1c; font-size: 12px; }
.foot { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #9ca3af; font-size: 12px; }
.link { border: 0; background: none; padding: 0; color: #6b7280; font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.link:hover { color: #111827; }
[hidden] { display: none !important; }
@media (prefers-color-scheme: dark) {
  .card { color: #f3f4f6; background: #1f2937; border-color: rgba(255, 255, 255, 0.12); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); }
  .brand { color: #93c5fd; }
  .title { color: #d1d5db; }
  .pw { background: #111827; }
  .value { color: #f3f4f6; }
  .value.masked { color: #9ca3af; }
  .icon { color: #9ca3af; }
  .icon:hover { background: #374151; color: #f3f4f6; }
  .meta { color: #9ca3af; }
  .meta .strength-excellent, .meta .strength-strong { color: #34d399; }
  .meta .strength-good { color: #fbbf24; }
  .meta .strength-fair, .meta .strength-weak { color: #f87171; }
  .btn { background: #374151; border-color: rgba(255, 255, 255, 0.14); color: #f3f4f6; }
  .btn:hover { background: #4b5563; }
  .btn.primary { background: #3b82f6; border-color: #3b82f6; }
  .btn.primary:hover { background: #2563eb; }
  .error { color: #f87171; }
  .link { color: #9ca3af; }
  .link:hover { color: #f3f4f6; }
}
`;
