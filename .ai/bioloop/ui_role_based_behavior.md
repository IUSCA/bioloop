# UI role-based behavior inventory

This document lists **every Vue surface** in `ui/src` that changes by **role**, **computed capability** (`canOperate` / `canAdmin`), or **feature flags** (`isFeatureEnabled`, which are resolved using `hasRole` and `config.enabledFeatures`). It also covers **router** restrictions and **non-Vue** UI helpers in `ui/src/services` that affect what the UI shows.

**Roles** in the auth store are the strings on `user.roles` (typically `user`, `operator`, `admin`). Helpers:

```18:23:ui/src/stores/auth.js
  const canOperate = computed(() => {
    return hasRole("operator") || hasRole("admin");
  });
  const canAdmin = computed(() => {
    return hasRole("admin");
  });
```

```152:157:ui/src/stores/auth.js
  function hasRole(role) {
    return (
      "roles" in user.value &&
      user.value.roles.map((s) => s.toLowerCase()).includes(role.toLowerCase())
    );
  }
```

```184:186:ui/src/stores/auth.js
  const isFeatureEnabled = (featureKey) => {
    return isFeatureEnabledForUser(featureKey, hasRole, config.enabledFeatures);
  };
```

---

## 1. Router: `requiresAuth` and `requiresRoles`

Global guard in `ui/src/router/index.js`:

- Default: routes **require authentication** unless `meta.requiresAuth` is explicitly set to a falsy value.
- If `meta.requiresRoles` is set, the user must have **at least one** overlapping role or navigation is **aborted** (`return false`) — there is **no dedicated “access denied” page**; the user simply stays on the current route.

```45:76:ui/src/router/index.js
function auth_guard(to, _from) {
  const routeRequiresAuth = !(
    Object.hasOwn(to.meta, "requiresAuth") && !to.meta.requiresAuth
  );
  const isRoleRestrictedRoute = Object.hasOwn(to.meta, "requiresRoles");
  // ...
  if (routeRequiresAuth) {
    if (isLoggedIn) {
      if (isRoleRestrictedRoute) {
        const common_roles = setIntersection(
          new Set(to.meta.requiresRoles),
          new Set(user.value.roles),
        );
        if (common_roles.size === 0) {
          return false;
        }
      }
    } else {
      return {
        name: "/auth/",
        query: {
          redirect_to: to.fullPath,
        },
      };
    }
  }
```

### 1.1 Pages with `requiresRoles: ["operator", "admin"]`

These routes are **not** available to the plain `user` role via navigation; the guard aborts if the user only has `user`.

| Page | File |
|------|------|
| Alerts | `ui/src/pages/alerts.vue` |
| Stats / Tracking | `ui/src/pages/stats.vue` |
| Workflows | `ui/src/pages/workflows/index.vue` |
| User Management | `ui/src/pages/users.vue` |
| Raw Data listing | `ui/src/pages/rawdata/index.vue` |
| Data Products listing | `ui/src/pages/dataproducts/index.vue` |
| New Project | `ui/src/pages/projects/new.vue` |
| Dataset detail (by id) | `ui/src/pages/datasets/[datasetId]/index.vue` |
| File browser (dataset) | `ui/src/pages/datasets/[datasetId]/filebrowser.vue` |
| Project-scoped dataset detail | `ui/src/pages/projects/[projectId]/datasets/[datasetId]/index.vue` |

Example:

```48:52:ui/src/pages/projects/[projectId]/datasets/[datasetId]/index.vue
<route lang="yaml">
meta:
  title: Project's Datasets
  requiresRoles: ["operator", "admin"]
</route>
```

### 1.2 Page with `requiresRoles: ["admin"]` only

**Upload details** (per-upload log view): `ui/src/pages/datasets/uploads/[id].vue` — only **`admin`** may open this route. Operators (`operator` without `admin`) are blocked the same way as plain users.

```378:382:ui/src/pages/datasets/uploads/[id].vue
<route lang="yaml">
meta:
  title: Upload Details
  requiresRoles: ["admin"]
</route>
```

### 1.3 Routes without `requiresRoles` (notable)

