---
title: Changing the v2 UI
---

# Changing the v2 UI

This page is the reference half of the `v2-ui-changes` agent skill. It covers how to find
out what the running v2 UI actually does, and how to change many `.vue` files safely. The
skill keeps only the traps and commands an agent needs at once.

The rules themselves live elsewhere:

- [V2 design system](../v2-design-system.md) holds the visual rules.
- [V2 page patterns](../v2-page-patterns.md) holds capability gating and page shapes.
- [V2 UI vocabulary](../v2-ui-vocabulary.md) holds the words access-control text uses.
- [UI coding standards](../ui-coding-standards.md) holds icons, components, and imports.
- [Dev servers](./dev-servers.md) covers starting the app and signing in.

## Verify visual claims against the running app

A class string tells you what the author intended. It does not tell you what a user sees.
Several defects in this codebase were invisible in the source and obvious in one
`getComputedStyle` call.

The app runs at `https://localhost` behind a self-signed certificate. Start it with
`bin/devserver.sh up`. In Chrome DevTools MCP, `evaluate_script` returning measurements
carries a claim better than a screenshot:

```js
() => {
  const el = document.querySelector('[role="note"]');
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, borderWidth: cs.borderTopWidth, text: el.innerText.length };
}
```

Take a screenshot afterwards to confirm the look, but let the numbers carry the claim. Three
panels once looked like three different dark surfaces in a screenshot and measured identical.

### Attaching the MCP browser

`list_pages` fails with "The browser is already running for
`~/.cache/chrome-devtools-mcp/chrome-profile`" whenever a Chrome already holds that profile
without a debugging port. The MCP server can neither attach nor launch its own, and retrying
never clears it. Ask the user to quit that Chrome window. Do not kill the process yourself,
because it is the user's browser and may hold their work.

Once attached, `https://localhost/dev-login?username=<user>&next=<path>` passes both the
certificate interstitial and the login in one navigation.

### Check as another user in an isolated context

The attached Chrome holds the user's live login, and `dev-login` replaces the token in
whatever context it runs in. Open the check in its own storage:

```
new_page({ url: "https://localhost/dev-login?username=bob&next=/v2/groups/<id>",
           isolatedContext: "state-check" })
```

Pages in that context share cookies and `localStorage` with each other and nothing else.
Navigate the same page to `dev-login` again with another `username` to try several viewers.
The user's own tab stays signed in as whoever they were.

### Sign in as a group admin, not `test_user`

The engine allows a platform admin before any policy runs. A pass driven as `test_user`
therefore exercises no policy path. Use a seeded group admin such as `alice`, the admin of
Wong Lab. A 500 on `POST /grants/:id/revoke` once went unnoticed because every browser check
ran as a platform admin.

The demo world has no platform admin at all. Every demo cast member holds only the `user`
role, and `dev-login` refuses `priya` and `test_user` there. To check a platform-admin view,
add the role to `frank` and remove it afterwards:
`prisma.user_role.create({ data: { user_id: frank.id, role_id: adminRole.id } })`, then
`deleteMany` the same row.

### Confirm a capability claim from `_meta`

A missing button proves nothing alone. The viewer may not hold the capability, so the control
was absent before the change under test. Fetch the resource and compare the two lists:

```js
const caps = b._meta.capabilities, avail = b._meta.available_actions;
caps.filter((c) => !avail.includes(c))   // the state's contribution, isolated
```

An empty result means the check could not have failed. Pick a viewer who holds the action,
usually an `ADMIN` of the owning group rather than a grant holder.

## Driving components from the MCP browser

### Read state in a separate `evaluate_script` call

A click handler updates a ref, and Vue re-renders on the next tick. A script that clicks and
then reads `checked`, `aria-disabled`, or `innerText` in the same call sees pre-render
values. That looks exactly like a click with no effect. Click in one call and read in the
next.

A click on a checkbox row toggles it. A debugging script that clicks the same row twice leaves
it off, and that is not a bug in the component.

Plain divs carrying `@click`, such as the access-type rows, respond to `.click()`.

### `va-select` ignores synthetic events

`va-select` ignores a synthetic click on its rendered option. It also ignores ArrowDown plus
Enter after the listbox opens. The `take_snapshot` accessibility tree does not list the
options, so the `click` tool has nothing to target. Every combination of `pointerdown`,
`mousedown`, `pointerup`, `mouseup`, and `click` at the option's centre failed to change the
bound value.

