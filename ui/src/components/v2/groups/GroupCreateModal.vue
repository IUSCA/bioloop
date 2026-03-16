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
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
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

            <!-- Description -->
            <div>
              <VaTextarea
                class="w-full"
                v-model="formData.description"
                placeholder="Optional description of the group's purpose and scope"
                outline
                label="Description"
                :rows="3"
                required-mark
                :rules="descriptionRules"
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
                <GroupSearchSelect
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
              <!-- <div
                class="rounded-lg border border-solid border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/20 p-4"
              >
                <div class="font-medium text-gray-900 dark:text-gray-100">
                  {{ props.parentGroup.name }}
                </div>
              </div> -->
              <GroupChip :group="props.parentGroup" />
            </div>

            <!-- Warnings/Callouts when parent is fixed (subgroup mode) -->
            <div v-if="props.isSubgroup" class="space-y-3 mt-4">
              <!-- Membership Propagation Warning -->
              <div
                class="rounded-lg px-4 py-3 flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-solid border-amber-200 dark:border-amber-800"
              >
                <i-mdi-alert
                  class="text-amber-600 dark:text-amber-500 flex-shrink-0 mt-1"
                />
                <div class="text-sm">
                  <div class="font-medium text-amber-900 dark:text-amber-100">
                    Membership propagation
                  </div>
                  <div class="text-xs text-amber-800 dark:text-amber-200 mt-1">
                    <div>
                      Members of this subgroup are automatically implicit
                      members of
                      <span class="font-semibold">
                        {{ props.parentGroup.name }}
                      </span>
                      and all ancestor groups. Any grants assigned to parent
                      groups automatically apply to this subgroup. This is
                      structural and cannot be restricted.
                    </div>
                  </div>
                </div>
              </div>

              <!-- Oversight Chain Info -->
              <div
                class="rounded-lg px-4 py-3 flex gap-3 bg-blue-50 dark:bg-blue-900/20 border border-solid border-blue-200 dark:border-blue-800"
              >
                <i-mdi-information
                  class="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1"
                />
                <div class="text-sm">
                  <div class="font-medium text-blue-900 dark:text-blue-100">
                    Oversight chain
                  </div>
                  <div class="text-xs text-blue-800 dark:text-blue-200 mt-1">
                    Admins of
                    <span class="font-semibold">{{
                      props.parentGroup.name
                    }}</span>
                    and parent groups above will have oversight visibility over
                    this subgroup.
                  </div>
                </div>
              </div>
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
          <UserAdminSelect v-model="formData.selectedAdmins" />
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

const visible = ref(false);
const loading = ref(false);
const isChildMode = ref(false);

const formData = ref({
  name: "",
  description: "",
  allow_user_contributions: false,
  selectedParentGroup: null,
  selectedAdmins: [],
});

watch(isChildMode, (value) => {
  if (!value) {
    formData.value.selectedParentGroup = null;
  }
});

const nameRules = [
  (v) => !!v || "Group name is required",
  (v) => v.length >= 2 || "Group name must be at least 2 characters",
  (v) => v.length <= 255 || "Group name must be at most 255 characters",
];

const descriptionRules = [
  (v) => !!v || "Group description is required",
  (v) =>
    !v || v.length <= 2000 || "Description must be at most 2000 characters",
];

const confirmationValid = computed(() => {
  if (!isValid.value) return false;
  if (isChildMode.value || props.isSubgroup) {
    const selectedParent = props.isSubgroup
      ? props.parentGroup
      : formData.value.selectedParentGroup;
    if (!selectedParent) return false;
  }
  return true;
});

function show() {
  visible.value = true;
  resetValidation();
  // Reset form when opening
  formData.value = {
    name: "",
    description: "",
    allow_user_contributions: false,
    selectedParentGroup: null,
    selectedAdmins: [],
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

    // Extract admin IDs for API call
    const adminIds = formData.value.selectedAdmins.map(
      (admin) => admin.subject_id,
    );

    // Create the group
    let newGroupRes;
    if (parentGroupId) {
      newGroupRes = await GroupService.createChild(parentGroupId, {
        name: formData.value.name,
        description: formData.value.description,
        allow_user_contributions: formData.value.allow_user_contributions,
        admins: adminIds,
      });
    } else {
      newGroupRes = await GroupService.create({
        name: formData.value.name,
        description: formData.value.description,
        allow_user_contributions: formData.value.allow_user_contributions,
        admins: adminIds,
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
