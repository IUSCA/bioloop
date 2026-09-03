---
title: V2 Page Patterns
order: 5
---

# V2 Page Patterns

Pages under `ui/src/pages/v2/` follow a small set of shared shapes. Matching them is
what makes groups, collections, and datasets behave identically without a component
library to enforce it. This page covers only what is specific to those pages —
[UI coding standards](./ui-coding-standards.md) and
[Vue 3 and Tailwind](./conventions/vue3-tailwind.md) cover everything else, including
auto-imports.

## Capability gating

The API returns a `_meta` field on a single-resource response carrying the caller's role
and the actions they are allowed to take:

```javascript
{
  id: "…",
  // …resource fields…
  _meta: {
    caller_role: "PLATFORM_ADMIN" | "ADMIN" | "OVERSIGHT" | "MEMBER" | "GRANT_HOLDER",
    capabilities: ["view_metadata", "edit_metadata", "archive", "list_grants", …]
  }
}
```

Every detail page turns that into a `can()` predicate and drives tab and action
visibility from it:

```javascript
const capabilities = computed(
  () => new Set(collection.value?._meta?.capabilities ?? []),
);
const callerRole = computed(() => collection.value?._meta?.caller_role);
function can(action) {
  return capabilities.value.has(action);
}

const showAccessTab = computed(() => can("list_grants"));
const canEdit = computed(() => can("edit_metadata") && !collection.value?.is_archived);
```

Pass the resolved booleans down as props — `:can-edit`, `:can-archive` — rather than
handing a tab component the whole resource and letting it re-derive them.

Capabilities come from the policy container for that resource type in
`api/src/authorization/builtin/policies/`. Which tab each capability controls is
recorded in
[UI information architecture](/design/groups/ui-information-architecture).

## Fetching a resource

```javascript
const resource = ref(null);
const loading = ref(true);
const error = ref(null);

async function fetchData() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await SomeService.get(props.id);
    resource.value = data;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(() => fetchData());
```

The template wraps the three states in one transition:

```html
<Transition name="fade-slide" mode="out-in">
  <div v-if="loading">…skeleton…</div>
  <div v-else-if="error"><ErrorState :message="error?.message" @retry="fetchData" /></div>
  <div v-else-if="resource">…content…</div>
</Transition>
```

## List pages

`pages/v2/groups/index.vue` is the reference implementation.

- Debounce the search term at 350 ms with `useDebounceFn`.
- A scope or filter change resets `currentPage` to 1, and a `watch(currentPage)` does
  the fetch. When the page is already 1, call the fetch directly — resetting it fires
  nothing and calling both double-fetches.
- `<Pagination v-model:page="currentPage" v-model:page_size="itemsPerPage" :total_results="total" :curr_items="items.length" />`
- A `.search()` service call resolves to `{ data: { metadata: { total, offset, limit }, data: [...] } }`.

## Detail pages with tabs

- Declare tabs in `<VaTabs v-model="activeTab">` with a `<VaTab name="…">` per tab.
- Render panels with `v-if="activeTab === '…'"`, not `v-show`, so a hidden tab does not
  fetch.
- Gate each tab on `can('capability')`.
- Keep counts in a `counts` ref where `null` means "not loaded yet" and a number means
  loaded, fetched in parallel with `Promise.all()` once the resource has loaded.
- A tab component emits `count-changed` when it mutates its own collection, and the page
  refreshes that count.
- Render a count as `<span v-if="counts.grants !== null" class="tab-count-badge">`. The
  `.tab-count-badge` rule lives in each page's scoped style block; copy it from
  `pages/v2/datasets/[id]/index.vue`.

## Optimistic concurrency on update

Every `PATCH` carries the `version` read with the resource, so a stale write is rejected
rather than silently overwriting. The service signature takes it separately:

```javascript
CollectionService.update(id, { name, description }, collection.value.version);
```

See [Optimistic locking](/reference/api/data/optimistic-locking) for what the API does
with it.

## Breadcrumbs

Set the trail from the page, using the nav store:

```javascript
import { useNavStore } from "@/stores/nav";
const nav = useNavStore();

nav.setNavItems([
  { label: "Collections", to: "/v2/collections" },
  { label: collection.value.name }, // current page — no `to`
]);
```

Home is prepended automatically, and each item needs a `label` or an `icon`. On a
hierarchy page, sort ancestors by `depth` descending so the trail reads root-first, as
`pages/v2/groups/[id]/index.vue` does. [UI overview](/reference/ui/overview) covers the
breadcrumb component itself.
