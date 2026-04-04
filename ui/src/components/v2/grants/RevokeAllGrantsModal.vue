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
            Revoke All Active Grants
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
              Bulk access revocation
            </p>
            <p
              class="mt-0.5 text-sm text-amber-700 dark:text-amber-400/80 leading-5"
            >
              All
              <strong class="font-semibold">{{ grants.length }}</strong>
              active grant{{ grants.length === 1 ? "" : "s" }} for this subject
              will be permanently revoked immediately. This action cannot be
              undone and each revocation is recorded in the audit log.
            </p>
          </div>
        </div>

        <!-- Subject + grant list block -->
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
                &middot;
                {{ grants.length }} active grant{{
                  grants.length === 1 ? "" : "s"
                }}
                will be revoked
              </p>
            </div>
            <span
              class="shrink-0 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full ring-1 ring-red-200 dark:ring-red-700/50"
            >
              {{ grants.length }}
              grant{{ grants.length === 1 ? "" : "s" }}
            </span>
          </div>

          <!-- Grant list -->
          <ul
            class="divide-y divide-solid divide-red-200 dark:divide-red-800/60"
          >
            <li
              v-for="g in grants"
              :key="g.id"
              class="flex items-center gap-2.5 px-4 py-2.5"
            >
              <Icon
                icon="mdi-key-remove"
                class="shrink-0 text-red-400 dark:text-red-500 text-sm"
              />
              <span class="text-sm text-gray-800 dark:text-gray-200">
                {{
                  props.accessTypeMap[g.access_type_id]?.name ??
                  g.access_type?.name ??
                  "Unknown Access Type"
                }}
              </span>
            </li>
          </ul>
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
              The subject will lose all access listed above immediately upon
              confirmation.
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
              Each revocation is permanently recorded in the audit log with full
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
          @click="revokeAll"
        >
          <Icon icon="mdi-shield-off-outline" class="mr-1 text-base" />
          Revoke All Grants
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
const grants = ref([]);
const subject = ref(null);
const resourceType = ref(null);
const resourceId = ref(null);

const subjectName = computed(() => {
  if (!subject.value) return "—";
  if (subject.value.type === "USER") {
    return (
      subject.value.user?.name || subject.value.user?.username || "Unknown User"
    );
  }
  return subject.value.group?.name || "Unknown Group";
});

function show({ grants: g, subject: s, resourceType: rt, resourceId: ri }) {
  grants.value = g;
  subject.value = s;
  resourceType.value = rt;
  resourceId.value = ri;
  visible.value = true;
}

function hide() {
  visible.value = false;
  grants.value = [];
  subject.value = null;
  resourceType.value = null;
  resourceId.value = null;
}

async function revokeAll() {
  loading.value = true;
  try {
    const res = await GrantService.revokeAll(
      subject.value.type,
      subject.value.id,
      resourceType.value,
      resourceId.value,
    );
    const count = res.data?.revoked ?? grants.value.length;
    toast.success(
      `${count} grant${count === 1 ? "" : "s"} revoked successfully.`,
    );
    emit("update");
    hide();
  } catch (err) {
    console.error("Failed to revoke all grants:", err);
    toast.error(err?.response?.data?.message ?? "Failed to revoke grants.");
  } finally {
    loading.value = false;
  }
}
</script>
