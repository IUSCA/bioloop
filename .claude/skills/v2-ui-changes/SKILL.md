---
name: v2-ui-changes
description: Operational technique for changing the v2 Vue UI in this repository - how to verify a style claim against the running app, how to run a codemod across .vue files without collateral damage, and the traps that cost a session's time. Use when editing anything under ui/src/components/v2, ui/src/pages/v2, ui/src/components/utils, ui/vuestic.config.js, or ui/src/styles.
---

# Changing the v2 UI

The visual rules live in [docs/contributing/v2-design-system.md](../../../docs/contributing/v2-design-system.md).
This skill is the operational half: how to find out what is actually true, and how to
make a change across many files without breaking things that looked unrelated.

## Verify visual claims against the running app, never against the source

Reading a class string tells you what the author intended. It does not tell you what a
user sees. Four defects in this codebase were invisible to source reading and obvious in
one `getComputedStyle` call.

The app runs at `https://localhost` behind a self-signed certificate. Start it with
`bin/devserver.sh up`; the `dev-servers` skill covers the rest. Chrome DevTools MCP
cannot get past the certificate interstitial on its own, so ask the user to open the page
and log in inside the MCP-controlled browser, then drive the existing page rather than
opening a new one.

The pattern that works is `evaluate_script` returning measurements, not a screenshot to
squint at:

```js
() => {
  const el = document.querySelector('[role="note"]');
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, borderWidth: cs.borderTopWidth, text: el.innerText.length };
}
```

Take a screenshot afterwards to confirm the thing looks right, but let the numbers carry
the claim. A screenshot led to one wrong conclusion this way: three panels looked like
three different dark surfaces and measured identical.

### The MCP browser will not attach while a Chrome holds its profile

`list_pages` fails with *"The browser is already running for
`~/.cache/chrome-devtools-mcp/chrome-profile`"* whenever a Chrome is already open on that
profile without a debugging port. The MCP server can neither attach to it nor launch its own,
and retrying never clears it. Ask the user to quit that Chrome window; the next `list_pages`
then starts a fresh browser at `about:blank`.

Do not kill the process yourself — it is the user's browser and may hold their work.

Once attached, `https://localhost/dev-login?username=<user>&next=<path>` gets past both the
certificate interstitial and the login in one navigation, so the interstitial is not the
obstacle this page once described it as.

**Sign in as a group admin, not `test_user`.** The engine allows a platform admin before any
policy runs, so a pass driven as `test_user` exercises none of the policy paths. `user-054`
is a group admin in the seed. A 500 on `POST /grants/:id/revoke` survived an entire phase
because every browser check had been done as a platform admin.

### Reading state in the same `evaluate_script` that changed it returns the old values

A click handler updates a ref, and Vue re-renders on the next tick. A script that clicks and
then reads `checked`, `aria-disabled`, or `innerText` in the same call sees the values from
before the render, which looks exactly like the click having no effect.

Click in one call, read in the next. And remember a click on a checkbox row *toggles* — a
script that clicks the same row twice while debugging leaves it off, and the stale computed
state that remains is not a bug in the component.

Plain divs carrying `@click` — the access-type rows, for instance — do respond to `.click()`.
Only `va-select` needs the component-instance route below.

### A `va-select` cannot be driven by *synthetic* clicks or keys

This is the single biggest time sink when exercising a v2 form from the MCP browser.
`va-select` ignores a synthetic click on its rendered option, and it ignores ArrowDown
plus Enter after the listbox opens. The `take_snapshot` a11y tree does not enumerate the
options either, so there is nothing to pass to the `click` tool. Every combination of
`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click` dispatched at the option's centre
was tried and none of them changed the bound value.

**This is a limit of dispatched events, not of the component.** Playwright drives real input
over the Chrome DevTools Protocol, and a plain `.click()` on the select followed by a
`.click()` on `getByRole('option', { name: … })` changes the bound value normally. Measured
2026-09-09 on two selects in different components — the role select in `AddGroupMemberModal`
and the dataset-type select in `UploadDatasetModal` — both went green first time. So a
browser-driven test suite needs none of the workaround below; only the MCP browser does.

