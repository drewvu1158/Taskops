---
name: Lumina Velocity
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#ccc3d8'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d2bbff'
  primary: '#d2bbff'
  on-primary: '#3f008e'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#732ee4'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb2b7'
  on-tertiary: '#67001b'
  tertiary-container: '#c81a42'
  on-tertiary-container: '#ffdedf'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
    letterSpacing: '0'
  label-uppercase:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar-width: 260px
  container-max: 1440px
  gutter: 20px
---

## Brand & Style

The visual identity of the design system is centered on "Precision Performance." It is engineered for power users who require high-density information without cognitive overload. The style is a fusion of **Corporate Modern** and **Glassmorphism**, utilizing deep atmospheric depths to make data-driven components feel prioritized and urgent. 

The aesthetic evokes a sense of "Mission Control"—reliable, high-tech, and decisive. By leveraging a high-contrast dark palette, the system ensures that status indicators and action items remain the focal point, reducing the friction between data perception and task execution.

## Colors

The color palette utilizes a "Depth-First" approach. The background is a near-black navy to maximize contrast for foreground elements. 

*   **Primary (Indigo-Purple):** Reserved for primary actions, active sidebar states, and brand-critical touchpoints.
*   **Secondary (Electric Cyan):** Used primarily for "In Progress" states and navigational highlights to provide a cool, calm counter-balance to the purple.
*   **Accents:** Vibrant Rose (#F43F5E) is used for high-priority alerts or "Idle/Stopped" states, while Emerald (#10B981) represents completion.
*   **Neutrals:** Slate and Zinc tones are used for secondary text and borders to maintain a sophisticated, non-distracting environment.

## Typography

This design system utilizes **Inter** exclusively to ensure maximum legibility across dense data tables and small task labels. 

The typographic hierarchy is strictly enforced:
*   **Headlines** use a semi-bold or bold weight with tighter letter spacing to create a sense of structural authority.
*   **Body Text** maintains a generous line height (1.5) to ensure readability during long work sessions.
*   **Labels** use an uppercase style with increased tracking for secondary meta-data and category headers, distinguishing them clearly from actionable content.

## Layout & Spacing

The layout follows a **Fluid Grid** philosophy within a contained viewport. 
*   **Sidebar Navigation:** A fixed-width left rail (260px) provides the structural anchor.
*   **Dashboard Grid:** A 12-column grid system with 20px gutters handles the distribution of task cards.
*   **Vertical Rhythm:** Built on a 4px baseline, ensuring all components (cards, progress bars, buttons) align perfectly to a consistent vertical scale.
*   **Padding:** Task cards utilize "Comfortable" internal padding (24px) to balance the high-density information they contain.

## Elevation & Depth

Hierarchy is achieved through **Tonal Layering** and **Subtle Luminescence** rather than traditional heavy shadows.

*   **Level 0 (Base):** The darkest color (#020617), acting as the canvas.
*   **Level 1 (Cards/Sidebar):** Raised surface using #1E293B. Borders are 1px solid with low opacity (10-15%) to define edges without adding visual weight.
*   **Level 2 (Modals/Popovers):** Higher contrast surfaces with a subtle 20px blur backdrop (glassmorphism) to maintain context while focusing user attention.
*   **Active State Glow:** When a task or button is focused, it emits a soft, outer glow (5px blur) tinted with the Primary or Secondary accent color to denote activity.

## Shapes

The design system employs a **Rounded** (Level 2) corner language to soften the high-contrast professional look.
*   **Standard Components:** 0.5rem (8px) radius for buttons, input fields, and task cards.
*   **Progress Bars:** Fully rounded (capsule style) to differentiate data indicators from structural containers.
*   **Icons/Chips:** 4px radius for smaller utility elements to maintain precision.

## Components

### Task Cards
Cards are the primary data unit. They feature a 1px border (#334155) and a semi-transparent background. Header sections should clearly display the task title in `headline-md`, with meta-tags (chips) floating in the top right.

### Progress Bars
Progress bars use a dual-track system: a dark "track" background with a vibrant gradient fill (e.g., Secondary to Primary). For "In Progress" tasks, the fill should include a subtle animated shimmer to indicate active movement.

### Sidebar Navigation
The sidebar is high-contrast, using the deep purple as an accent background for the active state. Icons should be stroke-based (2px width) for clarity against the dark background.

### Buttons
*   **Primary Action:** Solid fill using the Primary color with white text.
*   **Secondary/Ghost:** 1px border using the Secondary color with matching text color.
*   **Interaction:** On hover, buttons should increase in brightness by 10% and apply a soft glow.

### Status Chips
Status chips (e.g., "Active", "Idle", "Completed") use a low-opacity background of the status color with a fully opaque dot indicator to ensure the status is scannable at a glance.