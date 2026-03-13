<template>
  <div class="flex flex-wrap items-center gap-1">
    Access request for
    <ResourceToken
      :type="record.resource_type"
      :name="record.resource_name"
      :id="record.resource_id"
    />
    approved by
    <UserToken :name="record.actor_name" :id="record.actor_id" />
    <span v-if="hasSummary">
      ({{ record.metadata?.approved_count }} approved,
      {{ record.metadata?.rejected_count }} rejected)
    </span>
  </div>
</template>

<script setup>
const props = defineProps({
  record: {
    type: Object,
    required: true,
  },
});

const hasSummary = computed(() => {
  const m = props.record.metadata || {};
  return m.approved_count != null || m.rejected_count != null;
});
</script>