One trap when checking this by hand: a locator written as
`.va-select` filtered on the *current* value stops matching the moment the value changes, and
Playwright reports "element(s) not found". That reads as the click having failed when it is
the click having worked. Hold the select by position instead, and assert on its text.

Reach the component instance instead and set its state:

```js
() => {
  let c = document.querySelector('.va-modal').__vueParentComponent;
  while (c && c.type?.__name !== 'ImportDatasetModal') c = c.parent;
  window.__imp = c;                      // keep the handle for later calls
  return Object.keys(c.setupState);      // the refs `<script setup>` exposed
}
```

`setupState` is a proxy that unwraps refs, so assign the plain value —
`c.setupState.form.sourceId = 2`, never `.value = 2`, which throws because the property
is already unwrapped. Walk `c.subTree` recursively to reach a child component such as
`OwnerGroupSelect`, and set its `selectedId` the same way. The component's own watchers
then fire, so everything downstream — availability checks, `canSubmit`, emitted events —
runs exactly as it would for a real click.

Plain `<input>` elements are fine and take the `fill` tool. When `fill` is not available,
go through the native value setter so Vue's listener sees the change:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(input, 'RUN_UI');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

Buttons rendered by the app respond to a plain `.click()`, including the suggestion
buttons in a typeahead list.

### A stale JWT fails as a foreign key, not as a 401

After `prisma migrate reset` the seeded users get new `subject_id` values, and the browser
is still holding a token minted against the old ones. `authenticate` verifies the
signature and trusts the payload, so the request is authorized and then dies inside the
write on `grant_granted_by_fkey`, surfacing as a 409 reading "Request could not be
processed due to a constraint violation". Nothing in the response names the session.

Navigate to `https://localhost/dev-login`, which logs in and redirects on its own, then
confirm the new token before retrying:

```js
() => JSON.parse(atob(localStorage.getItem('token').split('.')[1])).profile.subject_id
```

It is filed as T9 in `.todo/local/L1-authorization-enforcement.md`.

### Finding a button by its text finds the wrapper first

`[...document.querySelectorAll('div, button')].find((el) => el.innerText.trim() === 'Request Access ...')`
returns the first match in document order. That is the outermost element whose text is the
same, such as the grid holding a single `ActionButton`. A `.click()` on the wrapper fires
nothing, so the check reads as the action being broken. Filter every match, take the last
one, and click `el.closest('button')`. The dataset Overview's Request Access action looked
dead this way on 2026-09-14 and worked on the second, correct click.

### A Vuestic checkbox takes a click on its wrapper, not on the input

Unlike `va-select`, `va-checkbox` needs no component-state surgery. The a11y snapshot lists
each one twice — a `button` carrying the whole label and a `checkbox` inside it. The
`checkbox` uid times out with "did not become interactive"; the enclosing `button` uid works
and flips the bound value. Click the button.

The same shape appears in the access-type selector, where a type the order already confers
renders checked and `disabled` with a "via <wider type>" chip. Reading `input.checked` alone
therefore over-counts what the user chose; read `disabled` too, and treat a disabled tick as
implied rather than selected.

### `ModernButtonToggle` needs `value-by` when its options are objects

Without it, `getValue()` returns the whole option, so the toggle emits
`{label: 'Accepted', value: 'ACCEPTED'}` instead of `'ACCEPTED'`. Two things then break at
once: nothing renders as selected on first paint, because the string model value never
equals an option object; and the emitted object is serialised into the query string as
`status[label]=Accepted&status[value]=ACCEPTED`, which the API rejects with a 400.

`GroupInvitationsTab` shipped without it and every filter click showed "Failed to load
invitations". Every other caller in `pages/v2` passes `value-by="value"` — grep for
`:options=` and check each one has it.

### Confirm a class actually generated a rule