- **`ui/src/pages/dashboard.vue`** — meta has **only** `title`. Any **logged-in** user who navigates to `/dashboard` directly can load it; the **sidebar** still only advertises Dashboard to operators (see below). **`ui/src/pages/index.vue`** redirects operators to `/dashboard` and everyone else to `/projects`.

```11:15:ui/src/pages/index.vue
if (auth.canOperate) {
  router.push("/dashboard");
} else {
  router.push("/projects");
}
```

- **Dataset uploads** list and new upload (`/datasets/uploads`, `/datasets/uploads/new`) — **no** `requiresRoles` in route meta; access is gated by **`isFeatureEnabled('uploads')`** in the template (warning alert + conditional content), not by the router.

---

## 2. Feature flags (`config.enabledFeatures` + `isFeatureEnabled`)

Resolved in `ui/src/config.js` and checked with `auth.isFeatureEnabled(key)`. Role-gated entries use `{ defaultRoles: [...] }` (see `ui/src/services/features.js`).

Default excerpt:

```77:86:ui/src/config.js
  enabledFeatures: resolveEnabledFeatures({
    genomeBrowser: true,
    notifications: { defaultRoles: [] },
    import: { defaultRoles: ["admin"] },
    downloads: true,
    signup: false,
    uploads: { defaultRoles: ["admin"] },
    auto_create_project_on_dataset_creation: { defaultRoles: ["user"] },
    alerts: true,
  }),
```

**Note:** Keys **omitted** from `enabledFeatures` are treated as **enabled** by `isFeatureEnabled` (see `ui/src/services/features.js`). For example, `genome_files` is used in the UI but is **not** in the default `enabledFeatures` object, so it behaves as **on** unless added as `false` or role-gated later.

---

## 3. Shell: layout, header, sidebar

### 3.1 Alerts strip and polling (`alerts` feature)

```8:9:ui/src/layouts/default.vue
  <!-- Show any active alerts in the system  -->
  <Alerts v-if="auth.isFeatureEnabled('alerts')" />
```

```74:77:ui/src/layouts/default.vue
onMounted(() => {
  if (auth.isFeatureEnabled("alerts")) {
    alertStore.startPolling();
  }
});
```

### 3.2 Header: alert dropdown, notifications dropdown

```45:57:ui/src/components/layout/Header.vue
      <va-navbar-item
        class="flex items-center"
        v-if="auth.isFeatureEnabled('alerts')"
      >
        <AlertDropdown />
      </va-navbar-item>

      <va-navbar-item
        class="flex items-center"
        v-if="auth.isFeatureEnabled('notifications')"
      >
        <NotificationDropdown />
      </va-navbar-item>
```

With default config, **`notifications`** enables for **no** roles (`defaultRoles: []`), so the notifications dropdown is **hidden** for everyone unless env/overrides change that.

### 3.3 Sidebar: operator vs admin sections

```14:36:ui/src/components/layout/Sidebar/index.vue
    <!-- operator sidebar items -->
    <div v-if="auth.canOperate && operator_items.length > 0">
      <SidebarItems :items="operator_items" :isActive="isActive" />
      <va-divider />
    </div>

    <!-- admin sidebar items   -->
    <div v-if="auth.canAdmin">
      <SidebarItems :items="admin_items" :isActive="isActive" />
      <va-sidebar-item href="/grafana/dashboards" target="_blank">
```

`operator_items` / `user_items` / `feature_key` are defined in `ui/src/constants.js`. **Create Dataset** children (Import / Upload) use **`SidebarItems`**, which hides links when `isFeatureEnabled` is false:

```17:18:ui/src/components/layout/Sidebar/SidebarItems.vue
            v-if="auth.isFeatureEnabled(item.feature_key)"
          >
```

```50:54:ui/src/components/layout/Sidebar/SidebarItems.vue
      <va-sidebar-item
        v-else-if="
          auth.isFeatureEnabled(item.feature_key) &&
          (item.children || []).length === 0
```

---

## 4. Notifications (operator/admin vs user)

**NotificationDropdown** passes `forSelf: true` for users without privileged access (non–operator/admin), so the API query scope differs:

```279:286:ui/src/components/notifications/NotificationDropdown.vue
const { canOperate, user: authUser } = storeToRefs(auth);
const forSelf = computed(
  () => !viewerHasPrivilegedNotificationAccess(canOperate.value),
);
const notificationQueryOpts = computed(() => ({
  forSelf: forSelf.value,
  username: authUser.value?.username || null,
}));
```

**Notification** — for `ROLE_BROADCAST` deliveries, **target role chips** are only shown when `canOperate` is true:

```142:154:ui/src/components/notifications/Notification.vue
const isRoleBroadcast = computed(
  () => props.notification.delivery.type === "ROLE_BROADCAST",
);

const canSeeBroadcastTargets = computed(() =>
  viewerHasPrivilegedNotificationAccess(canOperate.value),
);

const roleOutlineNames = computed(() => {
  if (!isRoleBroadcast.value || !canSeeBroadcastTargets.value) {
    return [];
  }
```

Privileged access is defined in `ui/src/services/notifications/viewerAccess.js` as equivalent to **`canOperate`**.

---

## 5. Datasets, lists, downloads, genome UI

### 5.1 `DatasetService.getAll` URL (user vs operator/admin)

Non–operator/admin users hit a **username-scoped** list endpoint:

```34:37:ui/src/services/dataset.js
  getAll(params) {
    const url = !(auth.canOperate || auth.canAdmin)
      ? `/datasets/${auth.user.username}/all`
      : "/datasets";
```

### 5.2 `DatasetList` — optional “data files” column

```306:314:ui/src/components/dataset/DatasetList.vue
  ...(auth.isFeatureEnabled("genomeBrowser")
    ? [
        {
          key: "num_genome_files",
          label: "data files",
          width: "80px",
        },
      ]
    : []),
```

### 5.3 `Dataset` — Download button and genome count in modals

Download disabled when downloads feature off or dataset not staged:

```140:151:ui/src/components/dataset/Dataset.vue
                  <va-button
                    :disabled="
                      !dataset.is_staged || !auth.isFeatureEnabled('downloads')
                    "
                    class="flex-initial"
                    color="primary"
                    border-color="primary"
                    preset="secondary"
                    @click="openModalToDownloadDataset"
                  >
                    <i-mdi-download class="pr-2 text-2xl" />
                    Download
                  </va-button>
```

```203:208:ui/src/components/dataset/Dataset.vue
                  <div
                    class="flex items-center gap-1"
                    v-if="auth.isFeatureEnabled('genomeBrowser')"
                  >
                    <i-mdi-file-multiple class="text-xl" />
                    <span> {{ dataset.metadata?.num_genome_files }} </span>
                  </div>
```

### 5.4 `DatasetInfo` — genome row and admin upload link

```52:55:ui/src/components/dataset/DatasetInfo.vue
        <tr v-if="auth.isFeatureEnabled('genomeBrowser')">
          <td>Genome Files</td>
          <td>{{ props.dataset.metadata?.num_genome_files }}</td>
        </tr>
```

```81:90:ui/src/components/dataset/DatasetInfo.vue
              <router-link
                v-if="isUpload && auth.canAdmin"
                :to="`/datasets/uploads/${props.dataset.id}`"
                target="_blank"
                class="va-link"
                title="View upload details"
              >
                <va-icon name="open_in_new" size="small" />
              </router-link>
```

### 5.5 File browser pages — download prop

Project and dataset file browser templates pass:

`:show-download="auth.isFeatureEnabled('downloads') && dataset.is_staged"`  
(`ui/src/pages/datasets/[datasetId]/filebrowser.vue`, `ui/src/pages/projects/[projectId]/datasets/[datasetId]/filebrowser.vue`.)

---

## 6. Upload flow

### 6.1 Feature disabled warning (role + config)

```2:8:ui/src/pages/datasets/uploads/new.vue
  <va-alert
    color="warning"
    icon="warning"
    v-if="!auth.isFeatureEnabled('uploads')"
    data-testid="upload-feature-disabled-alert"
  >
    This feature is currently disabled
  </va-alert>
```

Same pattern on `ui/src/pages/datasets/uploads/index.vue`.

### 6.2 Uploads index table — admin-only link column; non-operator plain text

