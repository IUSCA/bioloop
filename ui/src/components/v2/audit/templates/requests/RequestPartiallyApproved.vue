<template>
  <div class="flex flex-wrap items-center gap-1">
    Access request for
    <ResourceToken
      :type="record.resource_type"
      :name="record.resource_name"
      :id="record.resource_id"
    />
    partially approved by
    <UserToken :name="record.actor_name" :id="record.actor_id" />
    ({{ record.metadata?.approved_count }} approved,
    {{ record.metadata?.rejected_count }} rejected)
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
