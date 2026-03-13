<template>
  <div class="flex flex-wrap items-center gap-1">
    <UserToken :name="record.subject_name" :id="record.subject_id" />
    removed

    <template v-if="!inGroupContext">
      from group
      <GroupToken :name="record.target_name" :id="record.target_id" />
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
const context = inject("context");
const inGroupContext = context === "group";
</script>
