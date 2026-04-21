# ProdSnap Mobile-Friendly Implementation Plan

> **Critical Requirement:** Desktop UI/UX must remain UNCHANGED. All modifications must be mobile-only using responsive breakpoints.

## Status: COMPLETED ✓

---

## Phase 1: Critical Fixes

### Task 1.1: Add Mobile Navigation ✓
- [x] Add hamburger menu button (hidden on desktop via `hiddenFrom="sm"`)
- [x] Create mobile navigation drawer with links to Home, Studio, Admin
- [x] Ensure desktop nav remains exactly as-is

**File:** `src/routes/__root.tsx`

### Task 1.2: Make Generate Wizard Responsive ✓
- [x] Convert fixed `gridTemplateColumns: '1fr 320px'` to responsive
- [x] Stack layout vertically on mobile (settings above, templates below)
- [x] Keep desktop side-by-side layout unchanged

**File:** `src/routes/studio.$productId.tsx` (GenerateWizard component)

### Task 1.3: Fix Gallery Column Counts ✓
- [x] Update pending generations gallery to use responsive columns (2 on mobile, 4 on desktop)
- [x] Update completed generations gallery to use responsive columns
- [x] Desktop remains 4 columns

**Files:** `src/routes/studio.$productId.tsx`

### Task 1.4: Fix Template Grid in Wizard ✓
- [x] Convert `columns: '4'` to responsive (2 on mobile, 4 on desktop)

**File:** `src/routes/studio.$productId.tsx`

---

## Phase 2: High Priority Fixes

### Task 2.1: Product Header Layout ✓
- [x] Stack image + content vertically on mobile (wrap)
- [x] Reduce image size on mobile (120px → 80px)
- [x] Reduce title font size on mobile (28px → 20px)
- [x] Desktop layout remains horizontal with 120px image

**File:** `src/routes/studio.$productId.tsx` (ProductHeader component)

### Task 2.2: My Products Page Header ✓
- [x] Stack title and button vertically on mobile
- [x] Reduce title font size on mobile (36px → 24px)
- [x] Make upload button full-width on mobile
- [x] Desktop remains horizontal layout

**File:** `src/routes/studio.index.tsx`

### Task 2.3: Product Grid Improvements
- [x] Already responsive with `cols={{ base: 2, sm: 3, md: 4 }}`

**File:** `src/routes/studio.index.tsx`

---

## Phase 3: Medium Priority

### Task 3.1: Drawer/Modal Mobile Sizing ✓
- [x] Variation Drawer: full-screen (100%) on mobile, `md` on desktop
- [x] Lightbox: already full-screen (no change needed)

**File:** `src/routes/studio.$productId.tsx`

### Task 3.2: Segmented Controls
- [ ] Add responsive sizing for better touch targets on mobile (future enhancement)

**File:** `src/routes/studio.$productId.tsx`

### Task 3.3: Template Selection Feedback
- [ ] Add touch-friendly active states (future enhancement)

**File:** `src/routes/studio.$productId.tsx`

### Task 3.4: Notifications Position ✓
- [x] Move to top-center on mobile to avoid bottom overlap

**File:** `src/routes/__root.tsx`

---

## Phase 4: Polish

### Task 4.1: Empty States Padding
- [ ] Reduce padding on mobile for empty states (future enhancement)

**Files:** `src/routes/studio.index.tsx`, `src/routes/studio.$productId.tsx`

### Task 4.2: Landing Page Refinements
- [ ] Reduce hero top padding on mobile (future enhancement)
- [ ] Optimize step card padding (future enhancement)

**File:** `src/routes/index.tsx`

### Task 4.3: Safe Areas ✓
- [x] Add CSS for iPhone notch/home indicator safe areas

**File:** `src/styles/app.css`

### Task 4.4: Touch Feedback ✓
- [x] Add active states for cards (scale on touch)

**File:** `src/styles/app.css`

---

## Implementation Notes

### Responsive Patterns to Use

**Mantine Responsive Props:**
```tsx
// Font sizes
fz={{ base: 24, sm: 32, md: 36 }}

// Padding/Margins
p={{ base: 'md', sm: 'xl' }}

// Grid columns
cols={{ base: 1, xs: 2, sm: 3, md: 4 }}
```

**Visibility Control:**
```tsx
// Hide on mobile, show on desktop
visibleFrom="sm"

// Show on mobile, hide on desktop
hiddenFrom="sm"
```

**useMediaQuery Hook:**
```tsx
const isMobile = useMediaQuery('(max-width: 768px)')
```

### Breakpoints Reference
- `xs`: 576px
- `sm`: 768px
- `md`: 992px
- `lg`: 1200px
- `xl`: 1408px

---

## Progress Log

| Date | Task | Status |
|------|------|--------|
| 2026-04-21 | Task 1.1: Mobile Navigation | ✓ Complete |
| 2026-04-21 | Task 1.2: Generate Wizard Responsive | ✓ Complete |
| 2026-04-21 | Task 1.3: Gallery Column Counts | ✓ Complete |
| 2026-04-21 | Task 1.4: Template Grid Columns | ✓ Complete |
| 2026-04-21 | Task 2.1: Product Header Layout | ✓ Complete |
| 2026-04-21 | Task 2.2: My Products Header | ✓ Complete |
| 2026-04-21 | Task 3.1: Variation Drawer Full-Screen | ✓ Complete |
| 2026-04-21 | Task 3.4: Notification Position | ✓ Complete |
| 2026-04-21 | Task 4.3: Safe Areas CSS | ✓ Complete |
| 2026-04-21 | Task 4.4: Touch Feedback CSS | ✓ Complete |

