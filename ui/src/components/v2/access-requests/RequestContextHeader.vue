<template>
  <dl>
    <div :class="ROW">
      <dt :class="KEY">{{ resource?.kind || "Resource" }}</dt>
      <dd :class="VALUE">
        <div v-if="resource" class="min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <Icon :icon="resource.icon" class="shrink-0 va-text-secondary" />
            <RouterLink :to="resource.to" class="font-medium truncate">
              {{ resource.name }}
            </RouterLink>
          </div>
          <p class="pl-5 text-xs va-text-secondary">{{ resource.meta }}</p>
        </div>
        <span v-else class="va-text-secondary">—</span>
      </dd>
    </div>

    <div :class="ROW">
      <dt :class="KEY">Requested by</dt>
      <dd :class="VALUE">
        <PersonLine :person="props.request?.requester" />
        <p v-if="isRequestingForSelf" class="mt-1 text-xs va-text-secondary">
          Asking for their own access.
        </p>
      </dd>
    </div>

    <!-- Only when somebody else holds the access, so a self-request does not print the same
         person twice in two different shapes. -->
    <div v-if="!isRequestingForSelf" :class="ROW">
      <dt :class="KEY">Access for</dt>
      <dd :class="VALUE">
        <PersonLine
          v-if="props.request?.subject?.user"
          :person="props.request.subject.user"
        />
        <div
          v-else-if="props.request?.subject?.group"
          class="flex items-center gap-1.5 min-w-0"
        >
          <Icon
            :icon="constants.icons.group"
            class="shrink-0 va-text-secondary"
          />
          <RouterLink
            :to="`/v2/groups/${props.request.subject.group.id}`"
            class="font-medium truncate"
          >
            {{ props.request.subject.group.name }}
          </RouterLink>
        </div>
        <span v-else class="va-text-secondary">—</span>
      </dd>
    </div>

    <div :class="ROW">
      <dt :class="KEY">Purpose</dt>
      <dd :class="VALUE">
        <p v-if="props.request?.purpose" class="whitespace-pre-line">
          {{ props.request.purpose }}
        </p>
        <span v-else class="va-text-secondary">No purpose given</span>
      </dd>
    </div>
  </dl>
</template>

<script setup>
/**
 * What the reviewer is being asked to decide: the resource, the people, and the stated
 * purpose, inside the review modal.
 *
 * Every row reads left to right — label, then value — and every value starts on the same
 * left edge. The earlier version right-aligned the values and rendered each one with a
 * different component: `ResourceChip` painted an emerald card, the requester was a bare
 * avatar with right-aligned text, and `SubjectChip` painted a blue pill. Three tints, three
 * shapes, and three left edges spanning 158px in one column of four rows.
 *
 * This matches `RequestDetailsCard`, the rail on the request detail page, which settled the
 * same question. The label column is wider here because the modal is wider than that rail.
 *
 * The status and the submitted time are not repeated here; the modal header carries both.
 *
 * @see docs/contributing/v2-design-system.md — Typography
 */
import PersonLine from "@/components/v2/access-requests/PersonLine.vue";
import constants from "@/constants";
import { formatBytes } from "@/services/utils";
import { computed } from "vue";

const props = defineProps({
  request: {
    type: Object,
    required: true,
  },
});

// Written out rather than applied in a scoped style block, because `va-text-secondary` is a
// Vuestic class and `@apply` only takes Tailwind utilities.
const ROW =
  "grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 py-3 " +
  "border-b border-solid border-gray-200 dark:border-gray-700 " +
  "first:pt-0 last:pb-0 last:border-b-0";
const KEY = "text-sm va-text-secondary";
const VALUE = "min-w-0 text-sm";

/** "RAW_DATA" reads as "Raw data" in the resource's meta line. */
const sentenceCase = (text) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";

// `ResourceChip` is not used here, for the reason the component block gives: it paints its
// own tinted surface, which is the mismatch this layout exists to remove.
const resource = computed(() => {
  const dataset = props.request?.resource?.dataset;
  if (dataset) {
    return {
      kind: "Dataset",
      icon: constants.icons.dataset,
      to: `/v2/datasets/${dataset.resource_id}`,
      name: dataset.name,
      meta: [
        sentenceCase((dataset.type || "").split("_").join(" ")),
        dataset.size ? formatBytes(dataset.size) : null,
        dataset.owner_group?.name,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const collection = props.request?.resource?.collection;
  if (collection) {
    return {
      kind: "Collection",
      icon: constants.icons.collection,
      to: `/v2/collections/${collection.id}`,
      name: collection.name,
      meta: ["Collection", collection.owner_group?.name]
        .filter(Boolean)
        .join(" · "),
    };
  }
  return null;
});

// `requester_id` and `subject_id` are both subject ids, and the schema says a self-request is
// exactly the case where they are equal. Comparing the nested `requester.id` to `subject.id`
// compares a user id against a subject id, which never matches.
const isRequestingForSelf = computed(
  () =>
    !!props.request?.requester_id &&
    props.request.requester_id === props.request.subject_id,
);
</script>
