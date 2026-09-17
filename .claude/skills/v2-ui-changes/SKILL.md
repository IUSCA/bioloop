---
name: v2-ui-changes
description: Operational technique for changing the v2 Vue UI in this repository - how to verify a style claim against the running app, how to run a codemod across .vue files without collateral damage, and the traps that cost a session's time. Use when editing anything under ui/src/components/v2, ui/src/pages/v2, ui/src/components/utils, ui/vuestic.config.js, or ui/src/styles.
---

# Changing the v2 UI

The rules live in docs; this skill is the traps and commands to hold in mind at once.

- [docs/contributing/techniques/v2-ui-changes.md](../../../docs/contributing/techniques/v2-ui-changes.md)
  is the full reference: snippets, measurement recipes, and why each trap happens.
- [v2-design-system.md](../../../docs/contributing/v2-design-system.md) — visual rules.
- [v2-page-patterns.md](../../../docs/contributing/v2-page-patterns.md) — capability gating, page shapes.
- [v2-ui-vocabulary.md](../../../docs/contributing/v2-ui-vocabulary.md) — words for access control.
- [ui-coding-standards.md](../../../docs/contributing/ui-coding-standards.md) — icons, components.
- The `dev-servers` skill starts the app and signs in.

## Verify against the running app, never the source

A class string is intent, not what renders. Carry a claim with `evaluate_script` returning
`getComputedStyle` numbers; a screenshot only confirms.

- **MCP browser locked:** `list_pages` says "The browser is already running for
  `~/.cache/chrome-devtools-mcp/chrome-profile`". Retrying never clears it. Ask the user to quit
  that Chrome. **Do not kill it yourself** — it is their browser. Fallback: a throwaway
  Playwright `.cjs` script run by `node` (docs page, "Measuring with a Playwright script").
  Write it inside `e2e/`, and launch with `chromium.launch({ channel: 'chrome' })`; no
  Playwright browser is installed, so a bare launch fails on `chrome-headless-shell`.
- **`getByLabel` finds no Vuestic input.** `VaInput` draws its label as a sibling, so
  `getByLabel('Tagline')` times out. Use `.va-modal input[type=text]`.
- **Sign in:** `https://localhost/dev-login?username=<user>&next=<path>` passes the cert warning
  and login in one navigation.
- **Check as another user in an isolated context**, or you replace the user's own login:
  `new_page({ url: "https://localhost/dev-login?username=bob&next=…", isolatedContext: "statecheck" })`.
- **Never verify policy as `test_user`.** A platform admin is allowed before any policy runs.
  Use a group admin such as `alice`. The demo world has no platform admin at all.
- **A missing button proves nothing.** Compare `_meta.capabilities` with
  `_meta.available_actions`; if the viewer never held the action, the check could not fail.

## Driving components from the MCP browser

- **Click in one `evaluate_script`, read in the next.** Vue re-renders on the next tick, so a
  same-call read shows old values and looks like a dead click. A checkbox row click toggles.
- **`va-select` ignores synthetic clicks and keys.** Set state through the component instance:
  walk `__vueParentComponent` up to the named component, then assign
  `c.setupState.form.sourceId = 2` (plain value, never `.value`, which throws). Playwright's
  real input drives `va-select` normally, so e2e tests need no workaround.
- **`va-checkbox`:** click the enclosing `button` uid from the snapshot, not the `checkbox` uid.
  A `disabled` checked box in the access-type selector is implied, not chosen.
- **Finding a button by text returns the outermost wrapper.** Take the last match and click
  `el.closest('button')`.
- **Stale JWT after `prisma migrate reset`** fails as a 409 constraint violation
  (`grant_granted_by_fkey`), not a 401. Visit `/dev-login` before debugging the write path.

## Composable state

- **Return `reactive({...})`, not a plain object of refs.** With bare refs,
  `v-model="formState.subject"` replaces the ref on an untracked object, and the composable
  never sees the input. `useRequestAccessForm` could never submit this way. Switching to
  `reactive` breaks every `.value` reader, so convert them in the same change.
- **One composable instance, owned by the modal, passed to the form** (`:form-state`). Two
  instances mean Submit reads a state the form never fills.

## Build breakers and silent renders

- **An `<i-mdi-…>` name the MDI set lacks fails the Vite transform**, and the whole importing
  component fails to load (`i-mdi-close-all` did this). Check the name exists.
- **`VaButton`'s `icon` prop takes Material Symbols** (`add`, `close`). An `mdi-` name renders the
  literal text `mdi-close` and passes lint and build. After icon changes, run
  `innerText.match(/mdi-[a-z-]+/g)`.
- **Borders need `border border-solid border-<color>`.** Vuestic's reset zeroes the rest.
- **Interpolated Tailwind classes** (`` `bg-${tone}-50` ``) generate no CSS. Scan
  `document.styleSheets` to confirm a rule exists.
