<template>
  <!-- search bar and create button -->
  <div class="flex items-center gap-3 mb-3">
    <!-- search bar -->
    <div class="flex-1">
      <va-input
        :model-value="params.search"
        @update:model-value="debouncedUpdate"
        class="w-full"
        placeholder="search users"
        outline
        clearable
      >
        <template #prependInner>
          <Icon icon="material-symbols:search" class="text-xl" />
        </template>
      </va-input>
    </div>

    <!-- reset button -->
    <div class="flex-none" v-if="isResetVisible">
      <va-button icon="restart_alt" @click="resetSortParams" preset="primary">
        Reset Sort
      </va-button>
    </div>

    <!-- create button -->
    <div class="flex-none">
      <va-button
        data-testid="create-user-button"
        icon="add"
        class="px-3"
        color="success"
        @click="openModalToCreateUser"
      >
        Create User
      </va-button>
    </div>
  </div>

  <!-- table -->
  <va-data-table
    class="user-table"
    :items="users"
    :columns="columns"
    v-model:sort-by="params.sortBy"
    v-model:sorting-order="params.sortingOrder"
    disable-client-side-sorting
    :loading="data_loading"
  >
    <!-- roles -->
    <template #cell(roles)="{ source }">
      <div class="flex gap-1">
        <va-chip
          v-for="(role, i) in source.slice(0, 3)"
          :color="get_role_color(role)"
          :key="i"
          size="small"
          class="flex-none"
        >
          {{ role }}
        </va-chip>
        <va-chip v-if="source.length > 3" size="small" class="flex-none">
          +{{ source.length - 3 }}
        </va-chip>
      </div>
    </template>

    <template #cell(created_at)="{ value }">
      <span>{{ datetime.date(value) }}</span>
    </template>

    <template #cell(is_deleted)="{ source }">
      <!-- <span> {{ source ? "Disabled" : "Enabled" }} </span> -->
      <BinaryStatusChip
        :status="!source"
        :icons="['mdi:account-off-outline', 'mdi:account-badge-outline']"
      />
    </template>

    <template #cell(last_login)="{ rowData }">
      <span v-if="rowData?.login?.last_login">
        {{ datetime.fromNow(rowData?.login?.last_login) }}</span
      >
    </template>

    <template #cell(login_method)="{ rowData }">
      <Maybe :data="rowData?.login?.method" />
    </template>

    <!-- actions -->
    <template #cell(actions)="{ rowData }">
      <div class="flex gap-3">
        <!-- edit button -->
        <div class="flex-none">
          <va-button
            size="small"
            preset="plain"
            color="secondary"
            @click="openModalToEditItem(rowData)"
            :disabled="!canEdit(rowData)"
          >
            <i-mdi-pencil class="text-lg" />
          </va-button>
        </div>

        <!-- spoof button -->
        <div class="flex-none" v-if="auth.canAdmin">
          <va-popover message="Log in as User" placement="top">
            <va-button
              size="small"
              preset="primary"
              color="info"
              @click="openModalToLogInAsUser(rowData)"
            >
              <i-mdi-account-convert-outline class="" />
            </va-button>
          </va-popover>
        </div>
      </div>
    </template>
  </va-data-table>

  <!-- pagination -->
  <Pagination
    class="mt-4 px-1 lg:px-3"
    v-model:page="params.currentPage"
    v-model:page_size="params.itemsPerPage"
    :total_results="totalItems"
    :curr_items="users.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />

  <!-- edit modal -->
  <va-modal
    data-testid="edit-user-modal"
    :model-value="editing"
    :title="editModalTitle"
    size="small"
    @ok="effectFn"
    @cancel="resetEditModal"
    no-outside-dismiss
  >
    <div class="max-w-lg">
      <va-inner-loading :loading="modal_loading">
        <va-form class="flex flex-wrap gap-2 gap-y-4" ref="modifyFormRef">
          <!-- name -->
          <va-input
            data-testid="user-name-input"
            class="w-full"
            v-model="editedUser.name"
            label="Name"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />

          <!-- email -->
          <va-input
            data-testid="user-email-input"
            v-model="editedUser.email"
            label="Email"
            class="w-full"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />

          <!-- username -->
          <va-input
            data-testid="user-username-input"
            :modelValue="editedUser.username || autofill.username"
            @update:modelValue="editedUser.username = $event"
            label="Username"
            class="w-full"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />

          <!-- cas id -->
          <va-input
            data-testid="user-cas-id-input"
            :modelValue="editedUser.cas_id || autofill.cas_id"
            @update:modelValue="editedUser.cas_id = $event"
            label="CAS ID"
            class="flex-[1_1_100%]"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />

          <!-- status -->
          <div class="flex-[1_1_100%] flex items-center gap-3">
            <div class="flex items-center gap-3">
              <span
                class="flex-none text-xs font-semibold"
                style="color: var(--va-primary)"
              >
                STATUS
              </span>
              <va-switch
                v-model="editedUser.status"
                true-label="Enabled"
                false-label="Disabled"
                color="success"
              />
            </div>

            <!-- Delete User Text and Trash Bin Button -->
            <div v-if="auth.canAdmin" class="flex items-center gap-2 ml-auto">
              <span class="trash-can-button-text"> DELETE USER </span>
              <va-button
                color="danger"
                preset="plain"
                size="small"
                @click="confirmDeleteUser"
              >
                <i-mdi-delete class="text-2xl" />
              </va-button>
            </div>
          </div>

          <!-- roles -->
          <div class="flex-[1_1_100%]">
            <span
              class="block text-xs font-semibold mb-3"
              style="color: var(--va-primary)"
            >
              ROLES
            </span>
            <va-option-list
              :disabled="!auth.canAdmin"
              v-model="editedUser.roles"
              label="Role"
              :options="roleOptions"
            />
          </div>

          <!-- metadata -->
          <!-- temporary view -->
          <!-- <va-textarea
            data-testid="user-metadata-input"
            class="w-full text-sm"
            :modelValue="JSON.stringify(editedUser.metadata || {}, null, 2)"
            label="Metadata"
            autosize
            readonly
            preset="solid"
          /> -->
          <!-- <JSONTable v-model="editedUser.metadata" editable /> -->
          <div class="flex-[1_1_100%]">
            <span
              class="block text-xs font-semibold mb-3"
              style="color: var(--va-primary)"
            >
              METADATA
            </span>
            <KeyValueEditor v-model="editedUser.metadata" />
          </div>

          <!-- notes -->
          <va-textarea
            data-testid="user-notes-input"
            class="w-full"
            v-model="editedUser.notes"
            label="Notes"
            autosize
            :min-rows="5"
            resize
          />
        </va-form>
      </va-inner-loading>
    </div>
  </va-modal>

  <!-- Log in as User modal -->
  <SudoUserModal ref="sudoModal" :user="selected" />

  <!-- Delete Confirmation Modal -->
  <va-modal
    v-model="isDeleteModalVisible"
    title="DELETE USER?"
    okText="Confirm"
    cancelText="Cancel"
    @ok="showUsernamePrompt"
    @cancel="isDeleteModalVisible = false"
  >
    <p>
      Are you sure you want to delete the user record of
      <strong>{{ editedUser.name }}</strong
      >?
    </p>
  </va-modal>

  <!-- Username Confirmation Modal -->
  <va-modal
    v-model="isUsernamePromptVisible"
    title="CONFIRM DELETION"
    hide-default-actions
    @cancel="isUsernamePromptVisible = false"
  >
    <p>
      Please note that hard deletion is irreversible and will impact other data
      linked to this user.
    </p>
    <p>
      Please type the username <strong>{{ editedUser.username }}</strong> to
      confirm deletion:
    </p>

    <!-- Username Input -->
    <va-input
      class="username-input"
      v-model="usernameConfirmation"
      placeholder="Enter username"
    />

    <!-- Deletion Type Toggle Group -->
    <div class="flex gap-4 items-center mt-2">
      <!-- Deletion Type Label -->
      <span class="deletion-type-label">Deletion Type:</span>

      <!-- Deletion Options -->
      <div class="flex gap-8">
        <VaRadio
          v-for="option in deletionOptions"
          :key="option.value"
          v-model="selectedDeletionType"
          :option="option.value"
          :label="option.label"
          :disabled="option.disabled"
          :color="option.value === 'hard' ? 'danger' : 'info'"
          name="deletionType"
        />
      </div>
    </div>

    <!-- Display alert when Soft Deletion is disabled -->
    <VaAlert v-if="isSoftDeleted" color="warning" class="mb-2">
      Soft Deletion is unavailable because the user is already soft deleted.
    </VaAlert>

    <!-- Display impact details -->
    <VaAlert
      v-if="impactDetails.length > 0"
      border="top"
      border-color="primary"
      class="mt-4"
    >
      <template #title>
        <strong> Impact Details of the Selected Deletion </strong>
      </template>
      <ul class="va-unordered">
        <li v-for="detail in impactDetails" :key="detail">
          {{ detail }}
        </li>
      </ul>
    </VaAlert>

    <!-- Custom footer with "Confirm Delete" and "Cancel" buttons -->
    <template #footer>
      <va-button @click="isUsernamePromptVisible = false">Cancel</va-button>
      <va-button
        color="danger"
        :disabled="usernameConfirmation !== editedUser.username"
        @click="deleteUser"
      >
        Confirm Delete
      </va-button>
    </template>
  </va-modal>
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import UserService from "@/services/user";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const users = ref([]);
const totalItems = ref(0);

