<template>
  <va-form class="flex flex-col gap-6 w-full justify-start" ref="formRef">
    <div class="flex-none">
      <va-input
        class="w-full"
        label="Name"
        v-model="name"
        :rules="[
          (value) => (value && value.length > 0) || 'Name is required',
          (value) => (value && value.length > 5) || 'Name is too short',
        ]"
      />

      <span
        class="text-sm va-text-secondary flex items-center gap-2 px-1 mt-2"
        v-if="props.showSlugWarning"
      >
        <i-mdi-alert class="flex-none" style="color: var(--va-warning)" />
        <span class="flex-none">
          Altering the project name could potentially change the URL alias.
        </span>
      </span>
    </div>

    <va-textarea
      class="flex-none"
      label="Description"
      v-model="description"
      autosize
      :min-rows="3"
      :max-rows="10"
      resize
    />

    <va-input class="flex-none" label="Funding" v-model="funding" />
  </va-form>
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { storeToRefs } from "pinia";
import { useForm } from "vuestic-ui";

const props = defineProps({
  showSlugWarning: {
    type: Boolean,
    default: false,
  },
});

const projectFormStore = useProjectFormStore();
const { name, description, funding } = storeToRefs(projectFormStore);
// const slug = ref("");

// const { isValid } = useForm("formRef");
projectFormStore.form = useForm("formRef");
</script>
