# ProdSnap Code & UI/UX Audit Issues

**Audit Date:** 2026-04-21
**Status:** Complete ✓

---

## Summary

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 6 | 6 | 0 |
| HIGH | 8 | 8 | 0 |
| MEDIUM | 9 | 9 | 0 |
| LOW | 5 | 5 | 0 |
| **Total** | **28** | **28** | **0** |

---

## CRITICAL Issues

### 1. No server-side authentication
- **Location:** `convex/*.ts`
- **Type:** Security
- **Description:** All Convex mutations/queries are unauthenticated despite Clerk on frontend. Any user can call any mutation directly.
- **Fix:** Added `requireAuth()` helper using `ctx.auth.getUserIdentity()`, added `userId` field to products/generations schema with indexes, all public mutations/queries now require auth and verify ownership
- **Status:** [x] FIXED

### 2. No file content-type validation
- **Location:** `convex/r2.ts`
- **Type:** Security
- **Description:** Uploaded files not validated server-side, risk of stored XSS via malicious file uploads
- **Fix:** Added `ALLOWED_IMAGE_TYPES` allowlist, `validateContentType()` and `validateMagicBytes()` functions to verify files match claimed MIME type
- **Status:** [x] FIXED

### 3. Generation card actions invisible on mobile
- **Location:** `studio.$productId.tsx:700-761`
- **Type:** UX
- **Description:** Hover-only overlay means touch users can't access expand/delete/download buttons
- **Fix:** Always show action buttons on mobile with gradient overlay at bottom
- **Status:** [x] FIXED

### 4. Product title not keyboard accessible
- **Location:** `studio.$productId.tsx:225-239`
- **Type:** Accessibility
- **Description:** Click-to-edit `<h1>` has no `tabIndex`, `role`, or keyboard handler
- **Fix:** Added `tabIndex={0}`, `role="button"`, `aria-label`, `onKeyDown` for Enter/Space
- **Status:** [x] FIXED

### 5. Lightbox modal missing ARIA labels
- **Location:** `studio.$productId.tsx:399-450`
- **Type:** Accessibility
- **Description:** No `aria-label` on modal, close button, or download button
- **Fix:** Added aria-labels to Modal, CloseButton, Image alt, and Download button
- **Status:** [x] FIXED

### 6. Template images have empty alt=""
- **Location:** `studio.$productId.tsx:987`
- **Type:** Accessibility
- **Description:** Screen readers can't distinguish templates
- **Fix:** Added descriptive alt text using template properties (imageStyle, setting, productCategory)
- **Status:** [x] FIXED

---

## HIGH Issues

### 7. confirm() used instead of themed modal dialogs
- **Location:** `studio.$productId.tsx:299`
- **Type:** UX
- **Description:** Native browser confirm() breaks the dark theme aesthetic
- **Fix:** Added themed Modal with Cancel/Delete buttons and loading state
- **Status:** [x] FIXED

### 8. No active route indication in navigation
- **Location:** `__root.tsx:233-259`
- **Type:** UX
- **Description:** Users can't tell which page they're on from nav highlighting
- **Fix:** Added active state with background color and bolder text using useRouterState
- **Status:** [x] FIXED

### 9. VariationDrawer uses light-mode colors
- **Location:** `studio.$productId.tsx:562,585,609`
- **Type:** Visual
- **Description:** Uses `gray-0` text color which appears too light in dark app
- **Fix:** Changed gray-0 to dark-6 and gray-6 to dark-2 for proper dark mode
- **Status:** [x] FIXED

### 10. dark.3 text fails WCAG AA contrast
- **Location:** Multiple files
- **Type:** Accessibility
- **Description:** `dark.3` on black background has only 3.2:1 contrast ratio (AA requires 4.5:1)
- **Fix:** Changed all `c="dark.3"` to `c="dark.2"` across studio, admin, and root files
- **Status:** [x] FIXED

### 11. Disabled button has no explanation tooltip
- **Location:** `studio.$productId.tsx:316-329`
- **Type:** UX
- **Description:** "Generate More" button is disabled when product not ready, but no explanation why
- **Fix:** Wrapped button in Tooltip that shows "Product is still being analyzed..." or "Product analysis failed"
- **Status:** [x] FIXED

