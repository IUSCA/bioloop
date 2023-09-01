## Breadcrumb navigation

The [LeaveBreadcrumbs](https://github.com/IUSCA/bioloop/blob/main/ui/src/components/layout/LeaveBreadcrumbs.vue) component  allows the app to render breadcrumb navigation. This component sits in the [default layout](https://github.com/IUSCA/bioloop/blob/main/ui/src/layouts/default.vue), which renders the appropriate page, along with breadcrumb navigation.

The breadcrumb state is maintained in a Pinia store, which can be accessed through:

```
const store = useBreadcrumbsStore();
```

The store exposes the below attributes:
  - `breadcrumbs:[]` - the list of breadcrumbs currently rendered on the page 
  - `addNavItem(item:Object)` - adds the provided breadcrumb nav item to the list of breadcrumbs maintained in the global state.
  - `resetNavItems()` - resets the list of breadcrumbs maintained in the global state

New breadcrumb items can be added by calling `store.addNavItem()`.

To add breadcrumb navigation for a new page, within the LeaveBreadcrumbs component:
- Add an entry for the page in the BREADCRUMBS object. The entry may include the following optional attributes:
  - label
  - icon
  - to
  - disabled
 - One of 'label' or 'icon' must be provided for the corresponding breadcrumb item to be rendered.
 - Breadcrumb nav is configured when the app is mounted, as well as when a global resource that is included in the breadcrumb navigation changes.
- For setting breadcrumbs for a resource that first need to be retrieved through a network call, fetch the necessary resource, persist it to a global store, add a watcher for said resource within LeaveBreadcrumbs, and call useBreadcrumbsStore().addNavItem(item:Object) once the resource had been persisted to the global store.