**“Upload Details”** column (link to `/datasets/uploads/:id`) is **only** for `canAdmin`:

```408:420:ui/src/pages/datasets/uploads/index.vue
  if (auth.canAdmin) {
    return [
      {
        key: "link",
        label: "Upload Details",
        width: "8%",
        thAlign: "center",
        tdAlign: "center",
      },
      ...baseColumns,
    ];
  }

  return baseColumns;
```

For **`!auth.canOperate`**, uploaded dataset and source dataset names are **plain text**; otherwise **links** to dataset pages:

```239:249:ui/src/pages/datasets/uploads/index.vue
      <template #cell(uploaded_dataset)="{ rowData }">
        <div v-if="!auth.canOperate">
          {{ rowData.uploaded_dataset.name }}
        </div>
        <router-link
          v-else
          :to="`/datasets/${rowData.uploaded_dataset.id}`"
          class="va-link"
        >
          {{ rowData.uploaded_dataset.name }}
        </router-link>
      </template>
```

Column widths also depend on `auth.canAdmin` (narrower columns when admin link column is present).

### 6.3 `UploadedDatasetDetails` — dataset name link vs text

```23:34:ui/src/components/dataset/upload/UploadedDatasetDetails.vue
            <div v-if="props.dataset">
              <div v-if="!auth.canOperate" data-testid="dataset-name-display">
                {{ props.dataset.name }}
              </div>
              <router-link
                v-else
                :to="`/datasets/${props.dataset.id}`"
                target="_blank"
                data-testid="dataset-name-link"
              >
                {{ props.dataset.name }}
              </router-link>
```

### 6.4 `UploadDatasetStepper` — project assignment rules

- **`auto_create_project_on_dataset_creation`** is consulted in script (feature flag).
- **`mustAssignProjectForUser`**: plain **`user`** (not operator/admin) must assign a project when projects exist — checkbox behavior is forced:

```1635:1640:ui/src/components/dataset/upload/UploadDatasetStepper.vue
 * `user` role must assign a Project whenever at least one Project is available.
 * This keeps user-created datasets scoped to a known Project when possible.
 */
const mustAssignProjectForUser = computed(() => {
  return !auth.canOperate && !auth.canAdmin && !noProjectsToAssign.value;
});
```

`ProjectAsyncAutoComplete` uses `forSelf: !(auth.canOperate || auth.canAdmin)` for search scope (`ui/src/components/project/ProjectAsyncAutoComplete.vue`).

---

## 7. Import flow

### 7.1 Import page — feature gate

```5:8:ui/src/pages/datasets/import.vue
        <ImportStepper v-if="auth.isFeatureEnabled('import')" />
        <va-alert color="warning" icon="warning" v-else
          >This feature is currently disabled
        </va-alert>
```

### 7.2 `ImportInfo` — dataset name link vs text

Same pattern as upload details:

```11:21:ui/src/components/dataset/import/ImportInfo.vue
                <div v-if="props.dataset">
                  <div v-if="!auth.canOperate">
                    {{ props.dataset.name }}
                  </div>
                  <a
                    v-else
                    :href="`/datasets/${props.dataset.id}`"
                    data-testid="import-success-dataset-link"
                  >
                    {{ props.dataset.name }}
                  </a>
```

### 7.3 `ImportStepper`

Shares **`mustAssignProjectForUser`** / **`forSelf`** logic with `UploadDatasetStepper` (same `canOperate` / `canAdmin` / `auto_create_project` checks):

```857:863:ui/src/components/dataset/import/ImportStepper.vue
/**
 * `user` role must assign a Project whenever at least one Project is available.
 * This keeps user-created datasets scoped to a known Project when possible.
 */
const mustAssignProjectForUser = computed(() => {
  return !auth.canOperate && !auth.canAdmin && !noProjectsToAssign.value;
});
```

---

## 8. Projects

### 8.1 Projects list — Create Project button and table columns

**Create Project** visible only for `canOperate`:

```28:37:ui/src/pages/projects/index.vue
      <div class="flex-none" v-if="auth.canOperate">
        <va-button
          icon="add"
          class="px-1"
          color="success"
          @click="router.push('/projects/new')"
        >
          Create Project
        </va-button>
      </div>
```

