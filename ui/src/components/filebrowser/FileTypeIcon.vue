<!-- https://github.com/minhazmiraz/file-extension-icon-JS/blob/master/src/components/api/VSIIconApi.js -->

<template>
  <Icon
    icon="mdi:file"
    class="text-2xl flex-none text-blue-600"
    v-if="icon_name === 'file'"
  />
  <Icon
    v-else
    :icon="`vscode-icons:file-type-${icon_name}`"
    class="text-2xl flex-none"
  />
</template>

<script setup>
import { getVsiFileIconName } from "./vsiFileIconName";

const props = defineProps(["filename"]);

const icon_name = computed(() => getVsiFileIconName(props.filename));
</script>