Tailwind scans source text for complete class names. A class built by interpolation —
`` `from-${props.hoverTheme}-500/0` `` — reaches the DOM and matches nothing. Scan the
stylesheets to prove a rule exists:

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

This is also how to check a colour path you cannot reach on screen. The `danger` tone of
`ModernAlert` needs a 409 from the API; proving its five classes exist in the loaded CSS
was the practical substitute.

## Borders need `border` *and* `border-solid`

Measured, not inferred. An element carrying `border border-gray-200` computes to
`border-style: none` and `border-top-width: 0px`. Only `border border-solid border-gray-200`
computes to `1px solid`.

Tailwind's preflight does set `border-style: solid` with `border-width: 0`. Vuestic's own
reset loads after it and zeroes both again, and it beats the `.border` utility. So a
border colour alone renders nothing, and `border` alone renders nothing either.

Two rounds of this defect have been found. When touching any panel, grep for a class
attribute that has a border width or colour token and no border style token.

## Scripted edits across `.vue` files

Most of the work in this area is a repeated edit across twenty files. Two rules, both
learned by breaking things.

**Scope every replacement to the tag it belongs to.** A bare
`s.replace('color="secondary"', 'color="neutral"')` across a file also rewrites the
`VaChip` three elements away, where `secondary` is a valid Vuestic colour and `neutral`
is not. Likewise `re.sub(r'\s+size="small"', '', s)` strips the attribute off every
`VaButton` in the file. Match the opening tag first, rewrite only its attributes:

```python
TAG = re.compile(r"<ModernChip\b(.*?)(/?)>", re.S)
out = TAG.sub(lambda m: "<Badge%s%s>" % (rewrite_attrs(m.group(1)), m.group(2)), s)
```

**Diff before believing the script.** After any codemod, run
`git diff -U0 -- ui/src | grep -E "^[-+]" | grep -v "^[-+][-+]"` and read every line that
is not the thing you meant to change. Both collateral edits above passed `eslint` and
`npm run build` cleanly, so the toolchain will not catch them.

When a codemod does go wrong, `git checkout HEAD -- <files>` and redo it properly. Do not
try to patch the damage by hand — you will miss a site.

## Anchor every scripted edit

Every replacement script in this area should `assert old in s` or `sys.exit` when the
anchor is missing, so a silent no-op is impossible. A script that reports success while
having matched nothing is worse than one that crashes.

## The verify loop

```
npx prettier --write "src/components/v2/**/*.vue" "src/pages/v2/**/*.vue"
npx eslint "src/**/*.vue"
npm run build
```

`npm run build` is the real type and template check. `npx vue-tsc --noEmit` fails to start
in this repo with `ERR_PACKAGE_PATH_NOT_EXPORTED` and is not worth chasing.

Format only the files you changed. `src/pages/launch-notebook.vue` and
`src/styles/base.css` are unformatted at HEAD, and reformatting them adds unrelated diff
noise.

## Shell traps in this environment

- `cp` and `rm` are aliased to prompt. Use `/bin/cp -f`, `/bin/rm -f`, or `git rm`.
  A prompting command inside a tool call hangs until the call times out.
- zsh expands `--include=*.vue` unless it is quoted: `--include="*.vue"`.
- The Bash tool's working directory persists between calls. Prefer absolute paths, or
  re-`cd` at the start of each call.
- zsh does not word-split an unquoted variable. `F="a.vue b.vue"; npx prettier --write $F`
  passes one argument naming a file that does not exist, and prettier answers
  "No files matching". Worse, `npx eslint $F` then lints nothing and exits clean. List the
  files inline or use an array: `F=(a.vue b.vue); npx prettier --write $F`.
- A newline-joined file list can overflow an argument and produce "File name too long".
  Use `find ... -print0` piped to `xargs -0`.

## Exercising a page's API calls without a browser

The MCP browser is often unavailable, because another Chrome holds its profile. A page
whose job is to compose several endpoints can still be validated properly: mint a token
per persona and issue the page's exact calls.

