# Vue 3 + Tailwind CSS Review Criteria

## Composition API

**Composition API with `<script setup>` is the required pattern** for all Vue components in this project.

- **All components must use `<script setup>`** — this is not a preference, it's the standard.
- **Auto-imports are configured** (`@vueuse/core`, `@vueuse/router`, Vue functions) — do not explicitly import `ref`, `computed`, `watch`, `onMounted`, etc.
  ```vue
  <!-- ✅ CORRECT: Auto-imported, uses ref and computed -->
  <script setup>
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  </script>

  <!-- ❌ WRONG: Composition API with Options API -->
  <script>
  export default {
    data() { return { count: 0 } }
  }
  </script>
  ```
- **`ref` vs `reactive`**: Use `ref` for primitives and single values. Use `reactive` for objects where destructuring reactivity is important. Don't mix without reason.
- **Computed properties**: Must be side-effect-free. Flag any `computed` that does async work or mutates state — move to `watch` or a function.

## Props and Emits

- **Props must have type definitions**. Flag untyped props.
  ```vue
  <!-- GOOD: Typed props with validation -->
  <script setup>
  defineProps({
    user: {
      type: Object,
      required: true,
      validator: (val) => val.id && val.username
    }
  })
  </script>

  <!-- BAD: Untyped or missing validator -->
  <script setup>
  defineProps(['user']) // ❌ untyped
  </script>
  ```
- **Do not mutate props directly** — use emits to notify parent or create a local reactive copy if needed.
- **Use `defineEmits` with type definitions** in `<script setup>`:
  ```vue
  <script setup>
  const emit = defineEmits(['update:user', 'delete'])
  </script>
  ```
- **Avoid prop drilling** beyond 2-3 levels — use `provide/inject` for deeply nested data or consider Pinia store.

## Template Hygiene

- **`v-if` vs `v-show`**: `v-if` for rarely-toggled or conditional renders. `v-show` for frequent visibility toggles.
- **`v-for` always needs `:key`** — and the key should be a stable, unique ID, not the array index (unless list is static and never reordered).
- **`v-if` + `v-for` on same element**: Flag this — it's an anti-pattern. Wrap in a `<template>` or filter the array upstream.
- Avoid putting logic directly in templates. Extract to computed or methods.
- Event handlers in templates should be method references or inline one-liners only (no multi-line logic in `@click`).

## Component Design

- **Use Vuestic UI components** for common UI patterns instead of building custom replacements. See [Vuestic Docs](https://vuestic.dev/) and [UI Coding Standards](../../../docs/ui/coding_standards.md) for component usage.
  ```vue
  <!-- GOOD: Use Vuestic components -->
  <VaButton color="success" size="medium">Create</VaButton>
  <VaInput placeholder="Search" icon="search" />

  <!-- AVOID: Custom button implementation -->
  <button class="custom-button">Create</button>
  ```
- Components should do **one thing well**. If a component exceeds ~250 lines, question whether it should be split.
- **Composables** (`use*.js`) should be pure and reusable. Flag composables that directly reference `store` or `router` without injection — makes them hard to test and reuse.
- Use `defineExpose` sparingly. Prefer emitting events over exposing refs to parents.

## Reactivity Gotchas

- Flag direct array mutation (e.g., `arr[0] = x`) — use `arr.splice(0, 1, x)` or replace the ref.
- Flag destructuring reactive objects outside of `toRefs` — reactivity is lost.
- Flag `async` in `setup()` without understanding that it breaks the component's synchronous setup expectations (requires `<Suspense>`).

## Async and Data Fetching

- Data fetching in components should handle loading, error, and empty states.
- Prefer composables for reusable fetch logic (`useFetch`, `useUsers`, etc.).
- Cancel or ignore stale requests when component unmounts (use `AbortController` or check `isMounted`).
- **Use `debouncedWatch` from `@vueuse/core` for reactive async operations** (e.g., form previews, search). It prevents race conditions and avoids manual setTimeout cleanup.
  ```javascript
  debouncedWatch([input, filters], async () => {
    results.value = await api.search(input.value, filters.value)
  }, { debounce: 300 })
  ```

## Tailwind CSS

- **No magic numbers**: Avoid arbitrary values like `w-[347px]` unless there's a genuine reason. Prefer scale values.
- **Responsive prefixes**: Mobile-first (`sm:`, `md:`, `lg:`). Check that responsive classes are additive, not overriding unexpectedly.
- **Dark mode**: If the project uses dark mode (`dark:`), check that new UI elements have dark variants.
- **Duplication**: If the same Tailwind string appears 3+ times, suggest extracting to a component or using `@apply` in a CSS file.
- **Accessibility classes**: Check for `focus:`, `focus-visible:`, `sr-only` where appropriate. Interactive elements need visible focus states.
- **Don't mix Tailwind with scoped `<style>` for the same element** — pick one approach per component.
- Flag `!important` overrides (`!text-red-500`) — usually a sign of specificity problems worth fixing properly.

## Performance

- `v-for` with complex child components and no `key` (or index key) causes unnecessary re-renders.
- Expensive computations in templates (not wrapped in `computed`) re-run on every render.
- Images should use lazy loading (`loading="lazy"`) unless above the fold.
- Flag unused imports (`defineProps`, components registered but not used in template).
