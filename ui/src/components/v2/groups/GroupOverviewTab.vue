<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 items-start">
    <!-- Left column -->
    <div class="flex flex-col gap-4">
      <!-- Group Details panel -->
      <VaCard>
        <VaCardContent>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold">GROUP DETAILS</h2>
            <VaButton
              v-if="props.canEdit"
              preset="plain"
              size="small"
              icon="edit"
              @click="openEditModal"
            >
              Edit Metadata
            </VaButton>
          </div>

          <dl
            class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800"
          >
            <div class="py-2.5 flex gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Name
              </dt>
              <dd class="text-sm text-gray-800 dark:text-gray-200">
                {{ props.group.name }}
              </dd>
            </div>
            <div class="py-2.5 flex gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Description
              </dt>
              <dd class="text-sm line-clamp-2">
                {{ props.group.description || "—" }}
              </dd>
            </div>
            <div class="py-2.5 flex gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Status
              </dt>
              <dd>
                <ModernChip
                  :color="props.group.is_archived ? 'secondary' : 'success'"
                >
                  {{ props.group.is_archived ? "Archived" : "Active" }}
                </ModernChip>
              </dd>
            </div>
            <div class="py-2.5 flex gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Member Contrib.
              </dt>
              <dd class="text-sm">
                <div class="flex items-center gap-1">
                  <i-mdi-check-circle-outline
                    v-if="props.group.allow_user_contributions"
                    class="text-green-600"
                  />
                  <i-mdi-close-circle-outline
                    v-else
                    class="text-red-600 dark:text-red-400"
                  />

                  <span>
                    {{
                      props.group.allow_user_contributions
                        ? "Enabled"
                        : "Disabled"
                    }}
                  </span>
                </div>
              </dd>
            </div>
            <div v-if="nearestAncestor" class="py-2.5 flex gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Parent Group
              </dt>
              <dd class="text-sm">
                <RouterLink
                  :to="`/v2/groups/${nearestAncestor.id}`"
                  class="hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ nearestAncestor.name }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="props.group.created_at" class="py-2.5 flex gap-4">
              <dt
                class="w-28 shrink-0 text-xs font-medium"
                style="color: var(--va-secondary)"
              >
                Created
              </dt>
              <dd class="text-sm">
                {{ datetime.displayDateTime(props.group.created_at) }}
              </dd>
            </div>
          </dl>
        </VaCardContent>
      </VaCard>

      <!-- Ancestry panel -->
      <VaCard>
        <VaCardContent>
          <h2 class="text-sm font-semibold mb-3">ANCESTRY</h2>
          <div v-if="sortedAncestors.length > 0">
            <div class="flex flex-col text-sm font-mono">
              <div
                v-for="item in treeItems"
                :key="item.isCurrent ? 'current' : item.id"
                class="flex items-center leading-6"
                :style="{
                  paddingLeft:
                    item.level === 0 ? '0' : `${(item.level - 1) * 1.25}rem`,
                }"
              >
                <span
                  v-if="item.level > 0"
                  class="mr-1 select-none"
                  style="color: var(--va-secondary)"
                  >└──</span
                >
                <RouterLink
                  v-if="!item.isCurrent"
                  :to="`/v2/groups/${item.id}`"
                  class="hover:underline"
                  style="color: var(--va-primary)"
                >
                  {{ item.name }}
                </RouterLink>
                <span
                  v-else
                  class="font-semibold text-gray-800 dark:text-gray-200"
                >
                  {{ item.name }}
                </span>
              </div>
            </div>

            <div
              class="mt-5 flex items-center gap-2 rounded-md px-3 py-2.5 text-xs bg-blue-50 dark:bg-blue-900/20 border border-solid border-blue-200 dark:border-blue-800"
            >
              <i-mdi-information-outline
                class="text-sm shrink-0 mt-0.5 text-blue-600 dark:text-blue-400"
              />
              <span class="text-blue-800 dark:text-blue-300">
                Admins of ancestor groups have oversight visibility over this
                group and its resources. They cannot modify governance settings.
              </span>
            </div>
          </div>
          <div v-else>
            <div class="flex flex-col items-center py-4 gap-1 text-center">
              <i-mdi-sitemap-outline
                class="text-3xl text-gray-300 dark:text-gray-600"
              />
              <p class="text-sm" style="color: var(--va-secondary)">
                This is a top-level (root) group.
              </p>
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Danger Zone -->
      <VaCard
        v-if="props.canEdit"
        class="border border-solid border-red-200 dark:border-red-800"
      >
        <VaCardContent>
          <h2 class="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
            Danger Zone
          </h2>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Archive this group</p>
              <p class="text-xs mt-0.5" style="color: var(--va-secondary)">
                Freezes membership and blocks new governance actions.
              </p>
            </div>
            <VaButton
              color="danger"
              size="small"
              :disabled="props.group.is_archived"
              @click="emit('archive')"
            >
              {{ props.group.is_archived ? "Archived" : "Archive" }}
            </VaButton>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Right column -->
    <div class="flex flex-col gap-4">
      <!-- Stat cards (2×2 grid) -->
      <div class="grid grid-cols-2 gap-3">
        <MetricCard
          label="Members"
          icon="mdi-account-multiple"
          color="primary"
          :value="props.counts.members"
          :loading="props.counts.members === null"
        />
        <MetricCard
          label="Subgroups"
          icon="mdi-sitemap"
          color="info"
          :value="props.counts.subgroups"
          :loading="props.counts.subgroups === null"
        />
        <MetricCard
          label="Datasets"
          icon="mdi-database"
          color="success"
          :value="props.counts.datasets"
          :loading="props.counts.datasets === null"
        />
        <MetricCard
          label="Collections"
          icon="mdi-folder-multiple"
          color="success"
          :value="props.counts.collections"
          :loading="props.counts.collections === null"
        />
        <!-- <MetricCard
          label="Active Grants"
          icon="mdi-key"
          color="warning"
          :value="null"
        /> -->
      </div>

      <!-- Admins panel -->
      <VaCard>
        <VaCardContent>
          <h2 class="text-sm font-semibold mb-3">ADMINS</h2>
          <div v-if="props.group.admins?.length" class="flex flex-col gap-3">
            <div
              v-for="admin in props.group.admins"
              :key="admin.id"
              class="flex items-center gap-2.5 min-w-0"
            >
              <UserAvatar :username="admin.username" :name="admin.name" />
              <div class="min-w-0 flex-1">
                <p
                  class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                >
                  {{ admin.name ?? admin.username }}
                </p>
                <p
                  class="text-xs font-mono truncate"
                  style="color: var(--va-secondary)"
                >
                  {{ admin.email }}
                </p>
              </div>
              <!-- <VaChip color="primary" size="small" class="shrink-0" square>
                Admin
              </VaChip> -->
              <GroupMemberRoleBadge role-name="ADMIN" class="shrink-0" />
            </div>
          </div>
          <div v-else class="flex flex-col items-center py-4 gap-1 text-center">
            <i-mdi-shield-account-outline
              class="text-3xl text-gray-300 dark:text-gray-600"
            />
            <p class="text-sm" style="color: var(--va-secondary)">
              No admins found.
            </p>
          </div>
        </VaCardContent>
      </VaCard>
    </div>
  </div>
  <GroupEditMetadataModal
    ref="editModalRef"
    :group-id="props.group.id"
    :name="props.group.name"
    :description="props.group.description"
    :allow-user-contributions="props.group.allow_user_contributions"
    :version="props.group.version"
    @updated="emit('updated')"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  group: { type: Object, required: true },
  ancestors: { type: Array, default: () => [] },
  /** counts.members / counts.subgroups / counts.resources — null while loading */
  counts: { type: Object, default: () => ({}) },
  canEdit: { type: Boolean, default: false },
});

const emit = defineEmits(["archive"]);

// sorted from root (highest depth) → nearest parent
const sortedAncestors = computed(() =>
  [...props.ancestors].sort((a, b) => b.depth - a.depth),
);

// flat list for tree rendering: each ancestor + current group as the leaf
const treeItems = computed(() => [
  ...sortedAncestors.value.map((ancestor, i) => ({
    ...ancestor,
    level: i,
    isCurrent: false,
  })),
  {
    id: null,
    name: props.group.name,
    level: sortedAncestors.value.length,
    isCurrent: true,
  },
]);

const nearestAncestor = computed(
  () => sortedAncestors.value[sortedAncestors.value.length - 1] ?? null,
);

const editModalRef = ref(null);
function openEditModal() {
  editModalRef.value?.show();
}
</script>
