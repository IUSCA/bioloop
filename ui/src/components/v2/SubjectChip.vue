<template>
  <component
    v-if="component"
    :is="component"
    v-bind="componentProps"
    @remove="emit('remove')"
  />
  <div
    v-else
    class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-solid bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-200"
  >
    <i-mdi-help-circle-outline class="text-base" />
    Unknown subject
  </div>
</template>

<script setup>
import GroupChip from "@/components/v2/groups/GroupChip.vue";
import UserChip from "@/components/v2/UserChip.vue";

const props = defineProps({
  subject: {
    type: Object,
    required: true,
  },
  link: {
    type: Boolean,
    default: false,
  },
  removable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);

const subjectType = computed(() =>
  (props.subject?.type || "").toString().toLowerCase(),
);

const component = computed(() => {
  switch (subjectType.value) {
    case "group":
      return GroupChip;
    case "user":
      return UserChip;
    default:
      return null;
  }
});

const componentProps = computed(() => {
  if (subjectType.value === "group") {
    return {
      group: props.subject.group || props.subject,
      link: props.link,
      removable: props.removable,
    };
  }

  if (subjectType.value === "user") {
    return {
      user: props.subject.user || props.subject,
      link: props.link,
      removable: props.removable,
    };
  }

  return {};
});
</script>
