# Bioloop Platform UI Conventions

## Vuestic Component Usage

**Correct Component Names:**
- ✅ `va-progress-circle` (NOT `va-progress-circular`)
- ✅ Individual `va-radio` components (NOT `va-radio-group`)
- ✅ `va-select` with `text-by` and `value-by` props

**va-select Pattern:**
```vue
<va-select
  v-model="form.type"
  :options="typeOptions"
  text-by="text"
  value-by="value"
  label="Type"
/>

<script setup>
const typeOptions = computed(() => {
  return Object.entries(constants.TYPES).map(([key, value]) => ({
    text: value.label,
    value: key,
  }));
});
</script>
```

**va-radio Pattern:**
```vue
<div class="flex flex-col gap-3">
  <va-radio
    v-model="selectedOption"
    :option="OPTIONS.A"
    :label="LABELS[OPTIONS.A]"
  />
  <va-radio
    v-model="selectedOption"
    :option="OPTIONS.B"
    :label="LABELS[OPTIONS.B]"
  />
</div>
```

---

## Constants Import Pattern

```vue
<script setup>
import constants from '@/constants';

// Destructure what you need
const { DATASET_TYPES } = constants;
</script>
```

---

## Async Autocomplete Pattern

For searchable dropdowns with API data:

```vue
<template>
  <va-async-auto-complete
    v-model="selectedItems"
    :fetch-data="fetchItems"
    :multiple="true"
    placeholder="Search..."
    :debounce="300"
  />
</template>

<script setup>
import itemService from '@/services/item';

const fetchItems = async (inputValue) => {
  try {
    const response = await itemService.search({
      search: inputValue,
      limit: 20,
    });
    return response.data.items || [];
  } catch (error) {
    console.error('Failed to fetch items:', error);
    return [];
  }
};
</script>
```

---

## Breadcrumb Navigation Pattern

**ALWAYS use `nav.setNavItems()` for breadcrumbs, NOT `<va-breadcrumbs>` component directly:**

```vue
<script setup>
import { useNavStore } from '@/stores/nav';
import { onMounted } from 'vue';

const nav = useNavStore();

onMounted(async () => {
  // Fetch data first (if needed)
  await fetchData();

  // Then set breadcrumbs dynamically
  nav.setNavItems([
    {
      label: 'Parent Page',
      to: '/parent',
    },
    {
      label: 'Current Page Name',
      // No 'to' property for current page (not clickable)
    },
  ]);
});
</script>
```

**Pattern Details:**
- Import `useNavStore` from `@/stores/nav`
- Call `nav.setNavItems()` in `onMounted()` hook
- First item should link to parent page (with `to` property)
- Last item is current page (without `to` property, not clickable)
- By default, "Home" icon is prepended automatically (`withHome: true`)
- To exclude Home: `nav.setNavItems(items, false)`

**Examples:**

```vue
// Detail page with parent list
nav.setNavItems([
  { label: 'Datasets', to: '/datasets' },
  { label: dataset.value.name },
]);

// Nested detail page
nav.setNavItems([
  { label: 'Projects', to: '/projects' },
  { label: project.value.name, to: `/projects/${project.value.id}` },
  { label: 'Datasets' },
]);

// No home icon (dashboard page)
nav.setNavItems([], false);
```

---

## Pagination Pattern

**ALWAYS use the custom `Pagination` component for tables with pagination:**

```vue
<template>
  <va-data-table :items="paginatedItems" :columns="columns" />

  <Pagination
    v-model:page="currentPage"
    v-model:page_size="pageSize"
    :total_results="totalItems"
    :curr_items="paginatedItems.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />
</template>

<script setup>
import Pagination from '@/components/utils/Pagination.vue';

const currentPage = ref(1);
const pageSize = ref(25);
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const startIndex = computed(() => (currentPage.value - 1) * pageSize.value);
const endIndex = computed(() =>
  Math.min(startIndex.value + pageSize.value, totalItems.value)
);

const paginatedItems = computed(() => {
  return allItems.value.slice(startIndex.value, endIndex.value);
});
</script>
```

**DON'T use `va-pagination` directly** - it lacks page size controls and result counts.

**Component Props:**
- `page` (v-model): Current page number (1-indexed)
- `page_size` (v-model): Items per page
- `total_results`: Total number of items
- `curr_items`: Number of items on current page
- `page_size_options`: Array of page size options (e.g., `[25, 50, 100]`)

---

## CSS & Styling Preferences

**DO NOT add styling classes unless explicitly asked:**
- Avoid: `text-sm`, `bg-gray-100`, `text-red-500`, etc.
- When styling is needed, refer to existing components for patterns
- Use Vuestic's built-in styling props when available

**DO use Vuestic component props for styling:**
```vue
<va-button color="primary" size="small" />
<va-card stripe color="success" />
```

---

## Auto-Population Logic

When implementing auto-population (e.g., filling form fields based on selections):

**RULE: Preserve manual user selections**