### 12. Wizard sidebar above templates on mobile (wrong order)
- **Location:** `studio.$productId.tsx:1046`
- **Type:** Mobile
- **Description:** Settings appear before templates on mobile, but users need to see templates first
- **Fix:** Changed order so templates (order:1) always appear before sidebar (order:2)
- **Status:** [x] FIXED

### 13. Environment variables accessed with ! assertions
- **Location:** `convex/r2.ts`
- **Type:** Code Quality
- **Description:** No validation of required env vars, will crash with unhelpful error if missing
- **Fix:** Added `getR2Client()` helper that validates env vars exist and throws clear error message
- **Status:** [x] FIXED

### 14. No loading skeletons - shimmer CSS unused
- **Location:** `studio.$productId.tsx:950`
- **Type:** UX
- **Description:** `.shimmer` CSS class exists but never used, galleries show nothing while loading
- **Fix:** Added shimmer skeleton cards with varying aspect ratios during template loading
- **Status:** [x] FIXED

---

## MEDIUM Issues

### 15. VariationDrawer state not reset on close
- **Location:** `studio.$productId.tsx:481-485`
- **Type:** UX
- **Description:** Checkbox selections persist after drawer closes and reopens
- **Fix:** Added useEffect to reset all state when drawer opens
- **Status:** [x] FIXED

### 16. Template selection limit not visually communicated
- **Location:** `studio.$productId.tsx:870-871`
- **Type:** UX
- **Description:** 3-template limit only shown via notification after exceeding
- **Fix:** Badge showing "{pickedIds.length}/3 selected" already present in header
- **Status:** [x] FIXED

### 17. Back button is Anchor without href or role
- **Location:** `studio.$productId.tsx:917`
- **Type:** Accessibility
- **Description:** `<Anchor>` used as button without proper semantics
- **Fix:** Added `component="button"` and `onKeyDown` handler for Enter/Space keys
- **Status:** [x] FIXED

### 18. No drag-and-drop for product upload
- **Location:** `studio.index.tsx:124`
- **Type:** UX
- **Description:** Only click-to-upload supported, no drag-and-drop zone
- **Fix:** Added Mantine Dropzone component with visual feedback states (Accept/Reject/Idle)
- **Status:** [x] FIXED

### 19. No upload progress indicator
- **Location:** `studio.index.tsx:66-99`
- **Type:** UX
- **Description:** Only button loading state shown, no actual progress
- **Fix:** Added Progress component with animated striped bar tracking upload phases
- **Status:** [x] FIXED

### 20. CSS columns produce unintuitive ordering
- **Location:** `studio.$productId.tsx:336,385,958`
- **Type:** UX
- **Description:** Multi-column layout fills top-to-bottom per column, not left-to-right rows
- **Fix:** Converted from CSS columns to CSS Grid for left-to-right ordering
- **Status:** [x] FIXED

### 21. Inconsistent border radii
- **Location:** Multiple files
- **Type:** Visual
- **Description:** Mix of `xl` and `lg` border radii across similar components
- **Fix:** Standardized all border radii to `lg` for less curvature per user preference
- **Status:** [x] FIXED

### 22. Duplicated capitalizeWords utility
- **Location:** `studio.$productId.tsx`, `studio.index.tsx`
- **Type:** Code Quality
- **Description:** Same function defined in two files
- **Fix:** Extracted to `src/utils/strings.ts` and imported in both files
- **Status:** [x] FIXED

### 23. `as any` type assertion hiding type mismatch
- **Location:** `studio.index.tsx:261`
- **Type:** Code Quality
- **Description:** Type assertion masking potential type error
- **Fix:** Refactored to wrap Paper with Link component instead of using component prop
- **Status:** [x] FIXED

---

## LOW Issues

### 24. .using-mouse CSS rule is dead code
- **Location:** `app.css:34-36`
- **Type:** Code Quality
- **Description:** CSS class `.using-mouse` is never added to DOM
- **Fix:** Removed dead CSS rule
- **Status:** [x] FIXED

