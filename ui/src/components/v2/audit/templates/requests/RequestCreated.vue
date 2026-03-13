<template>
  <div class="flex flex-wrap items-center gap-1">
    Access request for
    <ResourceToken
      :type="record.metadata?.resource_type"
      :name="record.metadata?.resource_name"
      :id="record.metadata?.resource_id"
    />
    created by
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