Operators see extra columns (**users**, **actions**); `forSelf` on API query flips for non-operators:

```235:255:ui/src/pages/projects/index.vue
  ...(auth.canOperate ? [{ key: "users", sortable: false, width: "30%" }] : []),
  // ...
  ...(auth.canOperate ? [{ key: "actions", width: "80px" }] : []),
  // ...
    forSelf: !auth.canOperate,
```

### 8.2 Project detail `ui/src/pages/projects/[projectId]/index.vue`

- **Edit** general info, **Access Permissions** card, **Associated Datasets** add button, **Maintenance Actions** card: gated with **`v-if="auth.canOperate"`** (see template lines 22, 33, 70, 86).

### 8.3 `ProjectDatasetsTable`

- Dataset **name** is a **link** only if `auth.canOperate`; else plain text (`v-if` on `router-link`).
- **`assigned`** column appended only for operators:

```436:442:ui/src/components/project/datasets/ProjectDatasetsTable.vue
  ...(auth.canOperate
    ? [
        {
          key: "assigned",
        },
      ]
    : []),
```

---

## 9. Users page (`ui/src/pages/users.vue`)

- Route: **`requiresRoles: ["operator", "admin"]`** — plain users never reach this page via successful navigation.
- **Spoof / “Log in as User”** button: **`v-if="auth.canAdmin"`**.
- **Delete user** UI and **roles** editor: **`v-if="auth.canAdmin"`** / **`:disabled="!auth.canAdmin"`**.
- **`canEdit(row)`**: admins can edit anyone; operators can edit self or users that have **`user`** role (or empty roles). **`fetch_all_users`** uses `forSelf: !auth.canOperate` for scoped listing when not operator.

---

## 10. Workflows (`ui/src/components/runs/Workflow.vue`)

**Delete Workflow** is **`auth.canAdmin` only** (multiple places in the actions block). **Resume** / **Stop** remain available to the page’s audience (route requires operator/admin).

```100:106:ui/src/components/runs/Workflow.vue
            <confirm-hold-button
              v-if="auth.canAdmin"
              action="Delete Workflow"
              icon="mdi-delete"
              color="danger"
              @click="delete_workflow"
            ></confirm-hold-button>
```

---

## 11. Auth landing copy

**Signup** wording vs login-only:

```21:24:ui/src/pages/auth/index.vue
          <span v-if="auth.isFeatureEnabled('signup')">
            Sign Up or Log In
          </span>
          <span v-else>Log In with</span>
```

---

## 12. About page

**Edit** about content:

```13:17:ui/src/pages/about/index.vue
          <AddEditButton
            class="flex-none"
            edit
            @click="showModal = true"
            v-if="auth.canAdmin || auth.canOperate"
          />
```

---

## 13. Dashboard stats widget

**Data Files** stat block gated by `genome_files` feature key:

```47:66:ui/src/components/dashboard/Stats.vue
          <div
            v-if="auth.isFeatureEnabled('genome_files')"
            class="flex flex-col items-center justify-end"
          >
            <h2
              v-if="props.data?.total_num_genome_files != undefined"
```

---

## 14. Display-only role surfaces (no capability branching)

These show **role labels** but do not implement different **controls** by viewer:

- **`ui/src/pages/profile.vue`** — lists `profile.roles` as chips.
- **`ui/src/components/dataset/DatasetAuditLogs.vue`** — shows `log.user?.roles` in the table.
- **`ui/src/pages/users.vue`** — **roles** column for admin/operator user management.

---

## 15. Files scanned (Vue + relevant services)

All `*.vue` files under `ui/src` were searched for `canOperate`, `canAdmin`, `hasRole`, and `isFeatureEnabled`. The following **services** outside Vue also affect role-shaped UI:

- `ui/src/services/dataset.js` — list URL by role (section 5.1).
- `ui/src/services/features.js` — feature resolution.
- `ui/src/services/notifications/viewerAccess.js` — matches notification UI to API privilege model.

---

**Last updated:** 2026-03-27 (inventory of `ui/src` on branch state at documentation time).