```bash
curl -s -X POST http://localhost:3030/auth/test_login \
  -H 'Content-Type: application/json' -d '{"username":"user-054"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
```

Then call the API directly with `Authorization: Bearer <token>`. Drive one list per
persona — `ajohnson` is a standard user, `user-054` a group admin, `test_user` a platform
admin — and print the status and the shape of each response beside its label.

This found three live defects in one pass that lint, `npm run build`, and reading the
route file all missed:

- Two routes were unreachable because Express matches in registration order, and
  `/grants/expiring-soon` and `/grants/mine` sat below `/grants/:id`. Every request to
  them was rejected as a malformed UUID, and the error names `id`, not the path you
  called. **When a static path 400s complaining about a param you did not send, look for
  a parameterised route registered above it.**
- A route called a service function that does not exist, under a different plural. It
  returned 500 on every call, and the service's own tests passed the whole time.
- A route destructured a key the service does not return, silently dropping half of every
  row and adding an undefined one.

Assert the shape, not just the status. A 200 whose body is missing the field the page
reads is the failure that reaches a user.

## Assert a rendered claim by measuring, not by reading the template

The pattern that carried every claim in the access-type order work was one `evaluate_script`
returning a table of measurements per row:

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

Two cautions learned doing it. A regex scraping a badge out of `innerText` also matches the
row's own description — "Path to storage · Access dataset in place **via provided path**"
looked like a "via" badge until `aria-disabled` and `opacity` said the row was untouched. And
`innerText.split('\n')[0]` returns the checkbox's `check` glyph rather than the label on rows
where the checkbox renders first, so read the label from the element that holds it rather
than from position.

## A `ref` into a sibling tab is null, because only one tab is rendered

The v2 detail pages render exactly one tab at a time — `v-else-if="activeTab === '…'"` —
so a template ref bound to a tab component is `null` whenever a different tab is showing.
Any cross-tab call written as `otherTabRef?.method?.()` therefore does nothing, silently,
and the optional chaining is what hides it.

Three bugs in the group page came from this one shape: the invitations tab's "Invite by
email" button (`membersTabRef?.openAddMemberModal?.()`), the members tab's refresh of the
invitation list after sending one (`invitationsTabRef?.refresh?.()`), and the Overview
tab's "Add Member" quick action. Each looked correct in review and each was a no-op.

The fix is to move the shared thing up rather than to reach sideways. `AddGroupMemberModal`
now mounts on the page and both tabs emit `invite`; the page owns the count refetches, so a
badge is correct whichever tab the action started from. A ref into a tab is then only ever
used to refresh the tab you are already looking at, which is the case where it is live.

When you see `someTabRef?.x?.()` in a tabbed page, check whether the two tabs can be
rendered at the same time. If they cannot, it is a bug.

## `preset="primary"` is not the filled button

Measured, not inferred. `<VaButton preset="primary">` computes a pale tint with coloured
text; `<VaButton preset="secondary">` computes `background: rgba(0,0,0,0)` and
`border: 0px none`, so it renders as plain coloured text with a hover-only `::before`. The
filled button every v2 page uses for its one page-level action is `<VaButton color="...">`
with no preset at all — `DatasetRequestsTab.vue`'s "Request Access" is the reference.

This matters most for a destructive action standing alone in a page header, where
`preset="secondary" color="danger"` reads as a stray red link rather than a button. Beside a
filled primary, in a modal footer, it reads correctly and is the established convention.

## Things that are already broken, so do not chase them

