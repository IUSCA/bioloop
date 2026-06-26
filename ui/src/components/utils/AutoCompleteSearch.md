# AutoCompleteSearch Component Documentation

## Overview

`AutoCompleteSearch.vue` is a highly customizable Vue 3 autocomplete component that provides search functionality with recent searches persistence, suggested searches, and real-time autocomplete results. The component uses v-model for two-way binding and supports both string and object results with customizable value extraction.

## Interaction Flow

1. Input focus → dropdown shows **Recent** + **Suggested**.
2. Typing → fetch autocomplete → display results with loading states.
3. User may:
   * Select a suggestion (click/enter) → input updates, event emitted, saved to `localStorage` (if enabled).
   * Remove recent search via "X" button.
   * Clear all via header button.
   * Clear input using the clear button → emits clear event.
4. User-defined slots can override item rendering with access to item data and query context.

---

## Usage Examples

### Basic Usage with v-model

```vue
<template>
  <AutoCompleteSearch
    v-model="searchQuery"
    :autocomplete-fn="searchFunction"
    placeholder="Search products..."
    @select="handleSelect"
    @submit="handleSubmit"
    @clear="handleClear"
  />
</template>

<script setup>
import { ref } from 'vue'

const searchQuery = ref('')

const searchFunction = async (query) => {
  const response = await fetch(`/api/search?q=${query}`)
  const data = await response.json()
  return data.results
}

const handleSelect = (term) => {
  console.log('Selected:', term)
}

const handleSubmit = (term) => {
  console.log('Submitted:', term)
}

const handleClear = () => {
  console.log('Input cleared')
}
</script>
```

### With Recent Searches & Suggestions

```vue
<template>
  <AutoCompleteSearch
    v-model="searchTerm"
    :autocomplete-fn="searchFunction"
    :suggested="['Popular item', 'Trending search', 'Best seller']"
    storage-key="product_searches"
    :max-recent="10"
    placeholder="What are you looking for?"
    :show-loading="true"
    @select="handleSelect"
  />
</template>
```

### Working with Object Results

```vue
<template>
  <AutoCompleteSearch
    v-model="selectedUserId"
    :autocomplete-fn="searchUsers"
    value-by="id"
    placeholder="Search users..."
    @select="handleUserSelect"
  >
    <template #result-item="{ item, index, query }">
      <div class="flex items-center gap-3">
        <img :src="item.avatar" class="w-6 h-6 rounded-full" />
        <div>
          <div class="font-medium">{{ item.name }}</div>
          <div class="text-xs text-gray-500">{{ item.email }}</div>
        </div>
      </div>
    </template>
  </AutoCompleteSearch>
</template>

<script setup>
const selectedUserId = ref('')

const searchUsers = async (query) => {
  const response = await fetch(`/api/users/search?q=${query}`)
  const data = await response.json()
  return data.users // Returns array of user objects
}

const handleUserSelect = (userId) => {
  console.log('Selected user ID:', userId)
}
</script>
```

### Custom Rendering with Slots

```vue
<template>
  <AutoCompleteSearch
    :autocomplete-fn="searchFunction"
    storage-key="my_searches"
  >
    <template #recent-item="{ item, index }">
      <div class="flex items-center gap-3">
        <i-mdi:clock-outline class="text-purple-500" />
        <span class="font-medium">{{ item }}</span>
        <span class="text-xs bg-purple-100 px-2 py-1 rounded">Recent</span>
      </div>
    </template>

    <template #suggested-item="{ item, index }">
      <div class="flex items-center gap-3">
        <i-mdi:star class="text-yellow-500" />
        <span class="font-medium">{{ item }}</span>
        <span class="text-xs bg-yellow-100 px-2 py-1 rounded">Suggested</span>
      </div>
    </template>

    <template #result-item="{ item, index, query }">
      <div class="flex items-center gap-3">
        <i-mdi:magnify class="text-blue-500" />
        <span>{{ item }}</span>
        <span class="text-xs text-gray-500">{{ item.length }} chars</span>
      </div>
    </template>
  </AutoCompleteSearch>
</template>
```

### Without Recent Searches

