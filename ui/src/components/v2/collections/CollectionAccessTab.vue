<template>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Access</h2>
          <VaBadge color="info">Coming soon</VaBadge>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          This tab will show grants and access entries for the collection.
          (API endpoints not implemented yet.)
        </p>

        <div
          class="rounded-lg border border-dashed border-gray-200 bg-white/40 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300"
        >
          <p class="font-medium">What needs to be done:</p>
          <ul class="mt-2 list-disc pl-5">
            <li>Add an endpoint to return active grants for a collection.</li>
            <li>Display grant subjects and access types.</li>
            <li>Allow revoking / updating grants (future).</li>
          </ul>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const props = defineProps({
  collectionId: { type: String, required: false },
});
</script>
