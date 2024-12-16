<template>
  <va-inner-loading :loading="data_loading">
    <!-- title -->
    <!-- <div class="flex items-center mb-4">
      <span class="text-3xl flex-none"> Project: {{ project.name }} </span>
    </div> -->

    <!-- body -->
    <div class="flex flex-col gap-3">
      <!-- General Info and Access Permissions -->
      <div class="grid gird-cols-1 md:grid-cols-2 gap-3">
        <!-- General Info -->
        <div class="">
          <va-card class="general-info">
            <va-card-title class="">
              <div class="flex flex-nowrap items-center w-full">
                <span class="flex-auto text-lg"> General Info </span>
                <AddEditButton
                  class="flex-none"
                  edit
                  @click="openModalToEditProject"
                  v-if="auth.canOperate"
                />
              </div>
            </va-card-title>
            <va-card-content>
              <ProjectInfo :project="project" />
            </va-card-content>
          </va-card>
        </div>

        <!-- Access Permissions -->
        <div class="" v-if="auth.canOperate">
          <va-card class="h-full">
            <va-card-title class="">
              <div class="flex flex-nowrap items-center w-full">
                <span class="flex-auto text-lg"> Access Permissions </span>
                <AddEditButton
                  class="flex-none"
                  :edit="project.users?.length > 0"
                  @click="openUsersModal"
                />
              </div>
            </va-card-title>
            <va-card-content>
              <ProjectUsersList
                :users="users"
                v-if="users?.length > 0"
                :show-assign-data="users?.length < 10"
                :wrap="users?.length >= 10"
              />
              <div v-else>This project has no associated users</div>
            </va-card-content>
          </va-card>
        </div>
      </div>

      <!-- Associated datasets -->
      <div>
        <va-card>
          <va-card-title>
            <div class="flex flex-nowrap items-center w-full">
              <span class="flex-auto text-lg"> Associated Datasets </span>

              <AddEditButton
                class="flex-none"
                show-text
                :edit="project.datasets?.length > 0"
                @click="openDatasetsModal"
                v-if="auth.canOperate"
              />
            </div>
          </va-card-title>
          <va-card-content>
            <ProjectDatasetsTable
              :project="project"
              @datasets-retrieved="triggerDatasetsRetrieval = false"
              :trigger-datasets-retrieval="triggerDatasetsRetrieval"
            />
          </va-card-content>
        </va-card>
      </div>

      <!-- Maintenance Actions -->
      <div>
        <va-card v-if="auth.canOperate">
          <va-card-title>
            <span class="text-xl"> Maintenance Actions </span>
          </va-card-title>
          <va-card-content>
            <div class="flex gap-9">
              <!-- merge button -->
              <va-button
                data-testid="merge-projects-button"
                preset="secondary"
                border-color="info"
                class="flex-none"
                color="info"
                @click="openMergeModal"
              >
                <div class="flex items-center gap-2">
                  <i-mdi-merge />
                  <span> Merge Projects </span>
                </div>
              </va-button>

              <!-- delete button -->
              <va-button
                preset="secondary"
                border-color="danger"
                class="flex-none"
                color="danger"
                @click="openModalToDeleteProject"
              >
                <div class="flex items-center gap-2">
                  <i-mdi-delete />
                  <span> Delete Project </span>
                </div>
              </va-button>
            </div>
          </va-card-content>
        </va-card>
      </div>
    </div>
  </va-inner-loading>

  <!-- edit modal -->
  <EditProjectInfoModal
    ref="editModal"
    :id="project.id"
    @update="handleEditUpdate"
  />

  <!-- delete modal -->
  <DeleteProjectModal
    ref="deleteModal"
    :data="project"
    @update="router.push('/projects')"
  />

  <!-- Users modal -->
  <ProjectUsersModal
    ref="usersModal"
    :id="project.id"
    @update="handleEditUpdate"
  />

  <!-- Datasets modal -->
  <ProjectDatasetsModal
    ref="datasetsModal"
    :id="project.id"
    @update="handleEditUpdate"
  />

  <!-- Merge modal -->
  <MergeProjectModal
    ref="mergeModal"
    :id="project.id"
    @update="handleEditUpdate"
  />
</template>

<script setup>
import projectService from "@/services/projects";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { useUIStore } from "@/stores/ui";

const props = defineProps({ projectId: String });
const auth = useAuthStore();
const router = useRouter();

const projectFormStore = useProjectFormStore();
const nav = useNavStore();
const ui = useUIStore();

const project = ref({});
const projectId = computed(() => {
  return project.value?.id || toRef(() => props.projectId).value;
});
const data_loading = ref(false);
const triggerDatasetsRetrieval = ref(false);

watch(project, () => {
  nav.setNavItems([
    {
      label: "Projects",
      to: "/projects",
    },
    {
      label: project.value?.name,
    },
  ]);
  ui.setTitle(project.value?.name);
});

function fetch_project() {
  data_loading.value = true;
  return projectService
    .getById({
      id: projectId.value,
      forSelf: !auth.canOperate,
      query: {
        include_datasets: false,
      },
    })
    .then((res) => {
      project.value = res.data;
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch project details");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

onMounted(() => {
  fetch_project();
});

const users = computed(() => {
  return (project.value.users || []).map((obj) => ({
    ...obj.user,
    assigned_at: obj.assigned_at,
    assignor: obj.assignor,
  }));
});

// edit modal code
// template ref binding
const editModal = ref(null);

function openModalToEditProject() {
  const { name, description, browser_enabled, funding } = project.value;
  projectFormStore.$patch({ name, description, browser_enabled, funding });
  editModal.value.show();
}

function handleEditUpdate() {
  const old_slug = project.value.slug;
  // fetch project by id in project object or id in props
  // this always works even if the slug has changed
  fetch_project().then(() => {
    // if slug changed, the url is invalid, navigate to new url
    const new_slug = project.value.slug;
    if (old_slug !== new_slug) {
      router.push({
        path: `/projects/${new_slug}`,
      });
    } else {
      // update prop which will trigger re-fetching of project-dataset
      // associations
      triggerDatasetsRetrieval.value = true;
    }
  });
}

// delete modal code
// template ref binding
const deleteModal = ref(null);

function openModalToDeleteProject() {
  deleteModal.value.show();
}

// user modal code
const usersModal = ref(null);

function openUsersModal() {
  projectFormStore.setUsers(users.value);
  usersModal.value.show();
}

// dataset modal code
const datasetsModal = ref(null);

function openDatasetsModal() {
  datasetsModal.value.show();
}

// merge modal
const mergeModal = ref(null);

function openMergeModal() {
  mergeModal.value.show();
}
</script>

<style scoped>
/* .general-info {
  --va-card-padding: 0.75rem;
} */
</style>

<route lang="yaml">
meta:
  title: Project Details
</route>