```vue
<template>
  <!-- No storageKey provided = no recent searches -->
  <AutoCompleteSearch
    v-model="searchQuery"
    :autocomplete-fn="searchFunction"
    :suggested="['Quick search', 'Popular items']"
    :show-loading="false"
    placeholder="Search without history..."
    initial-value="Pre-filled search"
  />
</template>
```

### Disabling Loading States

```vue
<template>
  <AutoCompleteSearch
    v-model="searchQuery"
    :autocomplete-fn="searchFunction"
    :show-loading="false"
    placeholder="Search with instant results..."
  />
</template>
```

---

### Implementation Notes

### V-Model Support

* The component supports v-model for two-way data binding
* Automatically updates the bound value when selections are made
* Can be initialized with an `initialValue` prop

### Object Handling

* When `autocompleteFn` returns objects, use the `valueBy` prop to specify which property to extract
* Set `valueBy="object"` to work with entire objects instead of extracted values
* Recent searches will store the extracted string values, not full objects

### Performance Considerations

* Uses VueUse's `useDebounceFn` for efficient API calls
* Automatic loading states prevent UI flicker (can be disabled with `showLoading={false}`)
* Results are limited by `maxAutocomplete` to prevent DOM bloat
* localStorage operations are handled efficiently by VueUse

### Accessibility Features

* Full keyboard navigation with visual feedback
* Semantic HTML structure with proper ARIA attributes
* Screen reader friendly labels and focus management
* Input automatically blurs after selection to prevent unwanted dropdown reopening
* Escape key support for closing dropdown

### Browser Compatibility

* Supports all modern browsers
* Graceful fallback for localStorage failures
* Works with or without localStorage support
* Automatic prevention of browser autocomplete conflicts

---

## UI Specs / Requirements

### General

* **Component name**: `AutoCompleteSearch.vue`
* **Framework**: Vue 3 (`<script setup>`)
* **Styling**: TailwindCSS
* **Dark mode**: Uses `dark:` qualifiers throughout
* **Accessibility**:
  * Full keyboard navigation support (tab, arrow keys, enter, escape)
  * Click outside to close dropdown
  * Input automatically blurs after selection to prevent unwanted reopening
  * Screen reader friendly with semantic HTML

---

### Search Bar Behavior

1. **Idle State**

   * Input has placeholder `"Search..."`.
   * Rounded, bordered, shadowed container.
   * Dark mode background: `dark:bg-gray-900`.

2. **On Focus**

   * Dropdown opens under input.
   * Displays **Recent Searches** (if any) and **Trending Searches**.
   * Each section labeled with small headers.

3. **On Typing**

   * Debounced fetch (configurable, default 250ms).
   * Shows loading state (if `showLoading` is true).
   * Displays autocomplete results (from `autocompleteFn`).
   * If no results: row with `"No results found"` message with search icon.
   * Results are limited by `maxAutocomplete` setting.

4. **On Blur**

   * Escape or outside click closes dropdown.

5. **Selection Behavior**

   * Clicking or pressing Enter on a row:
     * Fills input with selected term (or extracted value if object).
     * Emits `@select="value"`.
     * Persists to **recent searches** (localStorage) if enabled.
     * Automatically blurs input to prevent dropdown reopening.
   * Pressing Enter in input (without selection) emits `@submit="value"`.
   * Clear button emits `@clear` event and clears the input.

---

### Recent Searches Persistence

* Recent searches stored in `localStorage` under a component-specific key (e.g., `"autocomplete_recent"`).
* Deduplicate terms.
* Cap at `maxRecent` (default: 5).
* **Clear Options**:

  * Each recent search row has an “X” icon/button to remove individually.
  * Section header includes a “Clear All” action.
* Clearing updates both local state and `localStorage`.

---

### Dropdown Layout

* Width matches input field.
* Styled container:

  * Rounded corners, shadow.
  * Background: `bg-white dark:bg-gray-800`.
* Hover effect: `bg-gray-100 dark:bg-gray-700`.

---

### Slots (Customization)

The component provides flexible customization through named slots:

* **`recent-item`** – Customize recent search row rendering
  * Props: `{ item, index }`
* **`suggested-item`** – Customize suggested search row rendering  
  * Props: `{ item, index }`
* **`result-item`** – Customize autocomplete result row rendering
  * Props: `{ item, index, query }`

