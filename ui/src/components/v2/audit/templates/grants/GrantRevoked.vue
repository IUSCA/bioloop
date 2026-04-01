<template>
  <div
    class="flex flex-wrap items-center gap-1 min-w-0 text-sm text-slate-700 dark:text-slate-200"
  >
    Grant
    <span class="font-semibold">
      {{ record.metadata?.access_type_name || "Unknown" }}
    </span>
    revoked on

    <span class="capitalize">
      {{ props.record.resource_type || "Unknown" }}
    </span>

    <ResourceToken
      :type="record.resource_type"
      :name="record.resource_name"
      :id="record.resource_id"
    />
    for

    <span class="capitalize"> {{ props.record.subject_type }} </span>

    <SubjectToken
      :type="record.subject_type"
      :name="record.subject_name"
      :id="record.subject_id"
    />
    by
    <UserToken :name="record.actor_name" :id="record.actor_id" />
  </div>
</template>

<script setup>
const props = defineProps({
  record: {
    type: Object,
    required: true,
  },
});
</script>