```javascript
// ✅ CORRECT: Only auto-populate if fields are empty
const updateFields = () => {
  if (!form.field1 && !form.field2) {
    // Auto-populate only if both are empty
    const uniqueValues = getUniqueValues();
    if (uniqueValues.length === 1) {
      form.field1 = uniqueValues[0].value1;
      form.field2 = uniqueValues[0].value2;
    }
  }
};

// ❌ WRONG: Overwriting existing values
const updateFields = () => {
  const uniqueValues = getUniqueValues();
  if (uniqueValues.length === 1) {
    form.field1 = uniqueValues[0].value1; // Overwrites manual input!
    form.field2 = uniqueValues[0].value2;
  }
};
```

---

## Page vs List Component Pattern

**Pages should be minimal, delegating to list components:**

```vue
<!-- pages/items/index.vue -->
<template>
  <div>
    <h1>Items</h1>
    <ItemsList />
  </div>
</template>

<script setup>
import ItemsList from '@/components/items/ItemsList.vue';
</script>

<!-- components/items/ItemsList.vue -->
<template>
  <div>
    <!-- All logic, filters, tables here -->
  </div>
</template>

<script setup>
// Actual implementation
</script>
```

---

## Action Buttons vs Icons

**Prefer icons over buttons for actions:**

```vue
<!-- ✅ PREFERRED -->
<va-icon
  name="mdi-delete"
  @click="deleteItem(item.id)"
  class="cursor-pointer text-red-500"
/>

<!-- ❌ AVOID (unless explicitly needed) -->
<va-button @click="deleteItem(item.id)">
  Delete
</va-button>
```

---

## Toast Notifications

**Show toasts ONLY for API success/failure, not for UI interactions:**

```javascript
// ✅ CORRECT
const saveItem = async () => {
  try {
    await itemService.create(form);
    toast.success('Item created successfully');
  } catch (error) {
    toast.error('Failed to create item');
  }
};

// ❌ WRONG
const selectItem = (item) => {
  selectedItems.push(item);
  toast.success('Item selected'); // No toast for UI interactions
};
```

---

## Form Validation Pattern

```vue
<script setup>
import { ref, computed } from 'vue';

const form = ref({
  name: '',
  type: '',
});

const isValid = computed(() => {
  return form.value.name.trim() !== ''
    && form.value.type !== '';
});

const submit = async () => {
  if (!isValid.value) {
    toast.error('Please fill in all required fields');
    return;
  }

  try {
    await api.create(form.value);
    toast.success('Created successfully');
  } catch (error) {
    toast.error('Failed to create');
  }
};
</script>
```

---

## Modal Pattern

```vue
<template>
  <va-modal
    v-model="showModal"
    title="Modal Title"
    ok-text="Save"
    @ok="handleSave"
    @cancel="handleCancel"
  >
    <!-- Content -->
  </va-modal>
</template>

<script setup>
import { ref, watch } from 'vue';

const showModal = ref(false);

const handleSave = () => {
  // Save logic
  showModal.value = false;
};

const handleCancel = () => {
  // Reset form
  showModal.value = false;
};

// Reset form when modal closes
watch(showModal, (isOpen) => {
  if (!isOpen) {
    // Reset state
  }
});
</script>
```

---

## Data Table Empty Values

**NEVER show '-' or other placeholder text for missing values in data tables:**

```vue
<!-- ✅ CORRECT: Show nothing when value is missing -->
<template #cell(optional_field)="{ value }">
  <va-chip v-if="value" size="small">
    {{ value }}
  </va-chip>
</template>

<!-- ❌ WRONG: Showing dash for empty values -->
<template #cell(optional_field)="{ value }">
  <va-chip v-if="value" size="small">
    {{ value }}
  </va-chip>
  <span v-else>-</span>
</template>
```

**Rationale:** Empty cells are self-explanatory and cleaner than placeholder text.

---

## Data Table Column Widths

**Always use percentage widths for table columns, and leave ONE column without a width definition:**

```javascript
// ✅ CORRECT: Use % widths, leave one flexible column
const columns = [
  { key: 'id', label: 'ID', width: '10%' },
  { key: 'name', label: 'Name' }, // No width - will flex to fill remaining space
  { key: 'type', label: 'Type', width: '15%' },
  { key: 'status', label: 'Status', width: '12%' },
  { key: 'date', label: 'Date', width: '10%' },
];

// ❌ WRONG: Using px widths
const columns = [
  { key: 'id', label: 'ID', width: '100px' },
  { key: 'name', label: 'Name', width: '200px' },
];
```

**Guidelines:**
- Use `%` for all fixed-width columns
- Leave the most important/flexible column (usually name or description) without a width
- Ensure total widths of defined columns sum to less than 100%

---

## Quick Reference Checklist

### Starting New UI Component
- [ ] Import constants from `@/constants`
- [ ] Use correct Vuestic component names
- [ ] Add `text-by` and `value-by` to `va-select`
- [ ] Preserve manual user input in auto-population logic
- [ ] Use icons instead of buttons for actions
- [ ] Show toasts only for API operations
- [ ] Never show '-' for empty table cells
- [ ] Use % widths for tables, leave one column without width

---

**Last Updated:** 2026-01-17
