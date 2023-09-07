<template>
  <va-breadcrumbs>
    <va-breadcrumbs-item
      class="cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 rounded-full p-2"
      @click="emit('update:pwd', '')"
    >
      <i-mdi-folder-home class="hover:text-blue-600" />
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
const props = defineProps({
  pwd: {
    type: String,
    default: "",
  },
});
const emit = defineEmits(["update:pwd"]);

const path_items = computed(() => {
  /**
   * if pwd is 'dir1/dir2/dir3/file.txt'
   * then path_items is
   * [{
   *    name: 'dir1',
   *    rel_path: 'dir1'
   * }, {
   *    name: 'dir2',
   *    rel_path: 'dir1/dir2'
   * }, {
   *    name: 'dir3',
   *    rel_path: 'dir1/dir2/dir3'
   * }]
   */

  if (props.pwd === "") {
    return [];
  }
  const parts = props.pwd.split("/");
  const result = parts.map((t, i) => ({
    name: t,
    rel_path: parts.slice(0, i + 1).join("/"),
  }));
  return result;
});
</script>
