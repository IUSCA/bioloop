<template>
  <div class="flex flex-wrap items-center gap-1">
    Group
    <GroupToken :name="record.target_name" :id="record.target_id" />
    <span v-if="record.metadata?.changed_fields?.length">
      {{ record.metadata?.changed_fields.join(", ") }}
    </span>
    <span v-else> metadata </span>
    updated by
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
