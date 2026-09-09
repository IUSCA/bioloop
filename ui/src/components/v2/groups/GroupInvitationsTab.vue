<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <ModernButtonToggle
        v-model="activeStatus"
        :options="statusOptions"
        label="SHOW"
      />
      <!-- Icon in the slot, not the `icon` prop. The prop expects the Material icon font,
           which this app does not load, and renders a stray glyph instead. Every other
           button in these tabs uses the slot form. -->
      <VaButton v-if="props.canInvite" size="small" @click="emit('invite')">
        <div class="flex items-center justify-between gap-2 mx-1">
          <i-mdi-email-plus-outline class="text-sm" />
          Invite by email
        </div>
      </VaButton>
    </div>

    <div
      v-if="loading"
      class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
    >
      Loading invitations...
    </div>

    <div v-else-if="error" class="py-8">
      <ErrorState title="Failed to load invitations" :message="error" />
    </div>

    <div v-else-if="rows.length === 0" class="py-8">
      <EmptyState
        title="No invitations"
        :message="
          activeStatus === 'PENDING'
            ? 'Nobody is waiting to accept an invitation to this group.'
            : 'No invitations match this filter.'
        "
        :show-clear-filters="false"
      />
    </div>

    <VaDataTable v-else :items="rows" :columns="columns" hoverable>
      <template #cell(invited_email)="{ rowData }">
        <span class="font-medium">{{ rowData.invited_email }}</span>
      </template>

      <template #cell(status)="{ rowData }">
        <VaBadge
          :text="badgeFor(rowData).text"
          :color="badgeFor(rowData).color"
        />
      </template>

      <template #cell(inviter)="{ rowData }">
        {{ rowData.inviter?.name || rowData.inviter?.username || "—" }}
      </template>

      <template #cell(expires_at)="{ rowData }">
        <span :class="rowData.is_expired ? 'va-text-danger' : ''">
          {{ formatDate(rowData.expires_at) }}
        </span>
      </template>

      <template #cell(actions)="{ rowData }">
        <VaButton
          v-if="props.canInvite && rowData.status === 'PENDING'"
          size="small"
          preset="plain"
          color="danger"
          :loading="cancelling === rowData.id"
          @click="cancel(rowData)"
        >
          Withdraw
        </VaButton>
      </template>
    </VaDataTable>
  </div>
</template>

<script setup>
import { displayDateTime } from "@/services/datetime";
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";

const props = defineProps({
  groupId: { type: String, required: true },
  // Whether the viewer may issue and withdraw. Reading the list is its own capability, and
  // survives archiving; issuing does not.
  canInvite: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed", "invite"]);

const statusOptions = [
  { label: "Pending", value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Withdrawn", value: "CANCELLED" },
  { label: "All", value: "all" },
];

const columns = [
  { key: "invited_email", label: "Email" },
  { key: "role", label: "Role", width: "100px" },
  { key: "status", label: "Status", width: "130px" },
  { key: "inviter", label: "Invited by", width: "180px" },
  { key: "expires_at", label: "Expires", width: "180px" },
  { key: "actions", label: "", width: "110px" },
];

const rows = ref([]);
const loading = ref(false);
const error = ref(null);
const cancelling = ref(null);
const activeStatus = ref("PENDING");

const formatDate = (value) => (value ? displayDateTime(value) : "—");

/**
 * Expired is not a status. It is `PENDING` past `expires_at`, computed by the API, so the
 * badge has to read both fields rather than one.
 */
function badgeFor(row) {
  if (row.status === "PENDING") {
    return row.is_expired
      ? { text: "Expired", color: "warning" }
      : { text: "Pending", color: "info" };
  }
  if (row.status === "ACCEPTED") return { text: "Accepted", color: "success" };
  return { text: "Withdrawn", color: "secondary" };
}

async function fetchInvitations() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await GroupService.listInvitations(props.groupId, {
      status: activeStatus.value,
    });
    rows.value = data.data || [];
    // The badge counts what is outstanding, so it tracks the pending set rather than
    // whichever filter happens to be showing.
    if (activeStatus.value === "PENDING") {
      emit("count-changed", data.metadata?.total ?? rows.value.length);
    }
  } catch (err) {
    console.error(err);
    error.value = "Unable to load invitations for this group.";
  } finally {
    loading.value = false;
  }
}

async function cancel(row) {
  cancelling.value = row.id;
  try {
    await GroupService.cancelInvitation(props.groupId, row.id);
    toast.success(`Invitation to ${row.invited_email} withdrawn`);
    await fetchInvitations();
  } catch (err) {
    console.error(err);
    toast.error("Could not withdraw the invitation");
  } finally {
    cancelling.value = null;
  }
}

watch(activeStatus, fetchInvitations);
watch(() => props.groupId, fetchInvitations);
onMounted(fetchInvitations);

defineExpose({ refresh: fetchInvitations });
</script>
