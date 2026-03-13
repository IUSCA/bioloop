<template>
  <div class="flex flex-wrap items-center gap-1">
    Collection
    <CollectionToken :name="record.target_name" :id="record.target_id" />
    unarchived by
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
