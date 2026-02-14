# Changelog - KivotOS Frontend Updates

## 2025-02-14

### Removed
- **Deleted custom cursor system** (theo yêu cầu)
  - Removed `styles/cursor.css`
  - Removed `assets/js/cursor.js`
  - Removed cursor references from `apt.html`

### Added
- **Enhanced theming system** với CSS variables
  - `styles/themes/catppuccin-latte.css` - Light theme
  - `styles/themes/catppuccin-mocha.css` - Dark theme
  - `styles/base.css` - Base styles
  - `styles/components.css` - Component styles
  - `styles/page.css` - Page-specific styles
  - `styles/aurora.css` - Aurora background effect

- **Aurora/Borealis background effect**
  - 3-layer animated gradient background
  - CSS-only implementation with blur and animations
  - Theme-aware colors (mauve, pink, blue)

- **Text selection control**
  - Disabled text selection globally (`user-select: none`)
  - Enabled selection only in code blocks (`user-select: text`)

### Fixed
- **Theme toggle button colors**
  - Fixed moon/sun SVG icons using `filter: invert(1)` in dark mode
  - Removed `filter: invert(1)` from slider to prevent color inversion

- **Card layout alignment**
  - Equalized heights of "Quick Setup" and "Available Packages" cards
  - Removed `margin-bottom` from `.quick-setup`
  - Adjusted `.package-grid` min-height to 120px
  - Added flex layout for consistent card heights

- **Package grid styling**
  - Removed fixed `max-height` constraint
  - Added `margin-top: 0.5rem` to reduce gap from title
  - Styled loading/error messages with flex centering

### Modified Files
- `index.html` - Added theme toggle, aurora background, external JS
- `apt.html` - Added aurora background, removed cursor references
- `assets/js/main.js` - Extracted from inline script
- `assets/js/apt.js` - Theme management
- `styles/components.css` - Theme toggle, cards, package grid styles
- `styles/page.css` - Quick setup, package card layouts

### Assets Added
- `assets/moon.svg` - Dark mode icon
- `assets/sun.svg` - Light mode icon