The limit belongs to dispatched events, not to the component. Playwright drives real input
over the DevTools Protocol. A `.click()` on the select and a `.click()` on
`getByRole('option', { name: … })` change the value normally, as in the role select in
`AddGroupMemberModal` and the type select in `UploadDatasetModal`. A browser test suite
therefore needs no workaround.

One Playwright trap: a `.va-select` locator filtered on the current value stops matching once
the value changes. Playwright then reports "element(s) not found", which reads as a failed
click when the click worked. Hold the select by position and assert on its text.

In the MCP browser, reach the component instance and set its state:

```js
() => {
  let c = document.querySelector('.va-modal').__vueParentComponent;
  while (c && c.type?.__name !== 'ImportDatasetModal') c = c.parent;
  window.__imp = c;                      // keep the handle for later calls
  return Object.keys(c.setupState);      // the refs `<script setup>` exposed
}
```

`setupState` is a proxy that unwraps refs. Assign the plain value, as
`c.setupState.form.sourceId = 2`. Writing `.value = 2` throws, because the property is already
unwrapped. Walk `c.subTree` recursively to reach a child such as `OwnerGroupSelect`, and set its
`selectedId` the same way. The component's watchers then fire, so availability checks,
`canSubmit`, and emitted events run as they would for a real click.

### Plain inputs and buttons

Plain `<input>` elements take the `fill` tool. Without `fill`, go through the native value
setter so Vue's listener sees the change:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(input, 'RUN_UI');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

Buttons the app renders respond to `.click()`, including suggestion buttons in a typeahead.

### `va-checkbox` takes a click on its wrapper

The accessibility snapshot lists each `va-checkbox` twice: a `button` carrying the label and a
`checkbox` inside it. The `checkbox` uid times out with "did not become interactive". The
enclosing `button` uid works and flips the bound value.

In the access-type selector, a type the order already confers renders checked and `disabled`
with a `via <wider type>` chip. Reading `input.checked` alone over-counts what the user
chose. Read `disabled` too, and treat a disabled tick as implied.

### Finding a button by its text finds the wrapper first

`[...document.querySelectorAll('div, button')].find((el) => el.innerText.trim() === 'Request Access')`
returns the first match in document order. That is the outermost element with the same text,
such as a grid holding one `ActionButton`. A `.click()` on the wrapper fires nothing. Filter
every match, take the last, and click `el.closest('button')`.

### Measuring rows rather than reading the template

One `evaluate_script` returning a table per row carries a rendered claim:

```js
() => [...document.querySelectorAll('[role="button"][tabindex="0"]')]
  .filter(e => e.querySelector('input[type="checkbox"], .va-checkbox'))
  .map(r => ({
    label: r.innerText.split('\n')[0],
    checked: r.querySelector('input[type="checkbox"]')?.checked,
    disabled: r.getAttribute('aria-disabled'),
    opacity: getComputedStyle(r).opacity,
  }));
```

Two cautions apply. A regex scraping a badge out of `innerText` also matches the row's own
description, such as "Access dataset in place via provided path". And `innerText.split('\n')[0]`
returns the checkbox's `check` glyph on rows where the checkbox renders first. Read the label
from the element that holds it.

### A stale JWT fails as a foreign key, not as a 401

`prisma migrate reset` gives seeded users new `subject_id` values. The browser still holds a
token minted against the old ones. `authenticate` verifies the signature and trusts the
payload, so the request is authorized and then fails inside the write on
`grant_granted_by_fkey`. The response is a 409 reading "Request could not be processed due to
a constraint violation", and nothing names the session.

Navigate to `https://localhost/dev-login`, then confirm the new token:

```js
() => JSON.parse(atob(localStorage.getItem('token').split('.')[1])).profile.subject_id
```

This is tracked as T9 in `.todo/local/L1-authorization-enforcement.md`.

## Composable state

### Return `reactive()`, not a plain object of refs

A composable that returns `{ subject, expiry, … }` as bare refs breaks `v-model`. In a template,
`formState.subject` is then the ref, not its value. `v-model="formState.subject"` replaces the
ref on an object nothing tracks, so the composable never sees the input. In
`useRequestAccessForm` this kept `isFormValidForSubmit` false, and the form could never submit.

