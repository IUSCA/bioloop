<template>
  <va-inner-loading :loading="data_loading">
    <!-- body -->
    <div class="flex flex-col gap-3">
      <!-- General Info -->
      <div class="grid grid-cols-1">
        <div class="">
          <va-card class="general-info">
            <va-card-title class="">
              <div class="flex flex-nowrap items-center w-full">
                <span class="flex-auto text-lg"> General Info </span>
                <!-- Edit button placeholder -->
                <va-button
                  preset="plain"
                  icon="edit"
                  disabled
                  v-if="auth.canOperate"
                />
              </div>
            </va-card-title>
            <va-card-content>
              <GroupInfo :group="group" />
            </va-card-content>
          </va-card>
        </div>
      </div>

      <!-- Associated Users -->
      <div>
        <va-card>
          <va-card-title>
            <div class="flex flex-nowrap items-center w-full">
              <span class="flex-auto text-lg"> Associated Users </span>
              <!-- Add-user button -->
              <va-button
                preset="plain"
                icon="add"
                @click="openUsersModal"
                v-if="auth.canOperate"
              />
            </div>
          </va-card-title>
          <va-card-content>
            <GroupUsersTable
              :group-id="groupId"
              :initial-users="group.users || []"
            />
          </va-card-content>
        </va-card>
      </div>

      <!-- Associated Projects -->
      <div>
        <va-card>
          <va-card-title>
            <div class="flex flex-nowrap items-center w-full">
              <span class="flex-auto text-lg"> Associated Projects </span>
              <!-- Add button -->
              <va-button
                preset="plain"
                icon="add"
                @click="openProjectsModal"
                v-if="auth.canOperate"
              />
            </div>
          </va-card-title>
          <va-card-content>
            <GroupProjectsTable
              :group-id="groupId"
              :initial-projects="group.projects || []"
            />
          </va-card-content>
        </va-card>
      </div>

      <!-- Maintenance Actions (placeholder) -->
      <div v-if="auth.canOperate">
        <va-card>
          <va-card-title>
            <span class="text-xl"> Maintenance Actions </span>
          </va-card-title>
          <va-card-content>
            <div class="flex gap-9">
              <!-- delete button -->
              <va-button
                preset="secondary"
                border-color="danger"
                class="flex-none"
                color="danger"
                disabled
              >
                <Icon icon="mdi:delete" class="mr-2" />
                Delete Group
              </va-button>
            </div>
          </va-card-content>
        </va-card>
      </div>
    </div>
  </va-inner-loading>

  <!-- Modals -->
  <GroupUsersModal
    ref="usersModal"
    :group-id="groupId"
    :initial-users="group.users || []"
    @update="handleUpdate"
  />
  <GroupProjectsModal
    ref="projectsModal"
    :group-id="groupId"
    :initial-projects="group.projects || []"
    @update="handleUpdate"
  />
</template>

<script setup>
import groupService from "@/services/group";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { useUIStore } from "@/stores/ui";

const route = useRoute();
const auth = useAuthStore();
const nav = useNavStore();
const ui = useUIStore();

const groupId = computed(() => route.params.groupId);
const data_loading = ref(false);
const group = ref({});

const usersModal = ref(null);
const projectsModal = ref(null);

const fetchGroup = async (
  {updateBreadcrumbs = true, updateTitle = true} = {}
) => {
  data_loading.value = true;
  try {
    const response = await groupService.getById(groupId.value, {
      include_users: true,
      include_projects: true,
      include_parent: true,
      include_children: true,
    });
    group.value = response.data;

    if (updateBreadcrumbs) {
      nav.setNavItems([
        {
          label: "Groups",
          to: "/groups",
        },
        {
          label: group.value.name,
        },
      ]);
    }
    if (updateTitle) {
      ui.setTitle(group.value.name);
    }
  } catch (error) {
    toast.error("Failed to fetch group details");
  } finally {
    data_loading.value = false;
  }
};

const openUsersModal = () => {
  usersModal.value.show();
};

const openProjectsModal = () => {
  projectsModal.value.show();
};

const handleUpdate = async () => {
  await fetchGroup();
};

onMounted(fetchGroup);
</script>

<route lang="yaml">
meta:
  title: Group Details
  requiresRoles: ["operator", "admin"]
</route>
