<template>
  <div class="flex flex-wrap items-center gap-1">
    Group
    <GroupToken :name="record.target_name" :id="record.target_id" />
    created

    <span v-if="record.metadata?.parent_name">
      under
      <span class="font-semibold">
        {{ record.metadata?.parent_name }}
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
