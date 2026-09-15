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

The API returns a `_meta` field on a single-resource response. It carries the caller's
standing and the actions they are allowed to take. Standing is the list of paths by which
the caller reads the resource:

```javascript
{
  id: "…",
  // …resource fields…
  _meta: {
    standing: [
      { kind: "oversight", group_id: "…" },
      { kind: "grant", grant_id: "…", access_type: "DATASET:DOWNLOAD", collection_id: null },
    ],
    capabilities: ["view_metadata", "edit_metadata", "archive", "list_grants", …]
  }
}
```

A path's `kind` is `platform_admin`, `admin`, `oversight`, `member`, `grant`, or
`resource_rule`. A `member` path also says whether the membership is `direct`.

Every detail page turns capabilities into a `can()` predicate and drives tab and action
visibility from it. The badge is a display function of standing and gates nothing:

```javascript
import { badgeFor } from "@/services/v2/standing";

const capabilities = computed(
  () => new Set(collection.value?._meta?.capabilities ?? []),
);
const callerRole = computed(() =>
  badgeFor(collection.value?._meta?.standing, "collection"),
);
function can(action) {
  return capabilities.value.has(action);
}

// The Access tab shows for every viewer; the grant table only for a grant manager.
const showGrantTable = computed(() => can("list_grants"));
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
  <div v-else-if="error">
    <ErrorState :error="error" subject="this dataset" title="Failed to load dataset"
                @retry="fetchData" />
  </div>
  <div v-else-if="resource">…content…</div>
</Transition>
```

## List pages

`pages/v2/groups/index.vue` is the reference implementation.

- The shell is a one-line description under the breadcrumb, a
  `<VaCard class="header card">` holding search and filters and the one page-level action,
  then a results card. The page sets no width of its own; `layouts/default.vue` caps and
  centres the content column. See
  [V2 design system](./v2-design-system.md#the-page-shell).
- Filters are `<ModernButtonToggle>`, which carries `role="group"`, `aria-pressed`, and a
  focus ring. Do not use `VaChip` as a filter control.
- Store the error itself in `error`, not a string pulled out of it. `ErrorState` reads the
  status to decide whether this was a refusal, and a flattened string hides that.
- Empty and error regions are `<EmptyState>` and `<ErrorState>`. Pass
  `:show-clear-filters="false"` when the region is empty because nothing exists rather
  than because a filter excluded everything, and use the `actions` slot for a
  create-the-first-one call to action.
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
  `.tab-count-badge` rule is defined once in `ui/src/styles/main.css`; do not copy it into
  a page's scoped style block.

## Checklist for a change to the access model

- [ ] A new enum value, action, operation, or restriction type extends the
  [access model](/design/groups/access-model.md), the reference model in
  `api/tests/model/reference.js`, and the four tables under
  `api/src/authorization/builtin/tables/`. Three tests fail until it does:
  - `api/tests/model/modelCoverage.test.js` fails on an enum value no world reaches and no entry
    declares unread. It also fails on a registered resource type that the reference model does
    not decide and that names no test deciding it.
  - `api/tests/authorization/registryCompleteness.test.js` fails on an action with no restriction
    class and on a term with no path kind.
  - `api/tests/model/uiScan.test.js` fails on a page that computes a decision the API should send.

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
