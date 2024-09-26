<template>
  <va-inner-loading :loading="loading" class="h-full">
    <va-stepper
      v-model="step"
      :steps="steps"
      controlsHidden
      class="h-full create-project-stepper"
    >
      <!-- Custom Steps -->
      <template
        v-for="(step, i) in steps"
        :key="step.label"
        #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
      >
        <button
          class="step-button p-1 sm:p-3 cursor-pointer"
          :class="{
            'step-button--active': isActive,
            'step-button--completed': isCompleted,
          }"
          @click="isValid({ validate: true }) && setStep(i)"
        >
          <div class="flex flex-col items-center">
            <va-icon :name="step.icon" />
            <span class="hidden sm:block"> {{ step.label }} </span>
          </div>
        </button>
      </template>

      <!-- general info -->
      <template #step-content-0>
        <ProjectInfoForm class="flex-none" />
      </template>

      <!-- dataset select -->
      <template #step-content-1>
        <ProjectDatasetsForm :selected-results="selectedDatasets" />
      </template>

      <!-- user select -->
      <template #step-content-2>
        <ProjectUsersForm />
      </template>

      <!-- review -->
      <template #step-content-3>
        <div class="space-y-3 bg-slate-100 dark:bg-slate-900 p-4 rounded">
          <div>
            <p class="font-bold mb-2">General Info</p>
            <div class="va-table-responsive">
              <table class="va-table">
                <tbody>
                  <tr>
                    <td>Name</td>
                    <td>{{ projectFormStore.project_info.name }}</td>
                  </tr>

                  <tr>
                    <td>Description</td>
                    <td>
                      <div class="max-h-[11.5rem] overflow-y-scroll">
                        {{ projectFormStore.project_info.description }}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td>Funding</td>
                    <td>{{ projectFormStore.project_info.funding }}</td>
                  </tr>

                  <tr>
                    <td>Genome Browser</td>
                    <td>
                      <BinaryStatusChip
                        :status="projectFormStore.project_info.browser_enabled"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <va-divider class="my-4" />
          </div>

          <div>
            <p class="font-bold mb-2">Associated Datasets</p>
            <ProjectDatasetsList :datasets="projectFormStore.datasets" />
            <va-divider class="my-4" />
          </div>

          <div>
            <p class="font-bold mb-2">Associated Users</p>
            <ProjectUsersList :users="projectFormStore.users" wrap />
          </div>
        </div>
      </template>

      <!-- custom controls -->
      <template #controls="{ nextStep, prevStep }">
        <div class="flex items-center justify-around w-full">
          <va-button class="flex-none" preset="primary" @click="prevStep()">
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="
              isValid({ validate: true }) &&
                (is_last_step ? handleCreate() : nextStep())
            "
            :color="is_last_step ? 'success' : 'primary'"
            :disabled="!isValid()"
          >
            {{ is_last_step ? "Create Project" : "Next" }}
          </va-button>
        </div>
      </template>
    </va-stepper>
  </va-inner-loading>
</template>

<script setup>
import projectService from "@/services/projects";
import { useProjectFormStore } from "@/stores/projects/projectForm";

const emit = defineEmits(["update"]);

const projectFormStore = useProjectFormStore();
const selectedDatasets = computed(() => projectFormStore.datasets);

const step = ref(0);
const loading = ref(false);
const steps = [
  { label: "General Info", icon: "lightbulb" },
  { label: "Datasets", icon: "dataset" },
  { label: "Users", icon: "people" },
  { label: "Create", icon: "add_task" },
];
const is_last_step = computed(() => {
  return step.value === steps.length - 1;
});

function isValid({ validate = false } = {}) {
  if (validate) projectFormStore.form.validate();
  const checks = [
    projectFormStore.form.isValid,
    projectFormStore.datasets.length > 0,
    projectFormStore.users.length > 0,
  ];
  return checks.slice(0, step.value + 1).every((x) => x);
}

function handleCreate() {
  projectFormStore.form.validate();
  if (projectFormStore.form.isValid) {
    loading.value = true;

    const user_ids = projectFormStore.user_ids;
    const project_data = projectFormStore.project_info;
    const dataset_ids = projectFormStore.dataset_ids;

    projectService
      .createProject({
        project_data,
        user_ids,
        dataset_ids,
      })
      .finally(() => {
        loading.value = false;
        emit("update");
      });
  }
}
</script>

<style lang="scss">
.create-project-stepper {
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
  .va-stepper__step-content-wrapper {
    // flex: 1 to expand the element to available height
    // min-height: 0 to shrink the elemenet to below its calculated min-height of children
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .va-stepper__step-content {
    // step-content-wrapper contains step-content and controls
    // only shrink and grow step-content
    flex: 1;
    min-height: auto;
    overflow-y: scroll;
  }

  .va-table td {
    padding: 0.25rem;
  }

  div.va-table-responsive {
    overflow: auto;

    // first column min width
    td:first-child {
      min-width: 135px;
    }
  }
}
</style>