const editing = ref(false);
const editedUser = ref({});
const modifyFormRef = ref(null);
const modal_loading = ref(false);
const editMode = ref("modify");
const data_loading = ref(false);
const roleOptions = ["user", "operator", "admin"];
const autofill = ref({
  username: "",
  cas_id: "",
});

// New variables for delete confirmation modals
const isDeleteModalVisible = ref(false);
const isUsernamePromptVisible = ref(false);
const usernameConfirmation = ref("");
const isHardDelete = ref(false);
const isSoftDeleted = computed(() => editedUser.value.is_deleted); //check soft delete status

// Open the initial delete confirmation modal
function confirmDeleteUser() {
  isDeleteModalVisible.value = true;
}

const impactDetails = computed(() => {
  return isHardDelete.value
    ? [
        "User profile, roles, and settings will be permanently removed.",
        "Project assignments, notifications, and login history will be removed.",
        "Related system logs, project-related datasets, and uploads will no longer reference the user.",
      ]
    : [
        "The user's account will be marked as inactive but not permanently removed.",
        "Other data, such as linked projects and system logs, will remain intact.",
      ];
});

// Show the final username prompt after confirming initial delete dialog
function showUsernamePrompt() {
  isDeleteModalVisible.value = false;
  isUsernamePromptVisible.value = true;
  usernameConfirmation.value = ""; // reset input
  //isHardDelete.value = false;

  isHardDelete.value = isSoftDeleted.value;
}

