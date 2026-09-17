---
title: Uniform Search
status: idea
implemented: none
last_verified: 2026-09-17
---

::: danger Idea — not committed to
**Nobody has committed to building this.** It proposes one shared search layer in the API and
one in the v2 UI, so every v2 search box behaves the same way. No `services/search` module,
`usePagedSearch` composable, or trigram index exists.
:::

<!-- cspell:ignore imag imgaing -->

# Uniform Search

v2 has eleven free-text searches, and each one handles its input differently. This page sets
out general practice for search on Postgres, what v2 does today, and a plan to share one
implementation across the API and the UI.

## Best practices for search on Postgres

This section is general practice, not a measurement of this system. The running example is a
user who types `imag` into a group search box.

### Choose the technique by what the user types

- **Short names with substring matching.** `ILIKE '%imag%'` finds "Imaging Core". It is adequate
  on small tables, up to tens of thousands of rows.
- **Typos, or larger tables.** The `pg_trgm` extension gives trigram GIN indexes that serve
  `ILIKE '%…%'`. Its `similarity()` function also supports fuzzy matching, so `imgaing` can still
  find the group.
- **Words inside long text.** Full-text search (`tsvector` and `to_tsquery`) handles stemming and
  ranks with `ts_rank`. It matches whole words, so partial input needs the prefix form `imag:*`
  or trigrams beside it.
- **Exact identifiers.** When the input has the shape of a UUID or a slug, look it up by equality
  and skip text matching.

### Index the query that actually runs

- A B-tree index cannot serve a pattern with a leading wildcard. `ILIKE '%imag%'` needs a GIN
  index with `gin_trgm_ops`.
- Index every column in an OR'd match, or index one combined expression. Otherwise the planner
  falls back to a sequential scan.
- Verify with `EXPLAIN ANALYZE` at realistic row counts. A small development table hides a
  missing index.

### Treat the input as data

