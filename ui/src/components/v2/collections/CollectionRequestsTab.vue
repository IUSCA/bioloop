<template>
  <VaCard>
    <VaCardContent>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Requests</h2>
        <VaBadge color="info">Coming soon</VaBadge>
      </div>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
        This tab will list pending access requests for this collection.
      </p>
      <div
        class="mt-4 rounded-lg border border-dashed border-gray-200 bg-white/40 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300"
      >
        <p class="font-medium">What needs to be done:</p>
        <ul class="mt-2 list-disc pl-5">
          <li>
            Add API endpoint to fetch access requests scoped to a
            collection.
          </li>
          <li>Support approving/rejecting requests via UI actions.</li>
        </ul>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const props = defineProps({
  collectionId: { type: String, required: false },
});
</script>