The same shape broke `useReviewRequestForm` differently. The modal held the object in a `ref`
and read `formState.value`, which resolved to `undefined`, so the decision form never
rendered.

Both composables now return `reactive({...})`. `reactive` unwraps refs on read and writes
through on assignment. The switch breaks every reader that wrote `.value`, so convert the
readers in the same change.

### Share one composable instance across form and modal

`RequestAccessModal` owns the one `useRequestAccessForm` instance and passes it to
`RequestAccessForm` as `:form-state`. When the form and the modal each built their own
instance, the modal's Submit button read a state the form never filled in. A fixed composable
does not help while two instances exist.

## Icons

Two icon vocabularies are live, and they do not mix.
[UI coding standards](../ui-coding-standards.md#icons) states the rule.

- `Icon`, `<i-mdi-…>`, and props feeding them, such as `MetricCard`'s and `ActionButton`'s
  `icon`, take Iconify MDI names.
- `VaButton`'s own `icon` prop takes Material Symbols ligatures: `add`, `close`,
  `remove_circle_outline`.

An `mdi-` name on a `VaButton` does not fail. It renders the literal string `mdi-close` inside
the button. That passes eslint and `npm run build`. Check with
`innerText.match(/mdi-[a-z-]+/g)` after any icon change.

An `<i-mdi-…>` component whose name the MDI set does not carry fails differently. The
`unplugin-icons` resolver cannot resolve it, so importing the component fails the Vite
transform. `ReviewRequestForm` once used `i-mdi-close-all`, and the whole modal failed to load.

## Styling traps

### Borders need `border` and `border-solid`

[V2 design system — Borders need two classes](../v2-design-system.md#borders-need-two-classes)
has the measurement. When touching a panel, grep for a class attribute with a border width or
colour token and no border style token.

### Confirm a class generated a rule

Tailwind scans source text for complete class names. A class built by interpolation, such as
`` `from-${props.hoverTheme}-500/0` ``, reaches the DOM and matches nothing. Scan the loaded
stylesheets:

```js
() => {
  const want = 'bg-red-50';
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (r.selectorText && r.selectorText.replace(/\\/g, '').includes('.' + want)) return r.cssText;
    }
  }
  return 'NOT GENERATED';
}
```

This also checks a colour path you cannot reach on screen. The `danger` tone of `ModernAlert`
needs a 409 from the API, and scanning for its classes substitutes for triggering one.

### `preset="primary"` is not the filled button

`<VaButton preset="primary">` computes a pale tint with coloured text.
`<VaButton preset="secondary">` computes a transparent background and no border, so it renders
as coloured text. The filled button for a page's one action is `<VaButton color="...">` with no
preset. The "Request Access" button in `DatasetRequestsTab.vue` is the reference.

A destructive action alone in a page header should not use `preset="secondary" color="danger"`.
It reads as a stray red link. Beside a filled primary in a modal footer, the same pair reads
correctly and is the convention.

### `ModernButtonToggle` needs `value-by` when its options are objects

Without `value-by="value"`, `getValue()` returns the whole option. The toggle then emits
`{label: 'Accepted', value: 'ACCEPTED'}`. Nothing renders selected on first paint. The emitted
object also serialises into the query string as `status[label]=Accepted&status[value]=ACCEPTED`,
which the API rejects with a 400. Every current caller in `pages/v2` and `components/v2` passes
it.

### `Badge` refuses Vuestic's `info` tone

`components/v2/Badge.vue` validates `color` against its own list. That list has `sky` and no
`info`, although `MetricCard` takes `info`. `<Badge color="info">` logs a prop-validation
warning and falls back to the default. Use `sky`. Check the validator before picking a tone.

### A table that widens the page

[V2 design system — Tables](../v2-design-system.md#tables) holds the rule and the fix. To find
the cause of a sideways scroll, walk up from `.va-data-table` and print each element's
`clientWidth`, `display`, and computed `min-width`. `line-clamp-1` on a cell does nothing,
because Vuestic's table sets `white-space: nowrap`. `tdClass: "truncate"` on a column with no
width bound does nothing either.

### Measuring a larger root font size

A user text-size setting changes the font size on `<html>`. Set
`document.documentElement.style.fontSize = '120%'` on a loaded page, with no reload. The DOM
stays identical, so each element's computed `font-size` compares against a 100% baseline in
DOM order. An element whose ratio stays at 1 is pinned in px.

- Vuestic's own icons, such as `va-button__left-icon` and the sort and select toggles, never
  scale. Expect them in every unscaled list.
- `document.documentElement.scrollHeight` barely moves, because the layout scrolls inside
  `#main`. Measure sideways overflow and the sidebar width instead. The sidebar is `13rem`.
- A page with content still arriving gives mismatched element counts. Wait for `networkidle`
  plus a pause before the baseline.
- `body` sets `15px` in `base.css`, yet that rule does not explain an unscaled element.
- `/users`, `/datasets/1`, and `/stats` already scroll sideways at or near 100%. Measure a
  baseline before blaming a change.

Use `text-2xs` and `text-xs-plus` for the 11px and 13px steps, defined in
`ui/tailwind.config.js`. A `text-[Npx]` class is what this measurement finds.

The setting lives in `composables/useFontSize.js` under the storage key `font-size`. VueUse's
`useStorage` writes the default `small` on first read, so a fresh browser already holds a
value. `src/composables` is an auto-import directory. Adding a file there regenerates
`ui/auto-imports.d.ts` and `ui/.eslintrc-auto-import.json`, and both get committed.

The console shows 401s from `/api/notifications/stream` on every page. They are unrelated to
style changes.

## Page structure traps

### A `ref` into a sibling tab is null

The v2 detail pages render one tab at a time, with `v-if="activeTab === '…'"`. A template ref
bound to a tab component is `null` while another tab shows. A cross-tab call written as
`otherTabRef?.method?.()` then does nothing, and the optional chaining hides it.

Move the shared thing up instead of reaching sideways. `AddGroupMemberModal` mounts on the
group page, and both the members and invitations tabs emit `invite`. The page owns the count
fetches again, so a badge is correct from either tab. When you see `someTabRef?.x?.()`, check
whether the two tabs can render at the same time. If they cannot, it is a bug.

### `ErrorState` needs the error object and a `@retry`

[V2 design system — The primitive set](../v2-design-system.md#the-primitive-set) describes
`ErrorState`. Two failures are silent:

- A page that stores `err?.response?.data?.message ?? "Failed to load X."` loses the status.
  The refusal branch never fires, and the page shows the ordinary failure title. Store `err`.
- The "Try again" button always renders and emits `retry`. Without `@retry="fetchWhatever"` it
  does nothing. Confirm in the network panel, because nothing visible changes.

Verify refusal wording in the e2e suite: `getByTestId('error-state')` with
`toContainText(/do not have access/i)` and `not.toContainText(/Request failed with status code/i)`.
`discovery.spec.js` has the group case and `dataset.spec.js` the dataset case.

### A directory of pages with a non-default layout needs an `index.vue`

`setupLayouts` in `vite-plugin-vue-layouts` wraps every top-level route with
`layouts[route.meta?.layout || 'default']`. It then recurses and wraps deeper routes that carry
their own `meta.layout`. A page at `pages/public/groups/[id].vue` has `/public` as its top-level
record, which has no meta. So the default layout wraps it, and the page's own layout nests
inside. The page still renders, inside the application sidebar.

The plugin skips the top-level wrap when a top-level route has no component and has a child
with `path === ''` already wrapped. An `index.vue` carrying the same `meta.layout` produces that
child. `pages/public/index.vue` exists for this reason, and `pages/auth/` uses the same shape.

Read the matched chain to check which layout applied:

```js
() => document.querySelector('#app').__vue_app__.config.globalProperties.$router
  .currentRoute.value.matched.map(r => `${r.path} ${r.meta?.isLayout ? '[layout]' : ''}`)
```

One `[layout]` entry is right. Two means the default layout wraps yours.

### A page reachable without a token cannot use `@/services/api`

That client attaches a bearer token and calls `router.push("/auth/logout")` on any 401. On a
page for signed-out readers, a refusal becomes an ejection. `services/v2/publicProfiles.js` is
the pattern: a bare `axios.create({ baseURL: config.apiBasePath })` with no interceptors. The
page renders its own error state.

A public page also needs `requiresAuth: false` and `layouts/public.vue`. `layouts/default.vue`
mounts the sidebar and the alert poller, and both assume a session. An `<img>` cannot carry an
Authorization header. The public router therefore serves the group avatar, so one URL works for
an anonymous reader and, through the `jwt` cookie, for a signed-in admin.

## Gating on state

[V2 page patterns — Capability gating](../v2-page-patterns.md#capability-gating) holds the
rule: `capabilities` answers authority, `available_actions` answers state, and
`useCapabilities` exposes `can`, `available`, `enabled`, `holds`, and `admits`. Three
operational facts sit beside it.

- `api/tests/model/uiScan.test.js` flags UI reads of `is_archived`, `is_deleted`, `is_active`,
  `revoked_at`, the request and invitation statuses, and any `:is-archived` binding. A badge
  that reads a raw field needs an `ALLOWED` row with its reason. A gate needs an API answer.
- `stores/v2/me.js` holds `isPlatformAdmin`, `adminGroupCount`, and `oversightGroupCount` from
  `GET /v2/users/me`. Call `ensureLoaded()` before reading them. No v2 file reads
  `auth.canAdmin`.
- The boot-time `verifyInSync` guarantees every policy action has a state rule. Derived
  capabilities such as `request_access` have none, so check `api/src/state/builtin/` first.

### The archive dialogs list what the archived state forbids

`GroupArchiveConfirmModal.vue` and `CollectionArchiveConfirmModal.vue` take
`action="archive"|"unarchive"`. When shown, they fetch
`GET /v2/states/:type/archived/forbidden-actions` once per type in scope. They render
`prohibitedLabels` from `services/v2/stateLabels.js`. The group dialog covers the group,
collection, dataset, grant, and access request. The collection dialog covers the collection,
grant, and access request.

A new mutating action needs an entry in `ACTION_LABELS`. `api/tests/model/stateLabels.test.js`
fails until it has one. It also fails when an entry names an action the archived state admits.
A failed fetch leaves the list empty rather than guessed.

The route answers from the state container's `examples.archived` row. A type with no such
example answers 404, because an empty list would read as "archiving forbids nothing".

## Scripted edits across `.vue` files

Most work in this area repeats one edit across many files.

**Scope every replacement to its tag.** A bare `s.replace('color="secondary"', 'color="neutral"')`
also rewrites a `VaChip` three elements away, where `secondary` is valid and `neutral` is not.
`re.sub(r'\s+size="small"', '', s)` strips the attribute off every `VaButton`. Match the opening
tag first and rewrite only its attributes:

```python
TAG = re.compile(r"<ModernChip\b(.*?)(/?)>", re.S)
out = TAG.sub(lambda m: "<Badge%s%s>" % (rewrite_attrs(m.group(1)), m.group(2)), s)
```

**Anchor every edit.** Each script should `assert old in s` or `sys.exit` when its anchor is
missing. A script that reports success while matching nothing is worse than one that crashes.

**Diff before believing the script.** Run
`git diff -U0 -- ui/src | grep -E "^[-+]" | grep -v "^[-+][-+]"` and read every line you did not
mean to change. Both collateral edits above passed `eslint` and `npm run build`.

When a codemod goes wrong, run `git checkout HEAD -- <files>` and redo it. Patching the damage
by hand misses sites.

## The verify loop

Run from `ui/`, because `npm run build` reports "Missing script" elsewhere:

```
npx prettier --write <changed files>
npx eslint "src/**/*.vue"
npm run build
```

`npm run build` is the real template check. `npx vue-tsc --noEmit` fails to start in this repo
with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Format only the files you changed. `src/pages/launch-notebook.vue` and `src/styles/base.css`
are unformatted at HEAD, and reformatting them adds unrelated diff.

## Shell traps

- `cp` and `rm` are aliased to prompt. A prompt inside a tool call hangs until timeout. Use
  `/bin/cp -f`, `command rm -f`, or `git rm`.
- zsh does not word-split an unquoted variable. `F="a.vue b.vue"; npx eslint $F` passes one
  filename. The tool either answers `No files matching the pattern "a.vue b.vue"` or checks
  nothing and exits clean. Write the paths inline, or use an array: `F=(a.vue b.vue)`.
- zsh expands `--include=*.vue` unless quoted: `--include="*.vue"`.
- A newline-joined file list can overflow an argument with "File name too long". Use
  `find ... -print0 | xargs -0`.
- macOS has no `timeout` command.

## Showing a refusal on the input it is about

A 409 can mean several things on one route. Renaming a group returns 409 for a taken name and
also for a stale `version`. A form therefore cannot mark the name input from the status alone,
and matching on the message text breaks when the wording changes.

The API names the input instead. Group create and rename answer a taken name with
`409 { message, field: 'name' }`. An `http-errors` object serialises any extra property it was
created with, so `createError(409, message, { field: 'name' })` puts `field` in the body.

`GroupCreateModal.vue` and `GroupEditMetadataModal.vue` read it the same way:

- On a response whose `field` is `name`, set a `nameError` ref to the message and keep the modal
  open. Any other error still goes to the toast.
- Bind `:error="!!nameError"` and `:error-messages="nameError ? [nameError] : []"` on the input.
- Clear `nameError` in a watcher on the name, and again in `show()`, because reopening can leave
  the name unchanged.
- Disable submit while `nameError` is set.

`e2e/src/specs/membership/create-child.spec.js` checks this in the browser.

## Exercising a page's API calls without a browser

A page that composes several endpoints can be checked with no browser. Mint a token per persona
and issue the page's exact calls:

```bash
curl -s -X POST http://localhost:3030/auth/test_login \
  -H 'Content-Type: application/json' -d '{"username":"alice"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
```

Call the API with `Authorization: Bearer <token>`. Drive each list once per persona: `quinn`
with no standing, `alice` as a group admin, and `test_user` as a platform admin. Print the
status and the response shape beside each label.

This approach has found defects that lint, the build, and reading the route file all missed:

- **Route order.** Express matches in registration order. A static path such as
  `/grants/expiring-soon` registered below `/grants/:id` is rejected as a malformed UUID, and the
  error names `id`. When a static path 400s about a param you did not send, look for a
  parameterised route registered above it.
- **A missing service function.** A route called a function that does not exist under that
  name. It returned 500 on every call while the service's own tests passed.
- **A wrong destructure.** A route destructured a key the service does not return, dropping
  half of every row.

Assert the shape, not only the status. A 200 missing the field the page reads is the failure a
user sees.

### Dashboard call notes

`pages/v2/home.vue` composes many calls. Two response shapes are easy to get wrong.

- `POST /groups/search` validates `limit` as `min: 1`, so a count-only call passes `limit: 1`
  and reads `metadata.total`. `limit: 0` is rejected with a 400. `POST /collections/search`
  accepts `limit: 0`. Check the route's validator before writing a count call.
- `GET /grants/expiring-soon` returns an unpaginated array of `{ subject, resource, grants }`.
  The stat card counts the array, and the panel slices it.

### Measuring with a Playwright script run by node

When the MCP profile is locked, a throwaway `.cjs` script in `e2e/` run with `node` needs no help
from the user. It needs `require('@playwright/test')`, `chromium.launch({ channel: 'chrome' })`,
and `ignoreHTTPSErrors: true`. Sign in with `/dev-login?username=…&next=…`. The detail pages
switch tabs through a ref, not the URL, so click `getByRole('tab', { name: /^Datasets/ })`.
Delete the script afterwards with `command rm -f`.

To call the API as a seeded user from such a script, sign in and read
`localStorage.getItem('token')`. The value is not JSON, and `JSON.parse` throws. Strip any
quotes and send it as a bearer token to `http://localhost:3030`.

Run these scripts one at a time. Three in parallel, all signing in as the same user, left two on
pages with no links.

After `npm run seed:demo` there is no `test_user`. Sign in as `alice` or another cast member.

## Legacy components v2 work borrows from

`components/dataset/import/FileListAutoComplete.vue` is the v1 directory typeahead. It only emits
`open` and `close`. The search itself runs in `ImportStepper.vue`, whose `watchDebounced` over
`[isFileSearchAutocompleteOpen, fileListSearchText]` calls `searchFiles()` only while the dropdown
is open. Setting the search text with the dropdown closed fetches nothing. The v2
`ImportDatasetModal.vue` does not use this component, but anyone reading it as a reference must
copy the open-state gate or the typeahead will look dead.

## Other facts worth knowing

- `UserSearchSelect.vue` searches `GET /v2/users` only from three characters and asks for at most
  ten rows. The API refuses anything else to a caller who is not a platform admin.
- The access requests page may log a `Pagination total_results` prop warning.
  `components/utils/Pagination.vue` declares `total_results` as a required `Number`, so the
  warning would be a transient `undefined` during the first fetch. This has not been confirmed in
  the browser. Check the console before spending time on it.
