<template>
  <va-stepper v-model="step" :steps="steps">
    <template
      v-for="(step, i) in steps"
      :key="step.label"
      #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
    >
      <div
        class="step-button p-1 sm:p-3 cursor-pointer"
        :class="{
          'step-button--active': isActive,
          'step-button--completed': isCompleted,
        }"
        @click="setStep(i)"
      >
        <div class="flex flex-col items-center">
          <va-icon :name="step.icon" />
          <span class="hidden sm:block"> {{ step.label }} </span>
        </div>
      </div>
    </template>
    <template #step-content-0>
      <div class="flex justify-center">
        <ProjectInfoForm class="flex-none" />
      </div>
    </template>
    <template #step-content-1>
      <div class="flex justify-center">
        <ProjectDatasetsForm class="flex-none" />
      </div>
    </template>
    <template #step-content-2>
      <ProjectUsersForm />
    </template>
    <template #step-content-3>
      <div>
        <ProjectInfo :project="projectFormStore.project_info" />

        <ProjectDatasetsList :datasets="projectFormStore.datasets" />
        <ProjectUsersList :users="projectFormStore.users" />
      </div>
    </template>
  </va-stepper>
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";
// const props = defineProps({});

const projectFormStore = useProjectFormStore();

const step = ref(0);
const steps = [
  { label: "General Info", icon: "lightbulb" },
  { label: "Datasets", icon: "dataset" },
  { label: "Users", icon: "people" },
  { label: "Create", icon: "add_task" },
];
</script>

<style scoped>
.step-button {
  color: var(--va-secondary);
}
.step-button--active {
  color: var(--va-primary);
}

.step-button--completed {
  color: var(--va-primary);
}

.step-button:hover {
  background-color: var(--va-background-element);
}
</style>