### 25. parseInt() without radix parameter
- **Location:** Multiple locations
- **Type:** Code Quality
- **Description:** `parseInt()` without radix can have unexpected behavior
- **Fix:** Added radix 10 to all parseInt calls: `parseInt(value, 10)`
- **Status:** [x] FIXED

### 26. Base64 encoding large files in browser
- **Location:** `studio.index.tsx:68-71`
- **Type:** Performance
- **Description:** 10MB file base64 encoded in browser is memory-intensive
- **Fix:** Implemented presigned URL upload - client uploads directly to R2 without base64 encoding
- **Status:** [x] FIXED

### 27. NotFound component uses off-brand colors
- **Location:** `components/NotFound.tsx`
- **Type:** Visual
- **Description:** Uses teal/cyan colors instead of brand palette
- **Fix:** Changed teal/cyan to brand color, updated button styles
- **Status:** [x] FIXED

### 28. Lightbox download button may overlap iOS home indicator
- **Location:** `studio.$productId.tsx:441`
- **Type:** Mobile
- **Description:** Fixed bottom button may overlap iPhone home indicator
- **Fix:** Added `marginBottom: 'env(safe-area-inset-bottom, 0)'`
- **Status:** [x] FIXED

---

## Progress Log

| Date | Issue # | Action | Result |
|------|---------|--------|--------|
| 2026-04-21 | #3 | Added mobile-visible action buttons with gradient overlay | FIXED |
| 2026-04-21 | #4 | Added tabIndex, role, aria-label, onKeyDown to title | FIXED |
| 2026-04-21 | #5 | Added aria-labels to lightbox modal, close btn, download | FIXED |
| 2026-04-21 | #6 | Added descriptive alt text to template/product images | FIXED |
| 2026-04-21 | #7 | Replaced confirm() with themed Modal component | FIXED |
| 2026-04-21 | #8 | Added active route highlighting with useRouterState | FIXED |
| 2026-04-21 | #9 | Changed gray-0 to dark-6, gray-6 to dark-2 | FIXED |
| 2026-04-21 | #12 | Fixed order so templates show before sidebar | FIXED |
| 2026-04-21 | #15 | Added useEffect to reset drawer state on open | FIXED |
| 2026-04-21 | #22 | Extracted capitalizeWords to src/utils/strings.ts | FIXED |
| 2026-04-21 | #28 | Added safe-area margin to lightbox download button | FIXED |
| 2026-04-21 | #1 | Added requireAuth() helper, userId to schema, auth checks to all mutations/queries | FIXED |
| 2026-04-21 | #2 | Added ALLOWED_IMAGE_TYPES, validateContentType(), validateMagicBytes() | FIXED |
| 2026-04-21 | #13 | Added getR2Client() with env var validation | FIXED |
| 2026-04-21 | #10 | Changed all dark.3 to dark.2 for WCAG AA contrast | FIXED |
| 2026-04-21 | #11 | Added Tooltip to disabled Generate More button | FIXED |
| 2026-04-21 | #14 | Added shimmer skeleton cards for template loading | FIXED |
| 2026-04-21 | #16 | Verified X/3 selected badge already exists | FIXED |
| 2026-04-21 | #17 | Added component="button" and onKeyDown to back anchor | FIXED |
| 2026-04-21 | #23 | Refactored Link/Paper composition to fix type issue | FIXED |
| 2026-04-21 | #24 | Removed dead .using-mouse CSS rule | FIXED |
| 2026-04-21 | #27 | Changed NotFound teal/cyan buttons to brand color | FIXED |
| 2026-04-21 | #18 | Added Mantine Dropzone with visual feedback states | FIXED |
| 2026-04-21 | #19 | Added Progress component with animated striped bar | FIXED |
| 2026-04-21 | #20 | Converted CSS columns to CSS Grid for left-to-right ordering | FIXED |
| 2026-04-21 | #21 | Standardized all border radii to lg | FIXED |
| 2026-04-21 | #25 | Added radix 10 to all parseInt calls | FIXED |
| 2026-04-21 | #26 | Implemented presigned URL upload to R2 | FIXED |

