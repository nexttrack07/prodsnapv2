# Mantine Migration Tracker

This document tracks the migration from Tailwind CSS to Mantine UI.

## Overview

- **Total Files to Migrate**: 21 files
- **Total Tailwind className Occurrences**: 318
- **Current Status**: Not Started

## Dependencies

### To Add
- [ ] `@mantine/core` - Core components
- [ ] `@mantine/hooks` - Useful hooks
- [ ] `@mantine/notifications` - Replace react-hot-toast
- [ ] `@mantine/form` - Form handling (optional)
- [ ] `postcss` - Required by Mantine
- [ ] `postcss-preset-mantine` - Mantine PostCSS preset

### To Remove
- [ ] `tailwindcss`
- [ ] `@tailwindcss/vite`
- [ ] `tailwind-merge`
- [ ] `react-hot-toast` (replace with @mantine/notifications)

### Config Files to Update
- [ ] `vite.config.ts` - Remove Tailwind plugin, add PostCSS
- [ ] `postcss.config.cjs` - Create new file for Mantine
- [ ] Delete `tailwind.config.ts` if exists
- [ ] `src/styles/app.css` - Replace with Mantine styles

---

## Phase 1: Setup & Infrastructure

### 1.1 Install Dependencies
- [ ] Install Mantine packages
- [ ] Install PostCSS dependencies
- [ ] Remove Tailwind packages

### 1.2 Configure Build
- [ ] Create `postcss.config.cjs`
- [ ] Update `vite.config.ts`
- [ ] Update `src/styles/app.css` with Mantine imports

### 1.3 Setup Mantine Provider
- [ ] Wrap app with `MantineProvider` in `__root.tsx`
- [ ] Configure theme (colors, fonts, etc.)
- [ ] Setup `Notifications` provider

---

## Phase 2: Root Layout & Navigation

### 2.1 `src/routes/__root.tsx` (9 className occurrences)
- [ ] Replace `<body className="min-h-screen flex flex-col">` with Mantine `AppShell`
- [ ] Replace `<header>` with Mantine `AppShell.Header`
- [ ] Replace `<main>` with Mantine `AppShell.Main`
- [ ] Replace `<nav>` with Mantine `Group` + `NavLink`
- [ ] Replace `Toaster` with Mantine `Notifications`
- [ ] Replace `LoadingIndicator` with Mantine `Loader`

**Tailwind → Mantine Mappings:**
| Tailwind | Mantine |
|----------|---------|
| `sticky top-0 z-40` | `AppShell.Header` (built-in) |
| `bg-white/80 backdrop-blur` | `AppShell.Header bg="white"` + CSS |
| `max-w-7xl mx-auto` | `Container size="xl"` |
| `flex items-center justify-between` | `Group justify="space-between"` |
| `gap-8` | `Group gap="xl"` |
| `animate-spin` | `Loader` component |

---

## Phase 3: Components

### 3.1 `src/components/Logo.tsx` (3 className occurrences)
- [ ] Remove `twMerge` import
- [ ] Replace with Mantine `Group`, `Box`, `Text`
- [ ] Use Mantine theme for colors

### 3.2 `src/components/Loader.tsx` (2 className occurrences)
- [ ] Replace entire component with Mantine `Loader`
- [ ] Or `Center` + `Loader`

### 3.3 `src/components/NotFound.tsx` (5 className occurrences)
- [ ] Replace with Mantine `Container`, `Title`, `Text`, `Button`

### 3.4 `src/components/DefaultCatchBoundary.tsx` (5 className occurrences)
- [ ] Replace with Mantine `Alert`, `Text`, `Code`, `Button`

### 3.5 `src/components/Card.tsx` (5 className occurrences)
- [ ] Replace with Mantine `Card` component
- [ ] Use `Card.Section` for image areas

### 3.6 `src/components/Board.tsx` (3 className occurrences)
- [ ] Replace with Mantine `SimpleGrid` or `Flex`

### 3.7 `src/components/Column.tsx` (7 className occurrences)
- [ ] Replace with Mantine `Paper`, `Stack`, `ScrollArea`

### 3.8 `src/components/NewColumn.tsx` (4 className occurrences)
- [ ] Replace with Mantine `Button`, `TextInput`

### 3.9 `src/components/NewCard.tsx` (3 className occurrences)
- [ ] Replace with Mantine `Button`, `Textarea`

### 3.10 `src/components/EditableText.tsx` (3 className occurrences)
- [ ] Replace with Mantine `TextInput` or inline edit pattern

### 3.11 `src/components/SaveButton.tsx` (1 className occurrence)
- [ ] Replace with Mantine `Button` variant="filled"

### 3.12 `src/components/CancelButton.tsx` (1 className occurrence)
- [ ] Replace with Mantine `Button` variant="subtle"

### 3.13 `src/components/IconLink.tsx` (3 className occurrences)
- [ ] Replace with Mantine `ActionIcon` + `Anchor`

---

## Phase 4: Routes

### 4.1 `src/routes/index.tsx` (15 className occurrences)
- [ ] Replace hero section with Mantine `Container`, `Title`, `Text`
- [ ] Replace buttons with Mantine `Button`
- [ ] Replace layout utilities with `Stack`, `Group`, `Center`

### 4.2 `src/routes/studio.index.tsx` (26 className occurrences)
- [ ] Replace page layout with `Container`
- [ ] Replace header with `Group`, `Title`, `Text`
- [ ] Replace upload button with `FileButton` + `Button`
- [ ] Replace loading spinner with `Loader`
- [ ] Replace empty state with `Center`, `Paper`, `Stack`
- [ ] Replace product grid with `SimpleGrid`
- [ ] Replace product cards with `Card`

