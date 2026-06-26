<template>
  <div
    class="flex flex-wrap items-center gap-1 min-w-0 text-sm text-slate-700 dark:text-slate-200"
  >
    Dataset
    <DatasetToken :name="record.resource_name" :id="record.resource_id" />
    removed
    <template v-if="!inCollectionContext">
      from collection
      <CollectionToken :name="record.target_name" :id="record.target_id" />
    </template>
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
