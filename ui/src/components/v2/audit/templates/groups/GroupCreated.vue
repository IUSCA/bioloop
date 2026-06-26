<template>
  <div
    class="flex flex-wrap items-center gap-1 min-w-0 text-sm text-slate-700 dark:text-slate-200"
  >
    Group
    <GroupToken :name="record.target_name" :id="record.target_id" />
    created

    <span v-if="record.metadata?.parent_name" class="flex items-center gap-1">
      under
      <GroupToken
        :name="record.metadata?.parent_name"
        :id="record.metadata?.parent_id"
      />
    </span>

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