- Pass the term as a query parameter. Never concatenate it into SQL.
- Escape `\`, `%`, and `_` before wrapping the term in `%…%`. Otherwise `_` matches any single
  character.
- Trim the term and collapse repeated whitespace. Decide once whether case and accents matter.
- Set a minimum length. A one-character term matches nearly every row. A trigram index cannot
  help a term shorter than three characters, because a trigram is three characters long.

### Keep results relevant and stable

- Rank an exact match first, then a prefix match, then a substring match.
- Weight columns, so a match on the name outranks a match on the description.
- Break ties with a stable key, such as the name and then the id, so paging does not reorder
  rows.

### Protect the database from the UI

- Debounce keystrokes on the client, typically by 250 to 300 ms. Discard a response that
  arrives after a newer request was sent.
- Paginate every search, and cap the page size on the server.
- An exact total over a substring match can cost more than the page itself. Cap it, or return
  "has more" instead, when the table grows.
- Apply access filtering inside the same query. Filtering afterwards produces short pages and
  a total that counts rows the caller cannot see.

### Know when Postgres stops being enough

Postgres serves most internal applications up to millions of rows. A dedicated engine such as
OpenSearch, Meilisearch, or Typesense earns its place when a product needs typo-tolerant
relevance tuning, facets across many fields, or high query volume. The cost is a second system
to keep in sync.

## What v2 does today

The inventory below was taken by reading the code on 2026-09-17. Nothing in it was run.

| # | Where the user searches | Route | Matches | `%` and `_` escaped |
|---|---|---|---|---|
| 1 | Groups list, group pickers | `POST /groups/search` | name, tagline, description, slug | no |
| 2 | Group Members tab | `GET /groups/:id/members` | user name, email, username | yes |
| 3 | Group Subgroups tab | `GET /groups/:id/descendants` | name, tagline, description, slug | yes |
| 4 | Nothing in the UI | `POST /groups/hierarchy` | name, tagline, description, slug | yes |
| 5 | Collection lists | `POST /collections/search` | name, tagline, description, slug | yes |
| 6 | Collection Datasets tab | `GET /collections/:id/datasets` | dataset name | yes |
| 7 | Dataset lists, dataset picker | `GET /v2/datasets` | name | yes |
| 8 | Dataset Files tab | `GET /v2/datasets/:id/files/search` | file name, extension, type | yes |
| 9 | User pickers | `GET /v2/users` | name, username, email | yes, except for a platform admin |
| 10 | Dataset and collection Access tabs | `GET /grants/resource/:type/:id` | user name, username, email; group name | yes |
| 11 | Import dialog directory typeahead | `GET /v2/fs` | directory entry names, read from the filesystem | not applicable |

Access requests and audit logs have filters but no free-text search.

Every search is a substring match with a leading wildcard. No migration creates a trigram,
GIN, or `tsvector` index. `createLikePattern` in `api/src/utils/sql.js` escapes `%` and `_` but
not `\`. Search 9 for a platform admin runs the legacy `findAll` in `api/src/services/user.js`,
which builds its pattern by hand.

The searches also disagree with each other:

- **Parameter name.** Most take `search_term`. Datasets take `name`, and users take `search`.
- **Minimum length.** Only search 9 enforces one, three characters, and only for a caller who is
  not a platform admin.
- **Trimming.** Some routes trim and some do not. Several pages send the term untrimmed.
- **Page size.** Users allow 10 per page, groups and collections 100, datasets 1000, and file
  search has no cap.
- **Totals.** Search 10 returns a bare array, so its tab guesses whether another page exists.
- **Debounce.** Search bars wait 300 ms, pickers 250 ms, and the file browser 500 ms. The
  directory typeahead has none.

Three controls do not do what they show:

- The search box on the source and derived datasets tab fetches again but never sends its term.
- The Active and Archived filter on the group Datasets tab filters only the current page in the
  browser, while the total comes from the server.
- The Active and Archived filter on the collection Datasets tab is never sent or applied.

The group search once read `description` and not `tagline` in four separate functions. That is
the failure this plan is designed to prevent: each function kept its own column list, and the
lists drifted.

## Plan

### API: `api/src/services/search/`

- **`SEARCH_FIELDS`** names the columns each resource type searches, such as
  `group: ['name', 'tagline', 'description', 'slug']`. It is the only column list. An unknown
  type throws rather than falling back to a default.
- **`searchTermRule(location)`** is one express-validator chain. It trims, collapses whitespace,
  treats an empty term as no search, and answers 400 below `MIN_SEARCH_TERM_LENGTH` or above a
  maximum.
- **`pageRules({ maxLimit })`** validates `limit` and `offset` with a cap chosen per route.
- **Two clause builders read `SEARCH_FIELDS`.** `textMatchSql(type, alias, term)` returns
  `(col ILIKE $1 ESCAPE '\' OR …)` for raw queries. `textMatchWhere(type, term)` returns the
  Prisma `OR` of case-insensitive `contains`. The codebase uses both query styles. Two builders
  over one field list and one normalisation cannot drift apart.
- **`pagedResponse(data, total, page)`** gives every search the envelope
  `{ data, metadata: { total, limit, offset } }`.
- **One parameter name.** Every v2 search takes `search_term`.

### UI

- **`usePagedSearch({ fetch, pageSize })`** owns the term, one debounce, trimming, the minimum
  length, page, page size, and sort. A new term resets the page to 1. The composable discards
  a stale response and returns rows, total, loading, and error. About twelve tabs and pages
  repeat this by hand today.
- **`V2SearchInput`** gives every search box the same placeholder, clear control, `/` shortcut
  through `useSearchKeyShortcut`, and a hint below the minimum length.
- **`V2SearchSelect`** is one base picker on the same composable. `GroupSearchSelect`,
  `AdminGroupSearchSelect`, `DatasetSearchSelect`, and `UserSearchSelect` become thin wrappers.
- **`Searchbar.vue` and `AutoCompleteSearch.vue` stay unchanged.** v1 pages use them, so the v2
  pieces are new files.

### Postgres

Enable `pg_trgm` and add GIN `gin_trgm_ops` indexes only where a measurement shows a
sequential scan at realistic row counts. The likely candidates are `dataset_file.name`,
`dataset.name`, and the user columns. Groups and collections are expected to stay small. Each
searched column gets its own index, so an OR'd match can combine them in a BitmapOr.

### How each existing search maps onto the plan

- **Searches 1, 2, 3, 5, 6, 7, 9, and 10** take the shared rule, builder, and envelope. Their
  pages and pickers take the composable and components.
- **Search 9 for a platform admin** gets a v2 query built from `SEARCH_FIELDS`. The legacy
  `findAll` stays as it is, and [v2 cut-over](../v2-cutover.md) records it.
- **Search 8** takes the shared matcher on the API side. Its v2 service wrapper starts forwarding
  the size and sort that it drops today. The file browser UI is shared with v1 and stays as it is.
- **Search 11** reads the filesystem, not SQL. It shares only the term normalisation and the
  debounce, which it currently lacks.
- **Search 4** has no caller in the UI. Deleting the route is simpler than migrating it.
- **The three broken controls** either send their term or filter through the shared layer, or
  are removed.

### Phases

1. **API core and a guard.** Build `services/search/` with unit tests for escaping `%`, `_`, and
   `\`, for trimming, for the minimum length, and for an unknown type. Add a scan test, in the
   style of `api/tests/model/uiScan.test.js`, that fails on a hand-built `%…%` pattern under
   `api/src/services`.
2. **Migrate the API one resource at a time.** Each migration changes the route, its UI service
   call, and runs the e2e suite, because the parameter name and envelope change.
3. **Build the UI composable and components,** then move pages and pickers onto them.
4. **Add indexes by measurement.** Seed realistic counts, such as 100,000 files and 10,000 users.
   Run `EXPLAIN ANALYZE` on each search with a three-character and a six-character term, before
   and after. Keep an index only where the plan moves from a sequential scan to a bitmap index
   scan and the time falls.
5. **Rank results, if anyone asks for it.** Exact, then prefix, then substring. Ranking fits the
   raw-SQL builder only, so it waits rather than shipping half-built.

### Open decisions

- **Minimum term length.** Three matches the trigram length, so shorter terms cannot use the
  index. The cost is that a two-letter group name such as "AI" is not searchable by itself.
- **Indexes on `dataset` and `user`.** Both tables are shared with v1. An index changes no
  behaviour, but it is a change to shared substrate and needs explicit approval.
- **Renaming `name` and `search` to `search_term`** on the v2 routes, with the UI and e2e changed
  together.
- **The unused `POST /groups/hierarchy` route.** Delete it or migrate it.
