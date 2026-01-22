# Preferred Tech Stack & Implementation Rules

When generating code or UI components for this brand, you **MUST** strictly adhere to the following technology choices.

## Core Stack
* **Framework:** Vanilla HTML5 / JavaScript (ES6+)
* **Styling Engine:** Vanilla CSS3 (Custom Properties / Variables)
* **Component Library:** None (Custom implementation)
* **Icons:** SVG or Font Libraries as needed

## Implementation Guidelines

### 1. CSS Usage
* Use CSS Custom Properties (Variables) defined in `:root` for all colors and fonts.
* Utilize the color tokens defined in `design-tokens.json` (mapped to CSS variables).
* **Responsive Design:** Mobile-first approach or Desktop-first (as per existing `styles.css`, looks Desktop-centric with `clamp` and `vh`).

### 2. Component Patterns
* **Buttons:** Use `.cta-solid` for primary actions (White bg, Black text) and `.cta-glass` for secondary (Glassmorphism).
* **Layout:** Use Flexbox and CSS Grid.
* **Animations:** Use `transition-smooth` variable and keyframes like `fadeInUp`.

### 3. Forbidden Patterns
* Do NOT use Tailwind CSS (unless explicitly migrated).
* Do NOT use Bootstrap.
* Do NOT introduce build tools (Webpack/Vite) unless requested.
