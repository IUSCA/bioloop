<template>
  <div
    class="flex flex-wrap items-center gap-1 min-w-0 text-sm text-slate-700 dark:text-slate-200"
  >
    <template v-if="!inCollectionContext">
      Collection
      <CollectionToken :name="record.target_name" :id="record.target_id" />
    </template>
    <template v-else> Unarchived </template>
    by
    <UserToken :name="record.actor_name" :id="record.actor_id" />
  </div>
</template>

<script setup>
defineProps({
  record: {
    type: Object,
    required: true,
  },
});
const context = inject("context", "default");
const inCollectionContext = context === "collection";
</script>
