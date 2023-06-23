<template>
  <va-form
    class="flex flex-col gap-4 h-[26rem] w-[26rem] justify-start"
    ref="formRef"
  >
    <va-input
      class="flex-none"
      label="Name"
      v-model="name"
      :rules="[
        (value) => (value && value.length > 0) || 'Name is required',
        (value) => (value && value.length > 5) || 'Name is too short',
      ]"
    />

    <!-- <span class="flex-none va-text-secondary pl-2 text-sm mt-[-0.5rem] mb-2">
      URL Alias:
      <span v-if="name && isValid"> /projects/{{ slug }} </span>
    </span> -->

    <span
      class="flex-none text-sm va-text-secondary flex items-center justify-start"
    >
      <i-mdi-alert class="text-lg" style="color: var(--va-warning)" />
      <span> Changing the project name could change the URL alias. </span>
    </span>

    <user-select class="flex-none" v-model:selected="users" />

    <va-input
      class="flex-none"
      label="Description"
      v-model="description"
      type="textarea"
      autosize
    />

    <va-input class="flex-none" label="Funding" v-model="funding" />

    <va-checkbox
      v-model="browser_enabled"
      class="flex-none"
      label="Enable Genome Browser"
    />

    <!-- <dataset-select class="flex-none" v-model:selected="project.datasets" /> -->
  </va-form>
</template>

<script setup>
import { useForm } from "vuestic-ui";
// import projectService from "@/services/projects";
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { storeToRefs } from "pinia";

const projectFormStore = useProjectFormStore();
const { name, description, users, browser_enabled, funding } =
  storeToRefs(projectFormStore);
// const slug = ref("");

// const { isValid } = useForm("formRef");
projectFormStore.form = useForm("formRef");

// watchDebounced(
//   name,
//   () => {
//     if (name.value) {
//       projectService
//         .calculateSlug(name.value)
//         .then((res) => {
//           slug.value = res.data.slug;
//         })
//         .catch((err) => {
//           console.error(err);
//         });
//     }
//   },
//   { debounce: 300, maxWait: 500, immediate: true }
// );
</script>
