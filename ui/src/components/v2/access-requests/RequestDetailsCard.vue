<template>
  <VaCard>
    <VaCardContent class="!p-4">
      <h2 class="v2-card-title">Request details</h2>

      <dl class="mt-3">
        <div :class="ROW">
          <dt :class="KEY">Resource</dt>
          <dd :class="VALUE">
            <div v-if="resource" class="min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <Icon
                  :icon="resource.icon"
                  class="shrink-0 va-text-secondary"
                />
                <RouterLink :to="resource.to" class="font-medium truncate">
                  {{ resource.name }}
                </RouterLink>
              </div>
              <p
                v-if="resource.subtitle"
                class="text-xs va-text-secondary pl-5 capitalize"
              >
                {{ resource.subtitle }}
              </p>
            </div>
            <span v-else class="va-text-secondary">—</span>
          </dd>
        </div>

        <div v-if="ownerGroup" :class="ROW">
          <dt :class="KEY">Owned by</dt>
          <dd :class="VALUE">
            <RouterLink
              :to="`/v2/groups/${ownerGroup.id}`"
              class="block truncate"
            >
              {{ ownerGroup.name }}
            </RouterLink>
          </dd>
        </div>

        <div :class="ROW">
          <dt :class="KEY">Requester</dt>
          <dd :class="VALUE">
            <PersonLine :person="props.request?.requester" />
          </dd>
        </div>

        <div :class="ROW">
          <dt :class="KEY">For</dt>
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
            <p
              v-if="isRequestingForSelf"
              class="text-xs italic va-text-secondary mt-1"
            >
              requesting for themselves
            </p>
          </dd>
        </div>

        <div :class="ROW">
          <dt :class="KEY">Submitted</dt>
          <dd :class="VALUE">
            <p>{{ datetime.displayDateTime(submittedAt) }}</p>
            <p class="text-xs va-text-secondary">
              {{ datetime.fromNowShort(submittedAt) }}
            </p>
          </dd>
        </div>

        <div v-if="props.request?.reviewer" :class="ROW">
          <dt :class="KEY">Reviewed by</dt>
          <dd :class="VALUE">
            <PersonLine :person="props.request.reviewer" />
            <p
              v-if="props.request.reviewed_at"
              class="text-xs va-text-secondary mt-1"
            >
              {{ datetime.fromNowShort(props.request.reviewed_at) }}
            </p>
          </dd>
        </div>
      </dl>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The provenance rail on the access request detail page: who asked, for whom, on what, and
 * when.
 *
 * Every row reads left to right — label, then value — because a right-aligned value column
 * makes the reader's eye jump back and forth once per row, and the values here are of very
 * different widths.
 *
 * @see docs/public/mockups/access-request-screens.html — Request details
 */
import PersonLine from "@/components/v2/access-requests/PersonLine.vue";
import constants from "@/constants";
import * as datetime from "@/services/datetime";
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
  "grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-2.5 " +
  "border-b border-solid border-gray-100 dark:border-gray-800 " +
  "first:pt-0 last:pb-0 last:border-b-0";
const KEY = "text-sm va-text-secondary";
const VALUE = "min-w-0 text-sm";

// `ResourceChip` is not used here. It paints its own tinted surface and carries the owning
// group inside its subtitle, which on a 21rem rail both overflows and repeats the row below.
const resource = computed(() => {
  const dataset = props.request?.resource?.dataset;
  if (dataset) {
    return {
      icon: constants.icons.dataset,
      to: `/v2/datasets/${dataset.id}`,
      name: dataset.name,
      subtitle: (dataset.type || "").toLowerCase().split("_").join(" "),
    };
  }
  const collection = props.request?.resource?.collection;
  if (collection) {
    return {
      icon: constants.icons.collection,
      to: `/v2/collections/${collection.id}`,
      name: collection.name,
      subtitle: "collection",
    };
  }
  return null;
});

// The resource row carries either a dataset or a collection, and both hold an owning group.
const ownerGroup = computed(
  () =>
    props.request?.resource?.dataset?.owner_group ||
    props.request?.resource?.collection?.owner_group ||
    null,
);

// A draft that was never submitted has no `submitted_at`, and its creation is the only date
// there is to show.
const submittedAt = computed(
  () => props.request?.submitted_at || props.request?.created_at,
);

// `requester_id` and `subject_id` are both subject ids, and the schema says a self-request is
// exactly the case where they are equal. Comparing the nested `requester.id` to `subject.id`
// compares a user id against a subject id, which never matches.
const isRequestingForSelf = computed(
  () =>
    !!props.request?.requester_id &&
    props.request.requester_id === props.request.subject_id,
);
</script>
