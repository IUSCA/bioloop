<template>
  <div v-if="loading" class="flex flex-col gap-4">
    <VaSkeleton variant="text" height="32px" width="280px" />
    <VaSkeleton variant="squared" height="360px" />
  </div>

  <VaCard v-else-if="notFound">
    <VaCardContent class="py-12 text-center flex flex-col items-center gap-2">
      <Icon
        icon="mdi-lock-outline"
        class="text-4xl"
        style="color: var(--va-secondary)"
      />
      <h1 class="text-lg font-semibold">This profile is not available</h1>
      <p class="text-sm max-w-md" style="color: var(--va-secondary)">
        The collection either does not exist or has not published a profile. If
        you have a Bioloop account, sign in — you may be able to see it there.
      </p>
      <RouterLink
        to="/auth"
        class="text-sm mt-2 hover:underline"
        style="color: var(--va-primary)"
      >
        Sign in
      </RouterLink>
    </VaCardContent>
  </VaCard>

  <div v-else-if="error" class="py-12">
    <ErrorState title="Failed to load this profile" @retry="fetchCollection" />
  </div>

  <div v-else-if="collection" class="flex flex-col gap-5">
    <ProfileHeader
      kind="collection"
      :name="collection.name"
      :tagline="collection.tagline"
      :is-archived="collection.is_archived"
      :subtitle="ownerLine"
    />

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div class="flex flex-col gap-4">
        <ProfileAbout :about-md="collection.about_md" />
        <ProfileCitation :citation="collection.citation" kind="collection" />
        <ProfilePublications
          :publications="collection.metadata?.publications"
        />

        <!--
          A public reader is told the collection has contents and is told nothing about
          them. Names, sizes, and counts all stop at the member tier.
          @see docs/design/groups/profiles.md — What each audience sees
        -->
        <VaCard>
          <VaCardContent
            class="py-8 text-center flex flex-col items-center gap-2"
          >
            <Icon
              icon="mdi-lock-outline"
              class="text-2xl"
              style="color: var(--va-secondary)"
            />
            <p class="text-sm font-medium">
              The datasets in this collection are not listed here
            </p>
            <p class="text-sm max-w-md" style="color: var(--va-secondary)">
              Sign in and request access to see what this collection contains.
            </p>
          </VaCardContent>
        </VaCard>
      </div>

      <div class="flex flex-col gap-4">
        <ProfileLinks :links="collection.metadata?.links" />

        <VaCard v-if="metadataRows.length">
          <VaCardContent>
            <h2 class="text-sm font-semibold mb-1">METADATA</h2>
            <dl
              class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800"
            >
              <div
                v-for="row in metadataRows"
                :key="row.key"
                class="py-2.5 flex items-start gap-4"
              >
                <dt
                  class="w-28 shrink-0 text-xs font-medium"
                  style="color: var(--va-secondary)"
                >
                  {{ row.key }}
                </dt>
                <dd class="text-sm">{{ row.value }}</dd>
              </div>
            </dl>
          </VaCardContent>
        </VaCard>
      </div>
    </div>
  </div>
</template>

<script setup>
import ProfileAbout from "@/components/v2/profiles/ProfileAbout.vue";
import ProfileCitation from "@/components/v2/profiles/ProfileCitation.vue";
import ProfileHeader from "@/components/v2/profiles/ProfileHeader.vue";
import ProfileLinks from "@/components/v2/profiles/ProfileLinks.vue";
import ProfilePublications from "@/components/v2/profiles/ProfilePublications.vue";
import PublicProfileService from "@/services/v2/publicProfiles";

/**
 * A collection profile, readable without an account.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({ id: { type: String, required: true } });

const collection = ref(null);
const loading = ref(true);
const error = ref(null);
const notFound = ref(false);

/** Who published it. A citation is not usable without this, so it sits under the name. */
const ownerLine = computed(() => {
  const owner = collection.value?.owner_group?.name;
  return owner ? `Published by ${owner}` : null;
});

/**
 * `metadata.fields` is a free-form map an admin fills in. Only string and number values
 * are rendered; anything else is omitted rather than stringified into something wrong.
 */
const metadataRows = computed(() =>
  Object.entries(collection.value?.metadata?.fields ?? {})
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .map(([key, value]) => ({ key, value })),
);

async function fetchCollection() {
  loading.value = true;
  error.value = null;
  notFound.value = false;
  try {
    const { data } = await PublicProfileService.getCollection(props.id);
    collection.value = data;
    document.title = `${data.name} | Bioloop`;
  } catch (err) {
    if (err?.response?.status === 404) {
      notFound.value = true;
    } else {
      error.value = err;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(fetchCollection);
</script>

<route lang="yaml">
meta:
  layout: public
  title: Collection profile
  requiresAuth: false
</route>
