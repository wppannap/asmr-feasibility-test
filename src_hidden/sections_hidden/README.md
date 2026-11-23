# Hidden section templates (not deployed)

These files live **outside** `web/` so GitHub Pages does not publish them.

Re-enable a section by either:

1. Manually copying the HTML fragment into `web/index.html` and adding the section id to `ENABLED_SECTIONS` in `web/js/sections.js`, or
2. Running a small build/copy step that injects the fragment before publish (not automated yet).

Fragments:

- `scrolly-3.html` — duration / YouTube charts (disabled)
- `scrolly-5.html` — comments (disabled)
- `scrolly-7.html` — Douyin (disabled)
- `scrolly-8.html` — upload clock / extras (disabled)
- `creator_layer.html` — Map 1 creator overlay (disabled)
