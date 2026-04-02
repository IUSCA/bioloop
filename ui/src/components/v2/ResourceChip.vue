<template>
  <component v-if="component" :is="component" v-bind="componentProps" />
  <div
    v-else
    class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded border border-solid bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-200"
  >
    <i-mdi-help-circle-outline class="text-base" />
    Unknown resource
  </div>
</template>

<script setup>
import CollectionChip from "./CollectionChip.vue";
import DatasetChip from "./DatasetChip.vue";

const props = defineProps({
  resource: {
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

const resourceType = computed(() =>
  (props.resource?.type || "").toString().toLowerCase(),
);

const component = computed(() => {
  switch (resourceType.value) {
    case "collection":
      return CollectionChip;
    case "dataset":
      return DatasetChip;
    default:
      return null;
  }
});

const componentProps = computed(() => {
  if (resourceType.value === "collection") {
    return {
      collection: props.resource.collection || props.resource,
      link: props.link,
      removable: props.removable,
    };
  }

  if (resourceType.value === "dataset") {
    return {
      dataset: props.resource.dataset || props.resource,
      link: props.link,
      removable: props.removable,
    };
  }

  return {};
});
</script>
