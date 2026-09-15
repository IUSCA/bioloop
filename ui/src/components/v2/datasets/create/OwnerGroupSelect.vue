<!--
  Which group will own the new dataset.

  Three states, because the useful thing to show depends entirely on how many groups the
  user can actually choose between:

    none  — submission is blocked, with a plain explanation rather than an empty dropdown
    one   — auto-selected and named, so there is nothing to decide
    many  — a select, with the reason each group is offered

  Backed by GET /v2/datasets/eligible-owner-groups, whose rules mirror the dataset.contribute
  policy exactly. A group offered here is one the create will accept.

  @see docs/design/groups/implementation/dataset-creation-plan.md — A5
-->
<template>
  <div class="space-y-3">
    <VaInnerLoading :loading="loading">
      <!-- Nothing to choose from: say why, and let the form block itself. -->
      <ModernAlert
        v-if="!loading && groups.length === 0"
        icon="mdi-account-off-outline"
        color="warning"
        title="No group can own this dataset"
      >
        A dataset must belong to a group. You are not an admin of any group, and
        none of your groups accept datasets from members. Ask a group admin to
        add the dataset for you, or to turn on member contributions.
      </ModernAlert>

      <!-- Exactly one: no decision to make, but say which one it is. -->
      <div v-else-if="groups.length === 1" class="space-y-2">
        <GroupChip :group="groups[0]" />
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ reasonText(groups[0]) }}
        </p>
      </div>

      <!-- Several: a real choice. -->
      <div v-else class="space-y-2">
        <VaSelect
          v-model="selectedId"
          class="w-full owner-group-select"
          outline
          label="Owning Group"
          required-mark
          :disabled="disabled"
          :options="options"
          value-by="value"
          text-by="text"
          placeholder="Choose a group"
        />
        <p v-if="selected" class="text-xs text-gray-500 dark:text-gray-400">
          {{ reasonText(selected) }}
        </p>
      </div>
    </VaInnerLoading>

    <ModernAlert
      v-if="selected"
      icon="mdi-information"
      color="info"
      title="What ownership means"
    >
      <span class="font-semibold italic">{{ selected.name }}</span> governs this
      dataset. Its admins decide who may see it and who may download it, and the
      dataset is archived under that group.
    </ModernAlert>
  </div>
</template>

<script setup>
import GroupChip from "@/components/v2/groups/GroupChip.vue";
import ModernAlert from "@/components/utils/ModernAlert.vue";
import DatasetService from "@/services/v2/datasets";
import toast from "@/services/toast";
import { computed, onMounted, ref, watch } from "vue";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  // When the dialog is opened from a group's page, that group is preselected and the
  // picker still shows what it selected rather than hiding the decision.
  preselectGroupId: { type: String, required: false, default: null },
});

const emit = defineEmits(["update:modelValue", "loaded"]);

const loading = ref(true);
const groups = ref([]);
const selectedId = ref(null);

const selected = computed(
  () => groups.value.find((g) => g.id === selectedId.value) || null,
);

const options = computed(() =>
  groups.value.map((g) => ({ value: g.id, text: g.name })),
);

/** Why this group is on the list. The rules are not obvious from the name alone. */
function reasonText(group) {
  if (group.admitted_by === "PLATFORM_ADMIN")
    return "Offered because you are a platform admin.";
  if (group.admitted_by === "ADMIN")
    return "Offered because you are an admin of this group.";
  return "Offered because this group accepts datasets from its members.";
}

watch(selected, (group) => emit("update:modelValue", group));

onMounted(async () => {
  try {
    const { data } = await DatasetService.eligibleOwnerGroups();
    groups.value = data;

    if (
      props.preselectGroupId &&
      data.some((g) => g.id === props.preselectGroupId)
    ) {
      selectedId.value = props.preselectGroupId;
    } else if (data.length === 1) {
      selectedId.value = data[0].id;
    }
  } catch (err) {
    toast.error("Could not load the groups you can create datasets in");
  } finally {
    loading.value = false;
    emit("loaded", groups.value);
  }
});
</script>