// define options for radio buttons
const deletionOptions = computed(() => [
  { label: "Soft Deletion", value: "soft", disabled: isSoftDeleted.value },
  { label: "Hard Deletion", value: "hard" },
]);

// handle the radio button selection logic
const selectedDeletionType = computed({
  get: () => (isHardDelete.value ? "hard" : "soft"),
  set: (deletionType) => {
    console.log("selectedDeletionType changed to:", deletionType);
    isHardDelete.value = deletionType === "hard";
  },
});

const debouncedUpdate = useDebounceFn((val) => {
  params.value.search = val;
}, 300);

function defaultParams() {
  return {
    search: "",
    sortBy: "name",
    sortingOrder: "asc",
    currentPage: 1,
    itemsPerPage: 25,
  };
}

const params = ref(defaultParams());

useQueryPersistence({
  refObject: params,
  defaultValueFn: defaultParams,
  key: "u",
  history_push: true,
});

const isResetVisible = computed(() => {
  const defaultParamsObj = defaultParams();
  return (
    params.value.sortBy !== defaultParamsObj.sortBy ||
    params.value.sortingOrder !== defaultParamsObj.sortingOrder
  );
});

function resetSortParams() {
  // Reset params to their default values
  params.value.sortBy = defaultParams().sortBy;
  params.value.sortingOrder = defaultParams().sortingOrder;
}

const editModalTitle = computed(() => {
  return editMode.value == "modify" ? "Modify User" : "Create User";
});
const effectFn = computed(() => {
  return editMode.value == "modify" ? modifyUser : createUser;
});

function get_role_color(role) {
  return (
    {
      user: "secondary",
      admin: "info",
      operator: "warning",
    }[role] || null
  );
}

const columns = ref([
  { key: "name", sortable: true, sortingOptions: ["asc", "desc", null] },
  { key: "username", sortable: true, sortingOptions: ["asc", "desc", null] },
  { key: "email", sortable: true, sortingOptions: ["asc", "desc", null] },
  { key: "roles", sortable: false },
  {
    key: "created_at",
    sortable: true,
    label: "created on",
    width: "100px",
  },
  { key: "is_deleted", sortable: true, label: "status", width: "60px" },
  {
    key: "last_login",
    sortable: true,
    label: "Last Login",
    width: "150px",
  },
  {
    key: "login_method",
    sortable: false,
    label: "Auth",
    width: "75px",
  },
  { key: "actions", width: 30 },
]);

