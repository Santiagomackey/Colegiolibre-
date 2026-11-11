ColegioLibre mobile fixes - November 2026

The latest edits are already committed to the GitHub repository:
https://github.com/Santiagomackey/Colegiolibre-

This ZIP is a small patch package, NOT the complete website.

Contents:
- mobile-fixes.css: responsive fixes for the account dropdown and profile action buttons.
- apply_fixes.py: patches the checkout page and loads the CSS in the existing HTML files.

Instructions:
1. Extract this ZIP.
2. Copy mobile-fixes.css and apply_fixes.py to the root of your ColegioLibre website source (next to compra.html and perfil.html).
3. Run: python apply_fixes.py
4. Deploy the updated source. Keep a backup first.

The reserved-product checkout fix improves the error display. It does not remove the active-order restriction.

