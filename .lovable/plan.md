# Vibrant Sunnah mobile screens

## What to build
Create a dedicated, mobile-first `/sunnah` experience so the new habit screens are easy to explore without replacing Firdaus's existing home, Deen, or account pages. Add a clear entry from the existing style guide and keep existing routes available.

The experience will contain all ten requested views:
1. Three-step welcome and preferences.
2. Sign-in / account entry, reusing the existing account flow.
3. Today dashboard with completion ring, current streak, and checkable habits.
4. Habit list with category filters.
5. Create/edit form with name, category, schedule, and reminder time.
6. Habit detail and date-based completion history.
7. Progress and streak summary from saved check-ins.
8. Reminder preferences and time, reusing saved reminder settings.
9. Settings for language, appearance, notifications, account, and backup.
10. Useful empty, loading, and offline/error states.

Use a compact four-destination bottom bar, with in-flow detail/form views. The existing `/styleguide` remains the source of the Vibrant Sunnah colors, typography, shapes, and component styling; add reciprocal navigation between it and the experience.

## Existing state and behavior
Read and write through Firdaus's current `useStore` persistence/sync layer, reusing `habits`, `profile`, `notifPrefs`, and `reminders` where appropriate. Preserve current prayer, Quran, reminder, analytics, and sync engines. Keep existing habit entries readable; use backward-compatible optional habit details only if needed to save the new form fields. Reuse current sign-in, theme, export, and restore flows rather than duplicating them.

## Technical details
Add one dedicated TanStack route and a small mobile screen module; do not replace current routes or rewrite the existing engines. Keep layout and touch targets mobile-first, map styles to the existing Vibrant Sunnah theme tokens, support light/dark and RTL, and add route-specific metadata. Record the new route/module boundary in `AGENTS.md`. Verify the preview at mobile size and run the relevant existing tests.
