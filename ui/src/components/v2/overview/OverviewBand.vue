<template>
  <VaCard>
    <div class="flex flex-wrap">
      <slot />
    </div>
  </VaCard>
</template>

<script setup>
/**
 * The summary band at the top of an Overview tab: the facts that matter to this reader,
 * laid out in a row.
 *
 * Which facts appear is the caller's decision, and on both detail pages it follows from
 * what the API's attribute filter returned rather than from a permission check in the UI.
 *
 * The band carries no prose. A group's or collection's one-line summary is its `tagline`,
 * which the page header already prints under the name, and its long form is `about_md`,
 * which `ProfileAbout` renders further down the same tab.
 *
 * @see docs/design/groups/ui-information-architecture.md — The Overview tab
 */
</script>
