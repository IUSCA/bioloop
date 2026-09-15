<template>
  <VaCard v-if="publications.length">
    <VaCardContent>
      <h2 class="text-sm font-semibold mb-1">RELATED PUBLICATIONS</h2>
      <div class="flex flex-col">
        <div
          v-for="(pub, i) in publications"
          :key="i"
          class="flex gap-3 py-3 border-0 border-t border-solid border-gray-100 dark:border-gray-800"
        >
          <Icon
            icon="mdi-file-document-outline"
            class="text-base shrink-0 mt-0.5"
            style="color: var(--va-secondary)"
          />
          <div class="flex flex-col gap-1 min-w-0">
            <a
              :href="`https://doi.org/${pub.doi}`"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm font-medium hover:underline"
              style="color: var(--va-primary)"
            >
              {{ pub.title || pub.doi }}
            </a>
            <p
              v-if="pub.container || pub.year"
              class="text-xs"
              style="color: var(--va-secondary)"
            >
              <em v-if="pub.container">{{ pub.container }}</em>
              <span v-if="pub.container && pub.year">, </span>
              <span v-if="pub.year">{{ pub.year }}</span>
            </p>
            <p class="font-mono text-xs" style="color: var(--va-primary)">
              {{ pub.doi }}
            </p>
          </div>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The publications a profile lists, each one a DOI.
 *
 * A DOI is the whole entry; the title, container, and year are optional decoration an
 * admin typed. The link always resolves through doi.org rather than a stored URL, so a
 * publisher moving a paper does not break the profile.
 *
 * @see docs/design/groups/implementation/profiles.md — Schema
 */
const props = defineProps({
  /** [{ doi, title?, container?, year? }] */
  publications: { type: Array, default: () => [] },
});

const publications = computed(() => props.publications ?? []);
</script>