**Components to use:**
- `Container` - page wrapper
- `Title`, `Text` - typography
- `FileButton` - file upload
- `Button` - actions
- `SimpleGrid` - product grid
- `Card`, `Card.Section` - product cards
- `Badge` - status indicators
- `Loader`, `Center` - loading states
- `Skeleton` - placeholder loading

### 4.3 `src/routes/studio.$productId.tsx` (140 className occurrences) ⚠️ LARGEST FILE
- [ ] Replace wizard layout with `Stepper` or custom tabs
- [ ] Replace template grid with `SimpleGrid` + masonry CSS
- [ ] Replace generation cards with `Card`
- [ ] Replace modals/panels with `Drawer` or `Modal`
- [ ] Replace checkboxes with `Checkbox.Card`
- [ ] Replace buttons with `Button`, `ActionIcon`
- [ ] Replace loading states with `Skeleton`, `Loader`
- [ ] Replace badges with `Badge`
- [ ] Replace tooltips with `Tooltip`
- [ ] Replace sliders with `Slider`
- [ ] Replace switches with `Switch`

**Key Mantine components needed:**
- `Stepper` or `Tabs` - wizard navigation
- `SimpleGrid` - template/generation grids
- `Card`, `Card.Section` - template/generation cards
- `Image` - with lazy loading
- `Checkbox.Card` - for variation options
- `Drawer` or `Modal` - for panels
- `ActionIcon` - icon buttons
- `Tooltip` - hover info
- `Slider` - variation count
- `Switch` - color adapt toggle
- `Skeleton` - loading placeholders
- `Badge` - status/tags
- `Overlay` - hover effects

### 4.4 `src/routes/admin.tsx` (if exists)
- [ ] Check for Tailwind usage

### 4.5 `src/routes/admin.index.tsx` (11 className occurrences)
- [ ] Replace with Mantine layout components
- [ ] Replace stats with `Paper`, `Text`, `Title`

### 4.6 `src/routes/admin.templates.tsx` (38 className occurrences)
- [ ] Replace upload area with `Dropzone`
- [ ] Replace template grid with `SimpleGrid`
- [ ] Replace cards with `Card`
- [ ] Replace status badges with `Badge`

### 4.7 `src/routes/admin.prompts.tsx` (31 className occurrences)
- [ ] Replace form with Mantine `Textarea`, `Button`
- [ ] Replace layout with `Stack`, `Paper`

### 4.8 `src/routes/boards.$boardId.tsx` (if has Tailwind)
- [ ] Migrate board view components

---

## Phase 5: Utilities & Icons

### 5.1 `src/icons/icons.tsx` (3 className occurrences)
- [ ] Consider using `@tabler/icons-react` (Mantine's recommended icon set)
- [ ] Or keep custom SVGs with Mantine color tokens

---

## Phase 6: Cleanup

### 6.1 Remove Tailwind Artifacts
- [ ] Delete Tailwind config files
- [ ] Remove Tailwind from package.json
- [ ] Remove tailwind-merge usage
- [ ] Remove `app.css` Tailwind imports

### 6.2 Final Testing
- [ ] Test all routes
- [ ] Test responsive behavior
- [ ] Test dark mode (if implementing)
- [ ] Test all interactive components

---

## Mantine Component Cheat Sheet

### Layout
| Tailwind | Mantine |
|----------|---------|
| `flex` | `Flex` or `Group` (horizontal) |
| `flex flex-col` | `Stack` (vertical) |
| `grid` | `SimpleGrid` or `Grid` |
| `container mx-auto` | `Container` |
| `gap-*` | `gap` prop on Flex/Group/Stack |

### Spacing
| Tailwind | Mantine |
|----------|---------|
| `p-4` | `p="md"` |
| `px-6` | `px="lg"` |
| `py-10` | `py="xl"` |
| `m-auto` | `m="auto"` |
| `space-y-4` | `Stack gap="md"` |

### Typography
| Tailwind | Mantine |
|----------|---------|
| `text-4xl font-semibold` | `Title order={1}` |
| `text-lg` | `Text size="lg"` |
| `text-slate-500` | `Text c="dimmed"` |
| `font-medium` | `Text fw={500}` |
| `truncate` | `Text truncate` |

### Colors
| Tailwind | Mantine |
|----------|---------|
| `bg-slate-900` | `bg="dark.9"` or theme color |
| `text-white` | `c="white"` |
| `border-slate-200` | `bd="1px solid gray.3"` |

### Interactive
| Tailwind | Mantine |
|----------|---------|
| `hover:bg-slate-100` | Mantine handles via component props |
| `transition` | Built into Mantine components |
| `cursor-pointer` | Built into interactive components |
| `disabled:opacity-50` | `disabled` prop on Button |

### Components
| Custom/Tailwind | Mantine |
|-----------------|---------|
| Custom card | `Card` |
| Custom button | `Button` |
| Custom input | `TextInput` |
| Custom modal | `Modal` |
| Custom dropdown | `Select` or `Menu` |
| Custom tabs | `Tabs` |
| Loading spinner | `Loader` |
| Toast notifications | `Notifications` |
| File upload | `FileButton` or `Dropzone` |

---

## Progress Summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Setup | Not Started | 0% |
| Phase 2: Root Layout | Not Started | 0% |
| Phase 3: Components | Not Started | 0% |
| Phase 4: Routes | Not Started | 0% |
| Phase 5: Utilities | Not Started | 0% |
| Phase 6: Cleanup | Not Started | 0% |

**Overall Progress: 0%**

---

## Notes

- `studio.$productId.tsx` is the largest file (140 className occurrences) and should be broken into smaller components during migration
- Consider creating a shared theme configuration for consistent styling
- Mantine has built-in dark mode support - consider adding this during migration
- The masonry layout in studio will need custom CSS since Mantine doesn't have a built-in masonry component
