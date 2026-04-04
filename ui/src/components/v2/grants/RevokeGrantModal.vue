<template>
  <VaModal
    v-model="visible"
    size="medium"
    hide-default-actions
    no-outside-dismiss
    @cancel="hide"
  >
    <!-- ── HEADER ─────────────────────────────────── -->
    <template #header>
      <div
        class="flex items-center gap-4 pb-3 border-b border-solid border-gray-200 dark:border-gray-700/60"
      >
        <div
          class="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/10 ring-1 ring-red-500/20 text-red-500 dark:text-red-400"
        >
          <Icon icon="mdi-shield-off-outline" class="text-xl" />
        </div>
        <div class="min-w-0">
          <h2
            class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100"
          >
            Revoke Access Grant
          </h2>
        </div>
      </div>
    </template>

    <!-- ── BODY ──────────────────────────────────── -->
    <VaInnerLoading :loading="loading">
      <div class="px-3 mt-5 space-y-3">
        <!-- Governance alert -->
        <div
          class="flex gap-3 items-start rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-solid border-amber-200 dark:border-amber-700/50 px-4 py-3.5"
        >
          <Icon
            icon="mdi-shield-alert-outline"
            class="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400 text-lg"
          />
          <div class="min-w-0">
            <p
              class="text-sm font-medium text-amber-800 dark:text-amber-300 leading-5"
            >
              Immediate access revocation
            </p>
            <p
              class="mt-0.5 text-sm text-amber-700 dark:text-amber-400/80 leading-5"
            >
              This grant will be permanently revoked and access will be removed
              immediately. This action cannot be undone and is recorded in the
              audit log.
            </p>
          </div>
        </div>

        <!-- Grant detail block -->
        <div
          class="rounded-lg border border-solid border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 overflow-hidden"
        >
          <!-- Subject row -->
          <div
            class="flex items-center gap-3 px-4 py-3.5 border-b border-solid border-red-200 dark:border-red-800/60"
          >
            <div
              class="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400"
            >
              <Icon
                :icon="
                  subject?.type === 'GROUP'
                    ? 'mdi-account-group'
                    : 'mdi-account'
                "
                class="text-base"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p
                class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate"
              >
                {{ subjectName }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ subject?.type === "GROUP" ? "Group" : "User" }}
              </p>
            </div>
            <span
              class="shrink-0 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full ring-1 ring-red-200 dark:ring-red-700/50"
            >
              Revoking
            </span>
          </div>

          <!-- Access type row -->
          <div class="px-4 py-3.5">
            <p
              class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1"
            >
              Access Type
            </p>
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ accessTypeName }}
            </p>
            <p
              v-if="accessTypeDescription"
              class="text-xs text-gray-600 dark:text-gray-400 mt-0.5"
            >
              {{ accessTypeDescription }}
            </p>
          </div>
        </div>

        <!-- Consequences -->
        <ul class="space-y-2">
          <li
            class="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-5"
          >
            <Icon
              icon="mdi-account-key-outline"
              class="shrink-0 mt-0.5 text-base"
            />
            <span>
              The subject will lose access associated with this grant
              immediately upon confirmation.
            </span>
          </li>
          <li
            class="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-5"
          >
            <Icon
              icon="mdi-clipboard-text-clock-outline"
              class="shrink-0 mt-0.5 text-base"
            />
            <span>
              This revocation is permanently recorded in the audit log with full
              provenance.
            </span>
          </li>
        </ul>
      </div>
    </VaInnerLoading>

    <!-- ── FOOTER ─────────────────────────────────── -->
    <template #footer>
      <div class="flex items-center justify-end gap-2.5 px-3 py-4">
        <VaButton
          preset="secondary"
          class="!text-sm !font-medium"
          :disabled="loading"
          @click="hide"
        >
          Cancel
        </VaButton>
        <VaButton
          color="danger"
          class="!text-sm !font-medium"
          :loading="loading"
          :disabled="loading"
          @click="revokeGrant"
        >
          <Icon icon="mdi-shield-off-outline" class="mr-1 text-base" />
          Revoke Grant
        </VaButton>
      </div>
    </template>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import GrantService from "@/services/v2/grants";

const props = defineProps({
  accessTypeMap: { type: Object, required: true },
});

const emit = defineEmits(["update"]);

defineExpose({ show, hide });

const visible = ref(false);
const loading = ref(false);
const grant = ref(null);
const subject = ref(null);

const subjectName = computed(() => {
  if (!subject.value) return "—";
  if (subject.value.type === "USER") {
    return (
      subject.value.user?.name || subject.value.user?.username || "Unknown User"
    );
  }
  return subject.value.group?.name || "Unknown Group";
});

const accessTypeName = computed(() => {
  if (!grant.value) return "—";
  return (
    props.accessTypeMap[grant.value.access_type_id]?.name ??
    grant.value.access_type?.name ??
    "Unknown Access Type"
  );
});

const accessTypeDescription = computed(() => {
  if (!grant.value) return null;
  return (
    props.accessTypeMap[grant.value.access_type_id]?.description ??
    grant.value.access_type?.description ??
    null
  );
});

function show({ grant: g, subject: s }) {
  grant.value = g;
  subject.value = s;
  visible.value = true;
}

function hide() {
  visible.value = false;
  grant.value = null;
  subject.value = null;
}

async function revokeGrant() {
  loading.value = true;
  try {
    await GrantService.revoke(grant.value.id);
    toast.success("Grant revoked successfully.");
    emit("update");
    hide();
  } catch (err) {
    console.error("Failed to revoke grant:", err);
    toast.error(err?.response?.data?.message ?? "Failed to revoke grant.");
  } finally {
    loading.value = false;
  }
}
</script>
