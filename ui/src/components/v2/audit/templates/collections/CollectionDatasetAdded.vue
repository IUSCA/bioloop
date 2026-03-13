<template>
  <div class="flex flex-wrap items-center gap-1">
    Dataset
    <DatasetToken :name="record.subject_name" :id="record.subject_id" />
    added to collection
    <CollectionToken :name="record.target_name" :id="record.target_id" />
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
</script>
