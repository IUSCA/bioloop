<template>
  <VaModal
    v-model="visible"
    :title="props.isSubgroup ? 'Create Subgroup' : 'Create Group'"
    hide-default-actions
    size="large"
    no-outside-dismiss
    @cancel="hide"
  >
    <template #header>
      <div class="flex items-start gap-3 mb-5">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        >
          <Icon
            :icon="
              props.isSubgroup
                ? 'mdi-file-document-edit'
                : 'mdi-office-building'
            "
          />
        </div>
        <div>
          <h2 class="text-xl font-semibold">
            {{ props.isSubgroup ? "Create Subgroup" : "Create Group" }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{
              props.isSubgroup
                ? "Adding a child group to " +
                  props.parentGroup.name +
                  ". The new group will be nested within " +
                  props.parentGroup.name +
                  "'s hierarchy."
                : "Define a new organizational group. Groups own datasets and collections, and determine governance authority over resources."
            }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3 mt-6">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="loading"
          :disabled="!confirmationValid"
          :color="'success'"
          @click="confirm"
        >
          <i-mdi-arrow-right class="mr-2" />
          {{ props.isSubgroup ? "Create Subgroup" : "Create Group" }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <VaForm ref="formRef" class="space-y-3">
        <!-- IDENTITY Section -->
        <ModernCard icon="mdi-identification-card" title="Identity">
          <div class="space-y-4">
            <!-- Group Name -->
            <div>
              <VaInput
                class="w-full"
                v-model="formData.name"
                placeholder="e.g., Computational Genomics Lab"
                outline
                label="Group Name"
                required-mark
                :rules="nameRules"
                @blur="validate"
              />
            </div>
          </div>
        </ModernCard>

        <!-- HIERARCHY PLACEMENT Section (if not subgroup mode or if in create-group with child mode) -->
        <ModernCard icon="mdi-sitemap" title="Hierarchy Placement">
          <div class="space-y-4">
            <!-- Group Type (only for create-group mode, not subgroup) -->
            <div v-if="!props.isSubgroup" class="space-y-3">
              <label
                class="flex gap-3 p-3 rounded-lg border border-solid cursor-pointer transition"
                :class="
                  isChildMode
                    ? 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/20'
                    : 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                "
              >
                <input
                  type="radio"
                  :checked="!isChildMode"
                  @change="isChildMode = false"
                  class="mt-1"
                />
                <div>
                  <div
                    class="text-sm font-medium text-gray-900 dark:text-gray-100"
                  >
                    Root group (no parent)
                  </div>
                  <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Top-level group — exists independently. Admins of this group
                    have no oversight from above.
                  </div>
                </div>
              </label>

              <label
                class="flex gap-3 p-3 rounded-lg border border-solid cursor-pointer transition"
                :class="
                  isChildMode
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/20'
                "
              >
                <input
                  type="radio"
                  :checked="isChildMode"
                  @change="isChildMode = true"
                  class="mt-1"
                />
                <div>
                  <div
                    class="text-sm font-medium text-gray-900 dark:text-gray-100"
                  >
                    Child of an existing group
                  </div>
                  <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Nest this group under a parent. Admins of the parent will
                    gain oversight visibility over this group.
                  </div>
                </div>
              </label>
            </div>

            <!-- Parent Group Selector (create-group child mode) -->
            <div v-if="!props.isSubgroup && isChildMode" class="space-y-3">
              <label
                class="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2"
              >
                Parent Group
                <span class="text-red-500">*</span>
              </label>

              <div v-if="!formData.selectedParentGroup">
                <AdminGroupSearchSelect
                  :disabled="false"
                  @select="(group) => (formData.selectedParentGroup = group)"
                />
              </div>

              <GroupChip
                v-else
                :group="formData.selectedParentGroup"
                removable
                @remove="formData.selectedParentGroup = null"
              />
            </div>

            <!-- Display parent group (subgroup mode) -->
            <div v-if="props.isSubgroup" class="space-y-3">
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                Parent Group
              </div>
              <GroupChip :group="props.parentGroup" />
            </div>

            <!-- Warnings/Callouts when parent is fixed (subgroup mode) -->
            <div v-if="props.isSubgroup" class="space-y-3 mt-4">
              <!-- Membership Propagation Warning -->
              <ModernAlert
                icon="mdi-information"
                color="warning"
                title="Membership propagation"
              >
                Members of this subgroup are automatically implicit members of
                <span class="font-semibold">
                  {{ props.parentGroup.name }}
                </span>
                and all ancestor groups. Any grants assigned to parent groups
                automatically apply to this subgroup. This is structural and
                cannot be restricted.
              </ModernAlert>

              <!-- Oversight Chain Info -->
              <ModernAlert
                icon="mdi-information"
                color="info"
                title="Oversight visibility"
              >
                Admins of
                <span class="font-semibold">
                  {{ props.parentGroup.name }}
                </span>
                and parent groups above will have oversight visibility over this
                subgroup.
              </ModernAlert>
            </div>
          </div>
        </ModernCard>

        <!-- SETTINGS Section -->
        <ModernCard icon="mdi-cog" title="Settings">
          <GroupAllowMemberContribSwitch
            v-model="formData.allow_user_contributions"
          />
        </ModernCard>

        <!-- INITIAL ADMINS Section -->
        <ModernCard icon="mdi-account-multiple" title="Initial Admins">
          <UserAdminSelect
            v-model="formData.selectedAdmins"
            :exclude-ids="adminSearchExcludeIds"
          />

          <div v-if="isChildTarget" class="mt-4">
            <VaCheckbox
              v-model="formData.creatorIsAdmin"
              :disabled="!canDeclineAdmin"
              :label="`I will be an admin of this ${childNoun}`"
              data-testid="creator-is-admin"
            />
            <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
              {{ creatorAdminHint }}
            </p>
          </div>
        </ModernCard>
      </VaForm>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";
import { computed, ref, watch } from "vue";
import { useForm, VaButton } from "vuestic-ui";
import { useAuthStore } from "@/stores/auth";
import GroupAllowMemberContribSwitch from "./GroupAllowMemberContribSwitch.vue";
import UserAdminSelect from "./UserAdminSelect.vue";

const props = defineProps({
  isSubgroup: {
    type: Boolean,
    default: false,
  },
  parentGroup: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update"]);
defineExpose({ show, hide });

const { validate, resetValidation, isValid } = useForm("formRef");

const auth = useAuthStore();

const visible = ref(false);
const loading = ref(false);
const isChildMode = ref(false);

const formData = ref({
  name: "",
  allow_user_contributions: false,
  selectedParentGroup: null,
  selectedAdmins: [],
  // Whether the creator governs the child they are creating. Creating a child group confers
  // oversight over it, never authority within it, so this is the creator's own choice rather
  // than something the API adds for them.
  // @see docs/design/groups/e2e-test-flows.md — A1
  creatorIsAdmin: true,
});

watch(isChildMode, (value) => {
  if (!value) {
    formData.value.selectedParentGroup = null;
  }
});

// A child group must arrive with at least one admin, so the creator may only step back once
// somebody else is named. Losing the last other admin puts them back in.
watch(
  () => formData.value.selectedAdmins.length,
  (count) => {
    if (count === 0) {
      formData.value.creatorIsAdmin = true;
    }
  },
);

const nameRules = [
  (v) => !!v || "Group name is required",
  (v) => v.length >= 2 || "Group name must be at least 2 characters",
  (v) => v.length <= 255 || "Group name must be at most 255 characters",
];

// Both the subgroup mode and the create-group child mode post to `POST /groups/:id/children`,
// and it is that route that requires an admin.
const isChildTarget = computed(() => props.isSubgroup || isChildMode.value);
const childNoun = computed(() => (props.isSubgroup ? "subgroup" : "group"));

const canDeclineAdmin = computed(
  () => formData.value.selectedAdmins.length > 0,
);

const creatorAdminHint = computed(() => {
  if (!canDeclineAdmin.value) {
    return `At least one admin is needed. Add another admin above to leave this ${childNoun.value} to somebody else.`;
  }
  return `Clear this if you should not govern the ${childNoun.value}. Creating it already gives you oversight.`;
});

// Whoever is signed in never appears in the admin search: they are the checkbox, not a result.
const adminSearchExcludeIds = computed(() =>
  isChildTarget.value && auth.user?.subject_id ? [auth.user.subject_id] : [],
);

/** Every admin the request names, the creator included when they chose to be one. */
const adminIds = computed(() => {
  const ids = formData.value.selectedAdmins.map((admin) => admin.subject_id);
  if (
    isChildTarget.value &&
    formData.value.creatorIsAdmin &&
    auth.user?.subject_id
  ) {
    ids.push(auth.user.subject_id);
  }
  return ids;
});

const confirmationValid = computed(() => {
  if (!isValid.value) return false;
  if (isChildTarget.value) {
    const selectedParent = props.isSubgroup
      ? props.parentGroup
      : formData.value.selectedParentGroup;
    if (!selectedParent) return false;
    if (adminIds.value.length === 0) return false;
  }
  return true;
});

function show() {
  visible.value = true;
  resetValidation();
  // Reset form when opening
  formData.value = {
    name: "",
    allow_user_contributions: false,
    selectedParentGroup: null,
    selectedAdmins: [],
    creatorIsAdmin: true,
  };
  isChildMode.value = false;
}

function hide() {
  visible.value = false;
}

async function confirm() {
  if (!confirmationValid.value) return;

  loading.value = true;
  try {
    // Determine parent group
    const parentGroupId = props.isSubgroup
      ? props.parentGroup.id
      : isChildMode.value
        ? formData.value.selectedParentGroup?.id
        : null;

    // Create the group
    let newGroupRes;
    if (parentGroupId) {
      newGroupRes = await GroupService.createChild(parentGroupId, {
        name: formData.value.name,
        allow_user_contributions: formData.value.allow_user_contributions,
        admins: adminIds.value,
      });
    } else {
      newGroupRes = await GroupService.create({
        name: formData.value.name,
        allow_user_contributions: formData.value.allow_user_contributions,
        admins: adminIds.value,
      });
    }

    hide();
    toast.success(
      props.isSubgroup
        ? "Subgroup created successfully!"
        : "Group created successfully!",
    );
    emit("update", newGroupRes.data);
  } catch (error) {
    console.error("Failed to create group:", error);
    toast.error(
      error?.response?.data?.message ??
        "Failed to create group. Please try again.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
