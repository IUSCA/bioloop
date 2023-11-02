<template>
  <va-file-upload
    class="w-full"
    label="File"
    dropzone
    @file-added="handleFileSelection"
  />
</template>

<script setup>
// const dataProductPath = ref();
const filesData = ref([]);

const emit = defineEmits(["filesAdded"]);

const handleFileSelection = (files) => {
  for (let i = 0; i < files.length; i++) {
    filesData.value.push({
      name: files[i]["name"],
      progress: 0,
      selected: true,
      status: "Selected",
      file: files[i],
    });
  }

  emit("filesAdded", filesData.value);
};
</script>