- **`preset="primary"` is a pale tint and `preset="secondary"` is bare text.** The filled button
  is `<VaButton color="…">` with no preset.
- **`ModernButtonToggle` with object options needs `value-by="value"`.** Without it, it emits the
  whole option, and the API 400s on `status[label]=…`.
- **`Badge` has no `info` tone.** It warns and falls back; use `sky`.

## Page structure traps

- **A `ref` into a sibling tab is `null`.** Only one tab renders (`v-if`), so
  `otherTabRef?.method?.()` silently does nothing. Lift the shared modal or refetch to the page.
- **`ErrorState` needs `:error="err"`, the object.** A flattened string loses the status, so the
  refusal wording never shows. "Try again" does nothing without `@retry`.
- **A pages directory with a non-default layout needs an `index.vue` carrying that layout.**
  Otherwise the default layout wraps it and the page renders inside the sidebar.
  `pages/public/index.vue` exists for this.
- **A page reachable without a token cannot use `@/services/api`**, which logs out on any 401.
  Copy `services/v2/publicProfiles.js`, and use `requiresAuth: false` with `layouts/public.vue`.
- **Gate on state through `useCapabilities`, never on raw fields.** `api/tests/model/uiScan.test.js`
  fails on `is_archived`, `revoked_at`, statuses, and `:is-archived`. `request_access` never
  appears in `available_actions`, so do not gate it with `enabled`.
- **A new mutating action needs an `ACTION_LABELS` entry** in `services/v2/stateLabels.js`, or
  `api/tests/model/stateLabels.test.js` fails.

## Calling the API behind a page

Mint a token per persona and issue the page's exact calls; assert the shape, not only the status:

```bash
curl -s -X POST http://localhost:3030/auth/test_login -H 'Content-Type: application/json' \
  -d '{"username":"alice"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
```

- **A static path that 400s about a param you did not send** (`id`) sits below a parameterised
  route such as `/grants/:id`. Express matches in registration order.
- **A refusal about one input carries `field`.** `409 { message, field: 'name' }` from group
  create and rename. Put `message` on that input with `:error`/`:error-messages`, clear it when
  the value changes, and branch on `field`, never on the status or the text.
- **`POST /groups/search` rejects `limit: 0`.** A count-only call passes `limit: 1` and reads
  `metadata.total`. `POST /collections/search` accepts `0`. Check the validator.
- **`GET /grants/expiring-soon` is an unpaginated array of `{ subject, resource, grants }`.**
  Count the array; slice it for a panel.
- **The legacy `FileListAutoComplete` fetches only while its dropdown is open.** The watcher lives
  in `ImportStepper.vue` and is gated on `isFileSearchAutocompleteOpen`. Setting search text
  with the dropdown closed fetches nothing. Copy the gate when reusing it as a reference.

## Scripted edits across `.vue` files

- **Scope every replacement to its opening tag.** A file-wide `color="secondary"` replace also
  rewrites an unrelated `VaChip`. Match `<Tag\b(.*?)(/?)>` and rewrite only its attributes.
- **Anchor every edit:** `assert old in s` or `sys.exit`. A silent no-op is worse than a crash.
- **Diff before believing it:** `git diff -U0 -- ui/src | grep -E "^[-+]" | grep -v "^[-+][-+]"`.
  Collateral edits pass eslint and build.
- **When it goes wrong,** `git checkout HEAD -- <files>` and redo. Hand-patching misses sites.

## Verify loop

Run from `ui/`; `npm run build` reports "Missing script" elsewhere.

```
npx prettier --write <only the files you changed>
npx eslint "src/**/*.vue"
npm run build
```

- `npm run build` is the real template check. `npx vue-tsc --noEmit` fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`; do not chase it.
- `src/pages/launch-notebook.vue` and `src/styles/base.css` are unformatted at HEAD. Leave them.
- Adding a file under `src/composables` regenerates `ui/auto-imports.d.ts` and
  `ui/.eslintrc-auto-import.json`. Commit both.

## Shell traps

- `cp` and `rm` prompt (aliased), which hangs a tool call. Use `/bin/cp -f` and `command rm -f`.
- zsh does not split `$F`. `eslint $F` gets one filename. List paths inline or use an array.
- Quote globs in flags: `--include="*.vue"`.
- Long file lists: `find … -print0 | xargs -0`. macOS has no `timeout`.

## Keeping this current

When a session in this area hits something this page does not mention — a new trap, a
codemod shape that worked, a claim that turned out to be false — amend this file in the
same change. Put the immediate trap here and the detail in
[docs/contributing/techniques/v2-ui-changes.md](../../../docs/contributing/techniques/v2-ui-changes.md).
Record dead ends explicitly, and verify a claim against the running system before writing
it down here.
