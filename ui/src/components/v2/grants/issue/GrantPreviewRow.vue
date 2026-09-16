<template>
  <div class="flex items-start justify-between gap-4 px-3 py-2.5">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <AccessTypeName
          :access-type="props.row.access_type"
          show-identifier
          label-class="text-sm font-medium text-gray-900 dark:text-gray-100"
        />
      </div>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ note }}</p>
      <!--
        Access the subject already has by another path, which the row above cannot show:
        the effective-grants computation matches on the exact subject, because that is what
        a write may supersede. A reviewer seeing this can decline as redundant.
        @see docs/design/groups/implementation/access-requests-plan.md — C2
      -->
      <p
        v-for="cover in props.row.indirect_coverage || []"
        :key="cover.id"
        class="mt-0.5 text-xs text-amber-700 dark:text-amber-400"
      >
        {{ coverageNote(cover) }}
      </p>
    </div>
    <span
      class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
      :class="badge.classes"
    >
      {{ badge.label }}
    </span>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
const props = defineProps({
  /** { type: 'new'|'existing'|'supersede', access_type_id, expiry, existingGrant, access_type, covered_by_wider, source } */
  row: {
    type: Object,
    required: true,
  },
});

const BADGE = {
  new: {
    label: "New",
    classes:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  existing: {
    label: "Existing",
    classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  },
  supersede: {
    label: "Extending",
    classes:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
};

const badge = computed(() => BADGE[props.row.type] ?? BADGE.existing);

const fmt = (d) => (d?.type === "never" ? "never" : datetime.date(d?.value));

const note = computed(() => {
  const { type, expiry, existingGrant } = props.row;

  if (type === "new") return `Will be given · expires ${fmt(expiry)}`;
  if (type === "existing") {
    // existing grant with equal or later valid_until than the approved_until - existing grant remains effective
    // Approving this item writes nothing, so the covering grant is the whole explanation.
    // @see docs/design/groups/implementation/access-requests-plan.md — C3
    if (props.row.covered_by_wider) {
      // The covering grant is a wider access type, which confers this one through the order,
      // so naming it is the difference between an explanation and an apparent no-op.
      // @see docs/design/groups/decisions.md — 7. Access types imply one another
      const wider =
        existingGrant?.access_type?.description ??
        existingGrant?.access_type?.name ??
        "a wider permission";
      return `Already conferred by “${wider}” expiring ${fmt(existingGrant?.expiry)} — nothing will be written`;
    }
    return `Already covered by a permission expiring ${fmt(existingGrant?.expiry)} — nothing will be written`;
  }
  if (type === "supersede") {
    // existing grant with earlier valid_until than the approved_until - new grant would supersede the existing grant
    return `Expiry ${fmt(existingGrant?.expiry)} → ${fmt(expiry)} · extending existing permission`;
  }
  return "";
});

/**
 * One line naming a grant that already reaches the subject by some other path.
 */
function coverageNote(cover) {
  const until = cover.valid_until
    ? `until ${datetime.date(cover.valid_until)}`
    : "with no end date";
  if (cover.via === "GROUP" && cover.via_group_name) {
    return `Members of ${cover.via_group_name} already have this ${until}`;
  }
  if (cover.via === "PRINCIPAL") {
    return `Everyone signed in already has this ${until}`;
  }
  if (cover.via_collection_name) {
    return `Already held through the collection ${cover.via_collection_name} ${until}`;
  }
  return `Already held by another path ${until}`;
}
</script>
