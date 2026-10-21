<template>
  <va-breadcrumbs class="">
    <va-breadcrumbs-item
      class="cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 rounded-full p-2"
      @click="emit('update:pwd', '')"
    >
      <Icon icon="mdi:folder-home" class="hover:text-blue-600" />
    </va-breadcrumbs-item>
    <va-breadcrumbs-item class="cursor-pointer" v-if="path_items.length > 3">
      ...
    </va-breadcrumbs-item>
    <va-breadcrumbs-item
      v-for="(path_item, idx) in path_items.slice(-3)"
      :label="path_item.name"
      :key="idx"
      class="cursor-pointer"
      @click="emit('update:pwd', path_item.rel_path)"
    />
  </va-breadcrumbs>
</template>

<script setup>
import { getBreadcrumbItems } from "./fileBrowserUtils";

const props = defineProps({
  pwd: {
    type: String,
    default: "",
  },
});
const emit = defineEmits(["update:pwd"]);

const path_items = computed(() => getBreadcrumbItems(props.pwd));
</script>