Re-checked 2026-09-09 against the code. Three entries that were here have gone, because the
access-requests phases fixed them; they are listed under [Fixed since](#fixed-since) so a
session holding an older copy of this page does not go looking.

- The access requests page may still log a `Pagination total_results` prop warning.
  `total_results` is declared `required` and typed `Number` in
  `components/utils/Pagination.vue`, so the warning would be a transient `undefined` while
  the first fetch is in flight rather than a missing binding. **Not re-verified in the
  browser** — confirm in the console before spending time on it.

### Fixed since

- **`AccessRequestReviewModal.vue`, the "Review Modal Stub" file.** Deleted. Nothing under
  `ui/src` references it. `ReviewRequestModal.vue` is what the pages mount.
- **A 400 on the reviewed-requests list.** The route now accepts `reviewed_at` as a
  `sort_by`, which is what that tab sorts by — `routes/access_requests.js`, the
  `/reviewed-by-me` validator.
- **The request card on a dataset's Requests tab not opening.** `AccessRequestCard` emits
  `view` from a click on its root, and `DatasetRequestsTab` binds both `@view` and
  `@review`.

## `ErrorState` decides the refusal wording, so give it the error, not a string

`ErrorState` takes `:error="error"` and a `subject` noun phrase. It reads
`error.response.status` and, on 401/403/404, writes its own heading and message; everything
else falls back to the caller's `title`/`message` and then to the API's `message` from the
response body. It never renders `error.message`.

**A page that stores `err?.response?.data?.message ?? "Failed to load X."` breaks this
silently.** The string has no `.response`, so the refusal branch never fires and the page
shows the ordinary failure title. Five v2 surfaces did exactly that, and — because a string
also has no `.message` — the old `:message="error?.message"` binding rendered *nothing* on
them while the other fourteen rendered "Request failed with status code 403". Reading the
templates made all nineteen look identical; only the running app showed the split. Store
`err` itself in the catch block.

Verify it in the e2e suite rather than by eye: `getByTestId('error-state')` plus
`toContainText(/do not have access/i)` and `not.toContainText(/Request failed with status
code/i)`. `discovery.spec.js` has the group-page case and `dataset.spec.js` the dataset one.

## `ErrorState`'s "Try again" does nothing unless you bind `@retry`

The component always renders the button and emits `retry`; it does not reload anything by
itself. A caller that renders `<ErrorState :message="error" />` gives the user a button
that fires into the void, which reads as a second failure. Bind it:
`@retry="fetchWhatever"`. Confirm by watching the network panel rather than the screen —
nothing visible changes either way.

## `VaButton`'s `icon` prop takes a Material Symbols name, not an `mdi-` one

Two icon vocabularies are live in this UI and they are not interchangeable. The `Icon`
component takes Iconify MDI names — `<Icon icon="mdi-close" />` — and so do the props that
feed it, such as `MetricCard`'s `icon` and `ActionButton`'s. `VaButton`'s own `icon` prop
goes to Vuestic's icon config, which resolves Material Symbols ligatures: `add`, `close`,
`remove_circle_outline`. `pages/v2/groups/index.vue` uses `icon="add"` and
`GrantsBySubjectPanel.vue` uses `icon="remove_circle_outline"`.

An `mdi-` name on a `VaButton` does not fail. It renders **the literal string `mdi-close`**
inside the button, which reads as a layout bug rather than a wrong prop and passes eslint and
`npm run build`. It was caught by reading `modal.innerText` in the browser and finding
`mdi-close` in it — worth a `innerText.match(/mdi-[a-z-]+/g)` check after any icon change.

## A layout applies only to a TOP-LEVEL route, so a page two directories deep gets `default`

This cost the public profile pages a whole verification pass, and it is silent: the page
rendered correctly *inside* the application sidebar.

`setupLayouts` in `vite-plugin-vue-layouts` wraps every top-level route with
`layouts[route.meta?.layout || 'default']`, then recurses and wraps any deeper route that has
its own `meta.layout`. A page at `pages/public/groups/[id].vue` has `/public` as its
top-level record — an intermediate directory route with no meta of its own — so it takes the
default layout, and the page's own layout nests inside it. The matched chain shows two
records carrying `meta.isLayout`.

There is one escape hatch, and `pages/auth/` uses it without saying so. The plugin skips the
top-level wrap when a top-level route has no component and has a child with `path === ''`
that the inner pass already wrapped. An `index.vue` in the directory, carrying the same
`meta.layout`, produces exactly that child.

**So a directory of pages that needs a non-default layout needs an `index.vue` carrying that
layout, even when nothing links to it.** `pages/public/index.vue` says so in its own
docblock, because the file otherwise looks deletable.

To check which layout actually applied, read the matched chain rather than the screen:

```js
() => document.querySelector('#app').__vue_app__.config.globalProperties.$router
  .currentRoute.value.matched.map(r => `${r.path} ${r.meta?.isLayout ? '[layout]' : ''}`)
```

One `[layout]` entry is right. Two means the default layout is wrapping yours.

## `Badge` refuses Vuestic's `info` tone

`Badge.vue` validates `color` against its own list — `primary`, `success`, `warning`,
`danger`, `neutral`, `violet`, `sky`, `indigo`, `teal`, `orange`, `rose` — and that list has
no `info`, even though `info` is a normal Vuestic colour and `MetricCard` takes it. A badge
written as `<Badge color="info">` logs a prop-validation warning and falls back to the
default rather than rendering the tone you asked for. Use `sky` for the same reading.

The validator is deliberate: `Badge` refuses an unrecognised tone rather than resolving it.
Check the list in `components/v2/Badge.vue` before picking a colour, rather than assuming
the Vuestic palette applies.

## A page reachable without a token cannot use `@/services/api`

That client attaches a bearer token and, on any 401, calls `router.push("/auth/logout")`.
On a page written for signed-out readers — the public group and collection profiles — that
turns an ordinary refusal into an ejection from the page. `services/v2/publicProfiles.js` is
the pattern: a bare `axios.create({ baseURL: config.apiBasePath })` with no interceptors, and
the page renders its own error state instead of a toast.

Two things follow for any future public page. Give it `requiresAuth: false` and a layout with
no sidebar (`layouts/public.vue`), because `layouts/default.vue` mounts the sidebar and the
alert poller, both of which assume a session. And remember that an `<img>` cannot carry an
Authorization header: the group avatar is served by the public router precisely so the same
URL works for an anonymous reader and, through the `jwt` cookie, for a signed-in admin
looking at a profile that is still private.

## A table that widens the page: measure the ancestor chain

A wide `VaDataTable` made a group page scroll sideways on 2026-09-14. Reading the templates
suggested nothing; walking up from `.va-data-table` and printing each element's
`clientWidth`, `display`, and computed `min-width` found it in one run. The element that
refused to shrink was `.va-inner-loading`, which Vuestic gives `min-width: fit-content`.
`App.vue` wraps the whole layout in one, so it grew `#main` to 1440px in a 1000px window.
The fix and the column rules are in the design doc under *Tables*.

Two things that looked like fixes are not. `line-clamp-1` on a cell does nothing, because
Vuestic's table sets `white-space: nowrap` and the text never wraps into a second line.
`tdClass: "truncate"` on a column with no width bound does nothing either.

## Measuring without the MCP browser: a Playwright script run with node

When `list_pages` reports the profile is locked, a throwaway `.cjs` script in `e2e/` run with
`node` works with no help from the user. It needs `require('@playwright/test')`,
`chromium.launch({ channel: 'chrome' })`, and `ignoreHTTPSErrors: true`. Sign in with
`/dev-login?username=…&next=…`. The detail pages switch tabs through a ref, not the URL, so
click `getByRole('tab', { name: /^Datasets/ })`. Delete the script afterwards.

Run such scripts one after another, not in parallel. Three at once, all signing in as the
same user, left two of them on pages with no links.

After `npm run seed:demo` there is no `test_user`, and dev-login reports "No active user
named 'test_user'". Sign in as `alice` or another of the flows cast instead.

macOS has no `timeout` command, and `npm run build` fails with "Missing script" unless it
runs from `ui/`.

## Keeping this current

When a session in this area hits something this page does not mention — a new trap, a
codemod shape that worked, a claim that turned out to be false — amend this file in the
same change. Record dead ends explicitly, and verify a claim against the running system
before writing it down here.
