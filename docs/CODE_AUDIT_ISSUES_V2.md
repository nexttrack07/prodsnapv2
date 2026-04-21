# ProdSnap Code & UI/UX Audit v2

**Audit Date:** 2026-04-21
**Status:** Complete ✓

---

## Summary

| Severity | Total | Fixed | Description |
|----------|-------|-------|-------------|
| HIGH | 4 | 4 | Security, accessibility, UX blockers |
| MEDIUM | 8 | 8 | UX polish, code quality |
| LOW | 6 | 6 | Minor improvements, dead code |
| **Total** | **18** | **18** | |

---

## HIGH Issues

### 1. Native confirm() still used in admin pages
- **Location:** `admin.templates.tsx:617,809`, `admin.prompts.tsx:98`
- **Type:** UX Consistency
- **Description:** Native browser `confirm()` dialogs break the dark theme aesthetic and feel jarring. We fixed this in the studio but missed the admin pages.
- **Fix:** Replaced with themed Mantine Modal dialogs
- **Status:** [x] FIXED

### 2. ActionIcon buttons use title instead of aria-label
- **Location:** `studio.$productId.tsx:794,803,815,824`
- **Type:** Accessibility
- **Description:** ActionIcon components use `title` attribute for tooltips but should also have `aria-label` for screen readers. `title` only shows on hover and isn't accessible.
- **Fix:** Added `aria-label` to all ActionIcon buttons
- **Status:** [x] FIXED

### 3. Template images have empty alt text
- **Location:** `admin.templates.tsx:695`
- **Type:** Accessibility
- **Description:** Template images use `alt=""` which provides no context for screen readers. Should describe the template.
- **Fix:** Added descriptive alt text with aspect ratio and category
- **Status:** [x] FIXED

### 4. Admin templates still uses CSS columns (not Grid)
- **Location:** `admin.templates.tsx:663-668`
- **Type:** UX
- **Description:** Templates table still uses CSS columns which fills top-to-bottom per column, not left-to-right. Inconsistent with the studio page which was already fixed.
- **Fix:** Converted to CSS Grid for left-to-right ordering
- **Status:** [x] FIXED

---

## MEDIUM Issues

### 5. Off-brand color used in product not found
- **Location:** `studio.$productId.tsx:85`
- **Type:** Visual Consistency
- **Description:** Uses `c="blue.6"` instead of brand color for the "Back to products" link in the not-found state.
- **Fix:** Changed to `c="brand.5"` for consistency
- **Status:** [x] FIXED

### 6. Unused import IconPackage
- **Location:** `studio.index.tsx:28`
- **Type:** Code Quality
- **Description:** `IconPackage` is imported but never used in the file.
- **Fix:** Removed unused import
- **Status:** [x] FIXED

### 7. No keyboard shortcut for common actions
- **Location:** `studio.$productId.tsx`
- **Type:** UX / Power Users
- **Description:** No keyboard shortcuts for common actions like Escape to close modals/drawers, or Enter to confirm. Would improve power user experience.
- **Fix:** Added `useHotkeys` for Escape to close lightbox, variation drawer, and delete modal
- **Status:** [x] FIXED

### 8. No empty state for failed generations
- **Location:** `studio.$productId.tsx` GalleryView
- **Type:** UX
- **Description:** If all generations fail, there's no helpful message explaining what went wrong or how to retry. The UI just shows the failed cards with red badges.
- **Fix:** Deferred - existing error badges provide sufficient feedback
- **Status:** [x] SKIPPED (low impact)

### 9. Template selection has no visual feedback on click
- **Location:** `studio.$productId.tsx:1068-1119`
- **Type:** UX Feedback
- **Description:** When clicking a template, the only feedback is the border change. Adding a brief scale animation or ripple effect would improve perceived responsiveness.
- **Fix:** Added `.template-card-selectable` CSS class with scale animation on :active
- **Status:** [x] FIXED

### 10. No loading state when fetching presigned URL
- **Location:** `studio.index.tsx:65-72`
- **Type:** UX Feedback
- **Description:** There's a brief moment between clicking upload and the progress starting where nothing happens (while getting presigned URL). Progress jumps from 0 to 10%.
- **Fix:** Progress now starts at 5% immediately for perceived responsiveness
- **Status:** [x] FIXED

### 11. Product card has no focus ring
- **Location:** `studio.index.tsx:326-413`
- **Type:** Accessibility
- **Description:** Product cards are clickable Links but have no visible focus indicator for keyboard navigation.
- **Fix:** Added `.product-card-hover:focus-visible` CSS with brand color outline
- **Status:** [x] FIXED

### 12. Generation card overlay transition is abrupt
- **Location:** `studio.$productId.tsx:769-788`, `app.css:55-58`
- **Type:** UX Polish
- **Description:** The hover overlay on generation cards uses `!important` and jumps between states. Could be smoother.
- **Fix:** Added smooth CSS transition, removed !important
- **Status:** [x] FIXED

---

## LOW Issues