function fetch_all_users() {
  data_loading.value = true;

  const skip = (params.value.currentPage - 1) * params.value.itemsPerPage;

  const queryParams = {
    forSelf: !auth.canOperate,
    search: params.value.search,
    take: params.value.itemsPerPage,
    skip: skip,
    sortBy: params.value.sortBy,
    sort_order: params.value.sortingOrder,
  };

  UserService.getAll(queryParams)
    .then((data) => {
      const { metadata, users: userList } = data;
      users.value = userList;
      totalItems.value = metadata.count;
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch Users");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

function canEdit(user) {
  if (auth.canAdmin) return true;
  if (user.username == auth.user.username) return true;
  if (user.roles.includes("user") || user.roles.length === 0) return true;
}

function openModalToEditItem(rowData) {
  editMode.value = "modify";
  editing.value = true;
  // eslint-disable-next-line no-unused-vars
  const { created_at, updated_at, ...user } = rowData;
  editedUser.value = {
    ...user,
    status: !user.is_deleted,
    roles: user.roles || [],
    orig_username: user.username,
  };
}

function openModalToCreateUser() {
  editMode.value = "create";
  editing.value = true;
  // eslint-disable-next-line no-unused-vars
  editedUser.value = {
    status: true,
    roles: ["user"],
  };
}

function resetEditModal() {
  editing.value = false;
  editedUser.value = {};
}

// sudo user modal

const sudoModal = ref(null);
const selected = ref({});

function openModalToLogInAsUser(rowData) {
  selected.value = rowData;
  sudoModal.value.show();
}

function modifyUser() {
  if (modifyFormRef.value.validate()) {
    const { roles, orig_username, status, ...updates } = editedUser.value;
    updates.is_deleted = !status;
    updates.roles = roles;
    updates.username = editedUser.value.username || autofill.value.username;
    updates.cas_id = editedUser.value.cas_id || autofill.value.cas_id;

    modal_loading.value = true;

    UserService.modifyUser(orig_username, updates)
      .then(() => {
        fetch_all_users();
        toast.success("User data updated");
      })
      .catch((err) => {
        console.error(err);
        toast.error("Unable to modify user");
      })
      .finally(() => {
        modal_loading.value = false;
        resetEditModal();
      });
  }
}

function createUser() {
  if (modifyFormRef.value.validate()) {
    const { roles, status, ...updates } = editedUser.value;
    updates.is_deleted = !status;
    updates.roles = roles;
    updates.username = editedUser.value.username || autofill.value.username;
    updates.cas_id = editedUser.value.cas_id || autofill.value.cas_id;

    modal_loading.value = true;

    UserService.createUser(updates)
      .then(() => {
        fetch_all_users();
        toast.success("User created");
      })
      .catch((err) => {
        console.error(err);
        toast.error("Unable to create user");
      })
      .finally(() => {
        modal_loading.value = false;
        resetEditModal();
      });
  }
}

function deleteUser() {
  // Prevent deletion if the username doesn't match
  if (usernameConfirmation.value !== editedUser.value.username) {
    console.warn("Username mismatch detected during deletion attempt.");
    return;
  }

  // Prevent soft delete if the user is already soft deleted/ no options
  // selected
  if (!isHardDelete.value && isSoftDeleted.value) {
    console.warn("Soft delete attempted on an already soft-deleted user.");
    return;
  }

  modal_loading.value = true;

  // Call the unified deletion function with the query parameter
  UserService.deleteUser(editedUser.value.username, isHardDelete.value)
    .then(() => {
      const successMessage = isHardDelete.value
        ? "User record and their associated data have been successfully removed or disassociated."
        : "User is temporarily disabled. Their associated data remains intact.";
      toast.success(successMessage);
      fetch_all_users();
      resetEditModal();
      isUsernamePromptVisible.value = false;
    })
    .catch((err) => {
      console.error(
        `Error during ${isHardDelete.value ? "hard" : "soft"} delete for user ${editedUser.value.username}:`,
        err,
      );
      toast.error(
        "Failed to delete the user. Please try again or contact support.",
      );
    })
    .finally(() => {
      modal_loading.value = false;
    });
}

watch(
  [
    () => params.value.itemsPerPage,
    () => params.value.search,
    () => params.value.sortBy,
    () => params.value.sortingOrder,
  ],
  () => {
    if (params.value.currentPage === 1) {
      fetch_all_users();
    }
    params.value.currentPage = 1;
  },
);

watch(
  () => params.value.currentPage,
  () => {
    fetch_all_users();
  },
);

watch(
  () => editedUser.value.email,
  () => {
    const email = editedUser.value.email;
    if (email) {
      const username = email.split("@")[0];
      autofill.value.username = username;
      autofill.value.cas_id = username;
    } else {
      autofill.value.username = "";
      autofill.value.cas_id = "";
    }
  },
);

fetch_all_users();
</script>

<style scoped>
.user-table {
  --va-data-table-cell-padding: 3px;
}

.trash-can-button-text {
  color: var(--va-primary);
  font-size: 12px;
  font-weight: 600;
  flex: none;
}

.deletion-type-label {
  font-size: 1rem;
  font-weight: bold;
}

.username-input {
  width: 300px;
}
</style>

<route lang="yaml">
meta:
  title: Users
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Users" }]
</route>
