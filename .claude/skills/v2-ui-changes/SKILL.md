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

### A `va-select` cannot be driven by clicks or keys

This is the single biggest time sink when exercising a v2 form from the MCP browser.
`va-select` ignores a synthetic click on its rendered option, and it ignores ArrowDown
plus Enter after the listbox opens. The `take_snapshot` a11y tree does not enumerate the
options either, so there is nothing to pass to the `click` tool. Every combination of
`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click` dispatched at the option's centre
was tried and none of them changed the bound value.

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
- A newline-joined file list can overflow an argument and produce "File name too long".
  Use `find ... -print0` piped to `xargs -0`.

## Things that are already broken, so do not chase them

- `pages/v2/home.vue` renders nothing. Its template reads `dashboard.loading` and
  `dashboard.isGroupAdmin`; its `<script setup>` never defines `dashboard`. Unfinished
  work on the `abac` branch, not a regression.
- `AccessRequestReviewModal.vue` renders the literal text "Review Modal Stub".
- The access requests page logs a `Pagination total_results` prop warning and a 400 on
  reviewed requests.

## Keeping this current

When a session in this area hits something this page does not mention — a new trap, a
codemod shape that worked, a claim that turned out to be false — amend this file in the
same change. Record dead ends explicitly, and verify a claim against the running system
before writing it down here.
