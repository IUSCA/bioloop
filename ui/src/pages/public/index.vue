<template>
  <VaCard>
    <VaCardContent class="py-12 text-center flex flex-col items-center gap-2">
      <Icon
        icon="mdi-card-account-details-outline"
        class="text-4xl"
        style="color: var(--va-secondary)"
      />
      <h1 class="text-lg font-semibold">Public profiles</h1>
      <p class="text-sm max-w-md" style="color: var(--va-secondary)">
        There is no directory of published profiles. A group or a collection
        that publishes one shares its own link, which is the address in its
        citation.
      </p>
      <RouterLink
        to="/auth"
        class="text-sm mt-2 hover:underline"
        style="color: var(--va-primary)"
      >
        Sign in
      </RouterLink>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The landing page at `/public`, and the reason the profile pages have no sidebar.
 *
 * `setupLayouts` wraps every top-level route with `meta.layout || 'default'`. The pages
 * below this one are two directories deep, so their top-level route is the intermediate
 * `/public` record, which carries no meta of its own and would take the default layout —
 * sidebar, application header, alert poller and all — with the public layout nested inside
 * it. The plugin skips that wrapping when a top-level route has a `path: ''` child the
 * inner pass has already wrapped, which is exactly what this file produces. `pages/auth/`
 * works the same way.
 *
 * So do not delete this page because nothing links to it. Deleting it puts the application
 * sidebar back on every public profile.
 *
 * @see docs/contributing/techniques/v2-ui-changes.md — A directory of pages with a non-default layout needs an `index.vue`
 */
</script>

<route lang="yaml">
meta:
  layout: public
  title: Public profiles
  requiresAuth: false
</route>
