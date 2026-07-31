---
description: Reusable guidance for adding an interactive product tour to any UI screen in TEK-DOK-MIND.
---

# Product Tour Skill

Use this skill whenever you need to add a guided onboarding experience to a page, panel, or form in this project.

## When to Use

Apply this skill when a UI surface should explain itself through:
- a step-by-step guided tour,
- contextual spotlighting around important elements,
- progress indicators and tooltips,
- skip/back/next controls,
- one-time display behavior for first visits or authenticated sessions.

## Select the Right Tour Scope

Before implementing, choose one of the two supported scopes:

### 1. Module-level tour
Use this when the onboarding should explain a logical product capability that may appear across multiple screens or contexts.
Examples:
- Project Vault onboarding
- Repository Sources onboarding
- Agent configuration onboarding

Guidance:
- define the tour around the module’s core workflow,
- keep the steps reusable across related views,
- place the tour component near the module entry point,
- allow the same logic to be reused by different routes if needed.

### 2. Route-specific tour
Use this when the tour is meant for one specific UI route only.
Examples:
- the landing page,
- the project workspace page,
- a dedicated settings route,
- an isolated form flow.

Guidance:
- scope the steps to the current route’s unique UI elements,
- bind the tour to that route’s layout and components,
- keep the tour logic local to that route unless the experience should be shared.

### Choosing between them
- Use a module-level tour when the goal is to teach the product capability itself.
- Use a route-specific tour when the goal is to explain the layout or workflow of a single screen.
- If the feature is cross-cutting but still route-focused, start with route-specific and later promote it to module-level if reused.

## Design Goals

The tour should feel like a native part of the product, not a detached widget. It should:
- highlight the most important controls in the current view,
- keep the copy concise and action-oriented,
- preserve the app’s monochrome editorial style,
- avoid interrupting the user unnecessarily,
- show only once per session or once per authenticated experience.

## Implementation Pattern

### 1. Add stable tour anchors

Expose the target UI elements with explicit IDs or selectors that the tour can reliably target.

Use patterns like:
- `id="tour-brand"`
- `id="tour-hero"`
- `id="tour-workspace"`
- `id="tour-create-form"`

These anchors should be added to the actual UI elements that the tour should explain.

### 2. Create the tour component for the chosen scope

Create the tour component based on the selected scope:
- For a module-level tour, build the component so it can be mounted from multiple entry points and reused by related views.
- For a route-specific tour, keep the component close to the route and tailor the steps to the route’s layout.

If the tour is intended for a module, define the steps around the module’s primary actions and milestones. If it is intended for a route, define the steps around the route’s visible UI hierarchy and primary journey.

Build the product tour as a client component so it can:
- measure DOM elements,
- render an overlay,
- create a spotlight around the active target,
- render a tooltip card with progress and actions.

A typical component should support:
- `steps[]` with `selector`, `title`, `description`, and `placement`
- an `isOpen` state for the active tour overlay
- `activeStep` state for step tracking
- a `targetRect` state for spotlight positioning
- skip/next/back controls
- a progress bar based on step index

### 3. Respect one-time display rules

The tour should not annoy returning users. Use browser storage to remember whether the tour has already been shown.

Recommended behavior:
- use `sessionStorage` for one-time display in the current browser session,
- use `localStorage` for a persistent “already seen” state after completion or skip,
- if the app has a project session cookie, scope the tour state separately for authenticated users so it is not repeated in the same login context.

Suggested storage keys:
- `tek-doc-tour-session-seen-guest`
- `tek-doc-tour-session-seen-authenticated`
- `tek-doc-tour-seen`
- `tek-doc-tour-seen-authenticated`

### 4. Keep the UI visually aligned with the product

Use the same visual vocabulary as the rest of the app:
- black/white/gray palette,
- crisp borders and light shadows,
- editorial typography for headings,
- simple button treatments,
- restrained motion and overlay intensity.

Avoid heavy third-party packages when a lightweight custom overlay is sufficient.

### 5. Make the tour reusable

When applying the pattern to another screen:
- define a new `steps` array specific to that screen or module,
- map each step to the correct DOM selector,
- adjust placement (`top`, `bottom`, `left`, `right`) depending on the layout,
- keep the copy concise and focused on user intent,
- decide whether the tour should remain route-scoped or be promoted to module-scoped when the experience is reused.

## Recommended Structure

A reusable implementation should follow this composition:

```tsx
export function ProductTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // decide whether to show based on storage state
  }, []);

  useEffect(() => {
    // measure current target and update spotlight/tooltip position
  }, [activeStep, isOpen]);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Start guided tour</button>
      {isOpen ? <TourOverlay /> : null}
    </>
  );
}
```

## Project-Specific Notes

For TEK-DOK-MIND, the current implementation is already aligned with:
- the landing page hero experience,
- the workspace panel,
- the private project flow,
- the monochrome product aesthetic.

When adapting it elsewhere, preserve these principles:
- anchor the tour to the real user journey,
- keep the first step focused on orientation,
- make the step text explain “what this area does” rather than just “what is here”.

## Checklist for New Tours

Before finalizing a new product tour, verify:
- the selected scope is correct: module-level or route-specific,
- all target selectors exist in the UI,
- the tooltip appears near the correct element,
- the overlay does not block essential interactions unexpectedly,
- skip/back/next actions work properly,
- one-time display logic prevents repeated interruptions,
- the experience still feels native to the product.
