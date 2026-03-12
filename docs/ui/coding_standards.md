# UI Coding Standards

This document defines coding standards for the Bioloop UI project. These standards ensure consistency, maintainability, and performance across the codebase. Use this as a reference when developing UI features and components.

## Table of Contents
1. [Styling & Layout](#styling--layout)
2. [Icons](#icons)
3. [Components](#components)
4. [Utility Components](#utility-components)
5. [Shared Services](#shared-services)
6. [Imports & Conventions](#imports--conventions)
7. [Best Practices](#best-practices)

---

## Styling & Layout

### Use Tailwind CSS Over Custom Styles
- **Always** use Tailwind CSS utility classes instead of writing custom CSS or inline styles.
- Tailwind provides a consistent, scalable design system with comprehensive utilities for layout, spacing, sizing, and typography.
- Custom styles should only be used in exceptional cases where Tailwind cannot meet the requirement.

**Examples:**
```vue
<!-- ✅ GOOD: Use Tailwind utilities -->
<div class="flex items-center justify-between gap-4 px-6 py-3">
  <h1 class="text-xl font-bold">Title</h1>
  <button class="rounded-lg bg-blue-500 px-4 py-2 text-white">Click me</button>
</div>

<!-- ❌ BAD: Custom CSS or inline styles -->
<div style="display: flex; justify-content: space-between; padding: 12px 24px;">
  <h1 style="font-size: 20px; font-weight: bold;">Title</h1>
</div>
```

### Dark Mode Support
- Whenever you use a Tailwind color class, **always include a complementary dark mode variant** for accessibility.
- Use the `dark:` prefix to specify dark mode colors.
- Choose colors that maintain good contrast and readability in both light and dark modes.

**Examples:**
```vue
<!-- ✅ GOOD: Light and dark colors -->
<p class="text-gray-700 dark:text-gray-200">Regular text</p>
<div class="bg-red-100 dark:bg-red-900">Alert box</div>
<span class="text-red-700 dark:text-red-300">Error message</span>

<!-- ❌ BAD: Missing dark mode variant -->
<p class="text-gray-700">This will be hard to read in dark mode</p>
```

---

## Icons

### Icon Libraries
The project supports two icon approaches:

#### 1. Material Design Icons (MDI)
Use iconify icons with the `mdi-` prefix for generic components and standalone uses.

**Format:** `<i-mdi-{icon-name} class="..." />` or `<Icon icon="mdi-{icon-name}" class="..." />`

**Example:**
```vue
<!-- Simple icon -->
<i-mdi-alert class="text-red-500 dark:text-red-300" />

<!-- Icon with custom sizing -->
<Icon icon="mdi-check-circle" class="text-2xl text-green-600 dark:text-green-400" />
```

#### 2. Material Icons (Material Design Components)
Use Material Icons only when needed for Vuestic UI components via the `icon` prop. This is a separate icon library optimized for Vuestic.

**Example:**
```vue
<!-- ✅ GOOD: Using Material Icons with Vuestic -->
<VaButton color="success" icon="add">Create</VaButton>
<VaInput placeholder="Search" icon="search" />

<!-- Reference: https://fonts.google.com/icons?icon.set=Material+Icons -->
```

**Guidelines:**
- Use MDI for standalone icons or custom icon components
- Use Material Icons when working with Vuestic UI component props
- Ensure icons have appropriate color and dark mode variants

---

## Components

### Use Vuestic UI Components
The project uses **Vuestic UI** for consistent, accessible UI patterns. Use Vuestic components wherever applicable instead of building custom replacements.

**Commonly Used Components:**
- `<VaButton>` — For actions and submissions
- `<VaInput>` — For text input
- `<VaSelect>` — For dropdowns
- `<VaCheckbox>` — For toggles
- `<VaSwitch>` — For binary toggles
- `<VaCard>` — For content containers
- `<VaModal>` — For dialogs
- `<VaDataTable>` — For tabular data

**Examples:**
```vue
<!-- ✅ GOOD: Using Vuestic components with props -->
<template>
  <VaButton 
    color="primary" 
    size="large"
    icon="add"
  >
    Create Item
  </VaButton>
  
  <VaInput 
    v-model="searchQuery"
    placeholder="Search items..."
    icon="search"
  />
  
  <VaSelect 
    v-model="selectedFilter"
    :options="filterOptions"
    label="Filter by status"
  />
</template>

<!-- ❌ BAD: Not using Vuestic components -->
<button class="custom-button">Create Item</button>
<input type="text" class="custom-input" />
```

### Prefer component props over custom styling
- Use Vuestic component props like `color`, `size`, `variant`, and `disabled` instead of adding custom CSS classes.
- This ensures consistency across the application and reduces CSS complexity.

**Example:**
```vue
<!-- ✅ GOOD: Use component props -->
<VaButton color="success" size="medium" disabled>Submit</VaButton>

<!-- ❌ BAD: Adding custom classes for styling -->
<VaButton class="custom-success-button">Submit</VaButton>
```

### Naming Conventions
- Use **PascalCase (CamelCase)** for all Vue component names, including custom components and Vuestic components.
- Component names should be descriptive and indicate their purpose.

**Examples:**
```vue
<!-- ✅ GOOD: PascalCase names -->
<UserProfile :user="currentUser" />
<DataTable :rows="items" :columns="columns" />
<Modal :open="showDialog" @close="closeDialog" />

<!-- ❌ BAD: kebab-case or lowercase -->
<user-profile />
<data-table />
```

---

## Utility Components

### Reusable Utility Components
Before creating new components, check if an existing utility component in `ui/src/components/utils` fits your use case. These pre-built components are optimized for common UI patterns:

- **`UserAvatar`** — Display user profile pictures with initials fallback
- **`EmptyState`** — Show when no data is available in search results or tables
- **`ErrorState`** — Display error messages and recovery actions
- **`Maybe`** — Conditional rendering wrapper
- **`Pagination`** — Navigate through paginated data
- **`CopyText`** — Copy text to clipboard with feedback
- **`BinaryStatusChips`** — Display binary statistics as visual chips

**Example Usage:**
```vue
<script setup>
const props = defineProps({
  users: Array,
  currentPage: Number
})
</script>

<template>
  <!-- User avatar with fallback to initials -->
  <UserAvatar v-for="user in props.users" :key="user.id" :user="user" />
  
  <!-- Empty state when no data -->
  <EmptyState v-if="!props.users.length" title="No users found" />
  
  <!-- Pagination controls -->
  <Pagination 
    :current-page="props.currentPage"
    :total-pages="totalPages"
    @page-change="onPageChange"
  />
</template>
```

---

## Shared Services

### Date Formatting with `datetime.js`
Use the date formatting functions from `api/src/services/datetime.js` to ensure consistent date handling across the application. If needed functionality is not available, add new functions to this shared module rather than implementing date logic locally.

**Available Functions:**
- `generate_date_range(start, end, stepBy, unit)` — Generate arrays of dates for ranges

**Example:**
```javascript
import { generate_date_range } from '@/services/datetime'

// Generate daily date range
const dates = generate_date_range(
  new Date('2024-01-01'),
  new Date('2024-01-31'),
  1,
  'day'
)

// Generate weekly range
const weeks = generate_date_range(
  new Date('2024-01-01'),
  new Date('2024-12-31'),
  1,
  'week'
)
```

**Guidelines:**
- Use dayjs for all date manipulation (it's already integrated)
- Keep date logic centralized in `datetime.js`
- Extend `datetime.js` when adding new date formatting or calculation needs

### Color Generation from Text with `colors.js`
For deterministic, visually distinctive colors based on text input (like user names or IDs), use the `colors.js` service instead of random color generators.

**Available Functions:**
- `stringToHSL(text)` — Generate HSL color string from text
- `stringToRGB(text)` — Generate RGB hex color from text

**Example:**
```javascript
import { stringToHSL, stringToRGB } from '@/services/colors'

// Generate avatar background color from username
const userColor = stringToHSL(props.user.name)

// Generate hex color
const hexColor = stringToRGB(props.user.id)
```

**Benefits:**
- Same input always generates the same color
- Visually distinct colors for different inputs
- Perfect for avatars, tags, and status indicators

### Utility Functions with `utils.js`
Leverage pre-built utility functions from `ui/src/services/utils.js` to avoid reimplementing common operations.

**Commonly Used Functions:**
- **String/Text:**
  - `snakeCaseToTitleCase(str)` — Convert snake_case to Title Case
  - `capitalize(str)` — Capitalize first character
  - `caseInsensitiveIncludes(str, searchValue)` — Case-insensitive substring search
  - `validateEmail(email)` — Email validation
  - `sanitize(content, options)` — Sanitize HTML content for XSS prevention

- **Collections:**
  - `arrayEquals(arr1, arr2)` — Compare array equality
  - `difference(setA, setB)` — Set difference
  - `union(setA, setB)` — Set union
  - `setIntersection(setA, setB)` — Set intersection
  - `groupBy(key)` — Group array by property
  - `groupByAndAggregate(...)` — Group and aggregate data

- **Formatting:**
  - `formatBytes(bytes, decimals)` — Format byte sizes (e.g., 1.5 MB)
  - `maybePluralize(count, noun, options)` — Pluralize strings correctly
  - `initials(name)` — Extract initials from names

- **UI/UX:**
  - `downloadFile({ url, filename })` — Trigger file downloads
  - `navigateBackSafely(router, fallback)` — Smart back navigation with fallback
  - `isLiveToken(jwt)` — Check JWT token expiration
  - `isFeatureEnabled({ featureKey, hasRole })` — Feature flag checking

- **HTTP:**
  - `isHTTPError(code)` — Check HTTP error status
  - `is404`, `is403` — Pre-built error checkers

**Example Usage:**
```javascript
import { 
  formatBytes, 
  maybePluralize, 
  initials, 
  snakeCaseToTitleCase,
  sanitize
} from '@/services/utils'

// Format file size
const fileSize = formatBytes(1536000) // "1.46 MB"

// Correct pluralization
const itemCount = maybePluralize(3, 'item') // "3 items"
const singularItem = maybePluralize(1, 'item') // "1 item"

// Get user initials for avatar
const userInitials = initials('John Doe') // "JD"

// Format database field names
const label = snakeCaseToTitleCase('first_name') // "First Name"

// Sanitize user-provided HTML
const safeHTML = sanitize(userContent, {
  autoLink: true,
  autoEmail: true,
  classes: ['text-blue-500']
})
```

**Guidelines:**
- Use these utilities instead of implementing similar logic locally
- Consult `ui/src/services/utils.js` source for updated function signatures
- Add new utilities to this file if common patterns emerge across components

---

## Imports & Conventions

### Auto-Imported Modules
The project uses auto-import plugins to reduce boilerplate. **Do not explicitly import:**

**Vue & VueUse Composables:**
- `ref`, `computed`, `watch`, `onMounted`, etc. from `vue`
- Composables from `@vueuse/core`

**Why:** `unplugin-auto-import/vite` handles this automatically.

**Example:**
```vue
<!-- ✅ GOOD: No explicit imports needed -->
<script setup>
const count = ref(0)
const doubled = computed(() => count.value * 2)
const { useRouter } = useRouter()
</script>

<!-- ❌ BAD: Unnecessary imports -->
<script setup>
import { ref, computed } from 'vue'
const count = ref(0)
</script>
```

### User-Defined Components
Custom components are automatically registered and do not require explicit imports.

**Why:** `unplugin-vue-components/vite` handles auto-registration.

**Example:**
```vue
<!-- ✅ GOOD: Use custom components without importing -->
<template>
  <UserProfile :user="user" />
  <AlertBanner message="Success!" />
</template>

<!-- No need to import UserProfile or AlertBanner -->
```

### Props Qualification
Always qualify props with the `props.` prefix in templates for improved readability and to avoid ambiguity.

**Example:**
```vue
<script setup>
const props = defineProps({
  userName: String,
  isActive: Boolean
})
</script>

<template>
  <!-- ✅ GOOD: Qualified props -->
  <div class="flex items-center gap-2">
    <span class="font-semibold">{{ props.userName }}</span>
    <span v-if="props.isActive" class="text-green-600 dark:text-green-400">Active</span>
  </div>

  <!-- ❌ BAD: Unqualified props (ambiguous) -->
  <div>
    <span>{{ userName }}</span>
  </div>
</template>
```

---

## Best Practices

### Accessibility
- Ensure all interactive elements are keyboard accessible.
- Use semantic HTML: `<button>` for actions, `<a>` for navigation, `<label>` for form inputs.
- Include `aria-label` or `aria-labelledby` for icon-only buttons.
- Maintain sufficient color contrast (WCAG AA minimum).

**Example:**
```vue
<!-- ✅ GOOD: Accessible icon button -->
<button aria-label="Close dialog" @click="closeDialog">
  <i-mdi-close class="text-2xl" />
</button>

<!-- ❌ BAD: No label on icon button -->
<button @click="closeDialog">
  <i-mdi-close />
</button>
```

### Responsive Design
- Design mobile-first using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, etc.).
- Test layouts at common breakpoints: 320px, 768px, 1024px, 1280px.

**Example:**
```html
<div class="flex flex-col md:flex-row gap-2 md:gap-4 px-2 md:px-6">
  <div class="w-full md:w-1/2">Left content</div>
  <div class="w-full md:w-1/2">Right content</div>
</div>
```

### Performance
- Use computed properties to avoid recalculating values on every render.
- Leverage `v-show` for frequently toggled elements, `v-if` for rarely shown content.

### Consistency
- Follow the project's design system and existing component patterns.
- Reuse existing utility components and composables before creating new ones.
- Keep component files organized in the `/src/components` directory with clear naming.