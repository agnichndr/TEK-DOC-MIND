---
description: UI guidance for creating or updating module screens with consistent create, edit, delete, and themed dropdown patterns.
---

# UI Module Guidance

Use this guide whenever creating a new UI module or modifying an existing one.

## Core UI Rules

1. Every module that manages a list of items must have two create actions:
   - One create button near the top of the screen or section.
   - One create button near the bottom so users can create an item without scrolling back up.

2. If the list grows long, keep a visible create action near the bottom as an easy-access action.

3. When there are no items, the screen should show a clear empty-state experience with a create action.
   - Do not leave the page looking blank or incomplete.
   - Use a friendly empty-state message and a primary action to create the first item.

4. Each item in the list should support:
   - Edit action
   - Delete action
   - Clicking the card body or main content area should open the item detail or edit page, not just the edit action.
   - Clear visual affordances so users can understand what each action does

5. Every list-based module should support switching between card view and table view.
   - Provide a visible view toggle in the list toolbar or controls.
   - Keep the same core actions and data available in both views.
   - Ensure the selected view is easy to understand and consistent across the module.

6. Every module should include search UI options.
   - Provide a visible search input or search affordance for list-based modules.
   - Search should help users quickly find items without needing to scan the full list.
   - If the module is more complex, support filtering or advanced search controls as needed.

7. Dropdowns must use the application’s themed UI style.
   - Do not rely on the browser or OS default dropdown appearance.
   - Keep dropdowns visually consistent with the app’s colors, spacing, borders, and focus states.

## Expected Behavior

- New modules should feel easy to use from the first interaction.
- Existing modules should be improved so users can create, edit, and delete items without friction.
- The layout should remain consistent even when the item list becomes large.

## Implementation Guidance

- Place the top create action in a prominent header or toolbar area.
- Place the bottom create action near the end of the list or in a sticky footer area when appropriate.
- For empty states, show a centered or well-structured message with a primary CTA.
- Make list cards fully clickable for navigation to item detail or edit views, while keeping explicit Edit and Delete actions available.
- Provide a clear card/table view switcher for list-based modules and preserve the same functionality in both modes.
- Use the app’s design system and component styling for buttons, dialogs, menus, and dropdowns.
- Keep actions accessible, readable, and aligned with the existing UI language of the product.

## Design Intent

The goal is to make every module feel approachable and efficient:
- users should always have a way to create something,
- there should be clear paths for editing and deleting items,
- and all interactive elements should feel native to the product rather than to the operating system.
