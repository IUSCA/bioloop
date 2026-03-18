<template>
  <div
    class="flex flex-wrap items-center gap-1 min-w-0 text-sm text-slate-700 dark:text-slate-200"
  >
    Group
    <GroupToken :name="record.subject_name" :id="record.subject_id" />
    moved

    <span v-if="record.metadata?.new_parent_name">
      under
      <span class="font-semibold">
        {{ record.metadata?.new_parent_name }}
      </span>
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
