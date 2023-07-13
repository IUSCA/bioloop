<!-- https://github.com/minhazmiraz/file-extension-icon-JS/blob/master/src/components/api/VSIIconApi.js -->

<template>
  <Icon
    icon="mdi-file"
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
import {
  vsiFileExtensionsToIcons,
  vsiFileNamesToIcons,
} from "./vsiFileIconName";

const props = defineProps(["filename"]);

const icon_name = computed(() => {
  const fileName = (props.filename || "").toLowerCase();
  let splitName = fileName.split(".");
  let iconName = "";

  while (splitName.length) {
    let curName = splitName.join(".");
    if (vsiFileNamesToIcons[curName]) {
      iconName = vsiFileNamesToIcons[curName];
      break;
    }
    if (vsiFileExtensionsToIcons[curName]) {
      iconName = vsiFileExtensionsToIcons[curName];
      break;
    }

    splitName.shift();
  }

  if (iconName === "") iconName = "file";

  return iconName;
});
</script>