All slots provide access to the item data and contextual information for custom rendering. The default fallback renders items as plain text with appropriate icons.

---

## Component API

### Model

The component supports v-model for two-way data binding:

```vue
<AutoCompleteSearch v-model="searchQuery" />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `suggested` | `Array<string>` | `[]` | Static suggested search terms |
| `autocompleteFn` | `Function` | `null` | Async function: `(query: string) => Promise<string[] \| object[]>` |
| `maxRecent` | `Number` | `5` | Maximum number of recent searches to store |
| `maxAutocomplete` | `Number` | `10` | Maximum number of autocomplete results to display |
| `storageKey` | `String` | `''` | localStorage key for recent searches (empty = disabled) |
| `placeholder` | `String` | `'Search...'` | Input placeholder text |
| `recentIcon` | `String` | `'mdi:history'` | Icon for recent search items |
| `suggestedIcon` | `String` | `'mdi:lightbulb-on-outline'` | Icon for suggested search items |
| `debounceMs` | `Number` | `250` | Debounce delay for autocomplete requests |
| `showLoading` | `Boolean` | `true` | Whether to show loading state during autocomplete |
| `initialValue` | `String` | `''` | Initial value for the input field |
| `valueBy` | `String` | `'id'` | Property to extract from objects (use `'object'` for full object) |

### Emits

The component emits the following events to communicate user interactions to parent components:

#### `select`

**Payload:** `term: string`

**Trigger:** User selects an item from the dropdown by:
- Clicking on a recent search, suggested search, or autocomplete result
- Pressing Enter while an item is highlighted via keyboard navigation

**Significance:** Indicates that the user has selected a specific search term. This is the primary event for capturing user selections. The parent component should use this to:
- Execute a search or apply the selected filter
- Navigate to results based on the selection
- Track user interactions for analytics

**Example:**
```vue
@select="(term) => performSearch(term)"
```

---

#### `submit`

**Payload:** `term: string` (trimmed)

**Trigger:** User presses Enter in the input field without selecting an item from the dropdown (i.e., `highlightIndex` is `null`)

**Significance:** Indicates the user wants to submit their custom query string (not from predefined suggestions). Use this when you want to distinguish between selections from the dropdown vs. free-form user input.

**Example:**
```vue
@submit="(term) => executeCustomSearch(term)"
```

---

#### `clear-recent`

**Payload:** `term?: string` (optional)
- If `term` is provided: specific string that was removed
- If `term` is undefined/omitted: all recent searches were cleared

**Trigger:**
- User clicks the "X" icon next to a recent search item → emits with specific `term`
- User clicks the "Clear All" button in the Recent Searches section → emits without `term`

**Significance:** Communicates changes to the recent searches history. Use this to:
- Sync recent searches with backend storage (if you maintain server-side history)
- Update parent component state that tracks user history
- Trigger cleanup or analytics logging

**Examples:**
```vue
@clear-recent="(term) => {
  if (term) {
    console.log('Removed single recent search:', term)
  } else {
    console.log('Cleared all recent searches')
  }
}"
```

---

#### `clear`

**Payload:** None (no arguments)

**Trigger:** User clicks the clear button (X icon) on the input field itself to empty the input

**Significance:** Indicates the user wants to completely reset the search input. Typically used for:
- Clearing search results on the parent page
- Resetting filters
- Triggering UI state reset

**Example:**
```vue
@clear="() => {
  results = []
  appliedFilters = null
}"
```

---

### Event Handling Summary

| Event | When | What to do | Example |
|-------|------|-----------|---------|
| `select` | User picks from dropdown | Perform search/filter with the term | Execute API call, navigate to results |
| `submit` | User presses Enter (no selection) | Handle custom query | Execute search with user's exact input |
| `clear-recent` | User removes recent items | Sync history state | Update localStorage or backend |
| `clear` | User clicks input clear button | Reset search UI | Clear results, reset filters |

---

## Component State

* `query: string` – input binding (v-model).
* `isOpen: boolean` – dropdown visibility state.
* `recent: string[]` – recent searches synced with `localStorage`.
* `results: string[] | object[]` – autocomplete results from API.
* `highlightIndex: number | null` – currently highlighted item for keyboard navigation.
* `loading: boolean` – loading state for autocomplete requests.

---
