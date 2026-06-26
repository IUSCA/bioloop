<template>
  <div
    class="w-full flex items-center gap-3 px-4 py-3 rounded-md bg-transparent text-left"
  >
    <!-- Subject Avatar -->
    <div class="flex-shrink-0">
      <SubjectAvatar :subject="props.subject" size="sm" />
    </div>

    <!-- Subject Info (192px fixed) -->
    <div class="w-48 flex-shrink-0 flex flex-col gap-0.5 overflow-hidden">
      <span
        class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
        :title="subjectName"
      >
        {{ subjectName }}
      </span>
      <span
        class="text-xs text-gray-600 dark:text-gray-400 truncate"
        :title="subjectMeta"
      >
        <span v-if="isArchivedGroup" class="text-amber-700 dark:text-amber-500">
          [Archived]
        </span>
        {{ subjectMeta }}
      </span>
    </div>

    <!-- Grants Preview Pills -->
    <div class="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
      <span
        v-for="grant in previewGrants"
        :key="grant.id"
        :class="[
          'text-xs px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 border-solid',
          isGrantExpiring(grant)
            ? 'border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300'
            : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300',
        ]"
      >
        {{ pillLabel(grant) }}
      </span>
      <span
        v-if="overflowCount > 0"
        class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0"
        >+{{ overflowCount }} more</span
      >
    </div>

    <!-- Header Badges -->
    <div class="flex items-center gap-2 flex-shrink-0 ml-1">
      <span
        v-if="hasExpiringGrant"
        class="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
      >
        Expiring
      </span>
    </div>
  </div>
</template>

<script setup>
import SubjectAvatar from "@/components/v2/SubjectAvatar.vue";
import { daysUntilExpiry, isGrantExpiring } from "./grantExpiry.js";

const props = defineProps({
  subject: { type: Object, required: true },
  grants: { type: Array, required: true },
  accessTypeMap: { type: Object, required: true },
});

const isArchivedGroup = computed(
  () =>
    props.subject.type === "GROUP" && props.subject.group?.is_archived === true,
);

const subjectName = computed(() => {
  if (props.subject.type === "USER") {
    return (
      props.subject.user?.name ||
      props.subject.user?.username ||
      props.subject.user?.email ||
      "Unknown user"
    );
  }
  return props.subject.group?.name ?? "Unknown group";
});

const subjectMeta = computed(() => {
  if (props.subject.type === "USER") {
    return props.subject.user?.email ?? "";
  }
  // if (isEveryoneGroup.value) {
  //   return "System · all authenticated users";
  // }
  return props.subject.group?.description ?? "";
});

const MAX_PREVIEW = 3;

function isGrantActive(grant) {
  return grant.revoked_at == null && daysUntilExpiry(grant) >= 0;
}

const activeGrants = computed(() => (props.grants ?? []).filter(isGrantActive));

const sortedPreviewGrants = computed(() => {
  return [...activeGrants.value].sort((a, b) => {
    const aExp = isGrantExpiring(a);
    const bExp = isGrantExpiring(b);
    if (aExp !== bExp) return aExp ? -1 : 1;
    const aDay = daysUntilExpiry(a);
    const bDay = daysUntilExpiry(b);
    if (aDay === Infinity && bDay === Infinity) return 0;
    if (aDay === Infinity) return 1;
    if (bDay === Infinity) return -1;
    return aDay - bDay;
  });
});

const previewGrants = computed(() =>
  sortedPreviewGrants.value.slice(0, MAX_PREVIEW),
);

const overflowCount = computed(() =>
  Math.max(0, sortedPreviewGrants.value.length - MAX_PREVIEW),
);

const hasExpiringGrant = computed(() =>
  activeGrants.value.some(isGrantExpiring),
);

function pillLabel(grant) {
  const name =
    props.accessTypeMap[grant.access_type_id]?.description ?? "Unknown";
  const days = daysUntilExpiry(grant);
  if (days !== Infinity && days <= 14 && days >= 0) {
    return `${name} · Expires in ${days}d`;
  }
  return name;
}
</script>