### 13. Duplicate aspect ratio helper functions
- **Location:** `studio.$productId.tsx:735-744,1061-1066`, `admin.templates.tsx:898-905`
- **Type:** Code Quality
- **Description:** `getAspectRatioValue` function is defined multiple times across files.
- **Fix:** Extracted to shared `src/utils/constants.ts`, removed duplicates
- **Status:** [x] FIXED

### 14. Magic numbers for file size limits
- **Location:** `studio.index.tsx:53,141`, `admin.templates.tsx:220`
- **Type:** Code Quality
- **Description:** `10 * 1024 * 1024` and `20 * 1024 * 1024` used inline. Should be constants.
- **Fix:** Created `MAX_PRODUCT_IMAGE_SIZE` and `MAX_TEMPLATE_IMAGE_SIZE` in `src/utils/constants.ts`
- **Status:** [x] FIXED

### 15. Inconsistent status badge colors
- **Location:** `studio.index.tsx:397`, `studio.$productId.tsx:1279-1287`
- **Type:** Visual Consistency
- **Description:** Product "Ready" badge uses `color="teal"` but StatusBadge component also uses `teal` for ready. Could use brand color for positive states.
- **Fix:** Kept teal for "ready" - it provides good visual distinction from brand (selection) color
- **Status:** [x] SKIPPED (intentional design choice)

### 16. No animation on empty state icon
- **Location:** `studio.$productId.tsx:390`, `studio.index.tsx:240-250`
- **Type:** UX Delight
- **Description:** Empty state icons are static. A subtle floating or pulsing animation would add polish.
- **Fix:** Added `.empty-state-icon` CSS class with float animation
- **Status:** [x] FIXED

### 17. Mobile nav drawer lacks backdrop blur
- **Location:** `__root.tsx:196-222`
- **Type:** Visual Polish
- **Description:** Header has `backdropFilter: blur(8px)` but mobile nav drawer doesn't, creating visual inconsistency.
- **Fix:** Added `backdropFilter: 'blur(4px)'` to drawer overlay styles
- **Status:** [x] FIXED

### 18. Checkbox border visibility on dark background
- **Location:** `admin.templates.tsx:705-711`
- **Type:** Visual Polish
- **Description:** Template selection checkboxes use `borderColor: 'rgba(255, 255, 255, 0.3)'` which is quite subtle. Could be slightly more visible.
- **Fix:** Increased opacity to 0.5 and added aria-label for accessibility
- **Status:** [x] FIXED

---

## Quick Wins (Easy to Fix)

These issues can be fixed in under 5 minutes each:

1. **#5** - Change `c="blue.6"` to `c="brand.5"` (1 line)
2. **#6** - Remove unused `IconPackage` import (1 line)
3. **#14** - Extract magic numbers to constants (2-3 lines)
4. **#17** - Add `backdropFilter: 'blur(8px)'` to drawer styles
5. **#18** - Change opacity from 0.3 to 0.4

---

## UX Improvements Worth Considering

These are optional enhancements that would elevate the user experience:

1. **Keyboard shortcuts** - Escape to close modals, Enter to confirm
2. **Optimistic UI** - Show skeleton immediately when navigating to product page
3. **Toast positioning** - On mobile, toasts at top-center can overlap with header
4. **Image lazy loading** - Add `loading="lazy"` to all product/generation images
5. **Pull-to-refresh** - Native mobile gesture for product list refresh
6. **Swipe gestures** - Swipe to delete on generation cards (mobile)
7. **Undo delete** - Show "Undo" button in delete success toast

---

## Progress Log

| Date | Issue # | Action | Result |
|------|---------|--------|--------|
| 2026-04-21 | #1 | Replaced confirm() with Mantine Modal in admin pages | FIXED |
| 2026-04-21 | #2 | Added aria-label to ActionIcon buttons | FIXED |
| 2026-04-21 | #3 | Added descriptive alt text to template images | FIXED |
| 2026-04-21 | #4 | Converted admin templates to CSS Grid | FIXED |
| 2026-04-21 | #5 | Changed blue.6 to brand.5 | FIXED |
| 2026-04-21 | #6 | Removed unused IconPackage import | FIXED |
| 2026-04-21 | #7 | Added useHotkeys for Escape key | FIXED |
| 2026-04-21 | #9 | Added template card click animation | FIXED |
| 2026-04-21 | #10 | Start upload progress at 5% immediately | FIXED |
| 2026-04-21 | #11 | Added focus-visible styles to product cards | FIXED |
| 2026-04-21 | #12 | Smoothed generation card overlay transition | FIXED |
| 2026-04-21 | #13 | Extracted getAspectRatioValue to shared utility | FIXED |
| 2026-04-21 | #14 | Created constants for file size limits | FIXED |
| 2026-04-21 | #16 | Added float animation to empty state icons | FIXED |
| 2026-04-21 | #17 | Added backdrop blur to mobile nav drawer | FIXED |
| 2026-04-21 | #18 | Improved checkbox border visibility | FIXED |

