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
        The group either does not exist or has not published a profile. If you
        have a Bioloop account, sign in — you may be able to see it there.
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
    <ErrorState title="Failed to load this profile" @retry="fetchGroup" />
  </div>

  <div v-else-if="group" class="flex flex-col gap-5">
    <ProfileHeader
      kind="group"
      :name="group.name"
      :tagline="group.tagline"
      :type="group.metadata?.type"
      :is-archived="group.is_archived"
    />

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div class="flex flex-col gap-4">
        <ProfileAbout :about-md="group.about_md" />
        <ProfileCitation :citation="group.citation" kind="group" />
        <ProfilePublications :publications="group.metadata?.publications" />

        <VaCard v-if="isEmptyProfile">
          <VaCardContent class="py-10 text-center">
            <p class="text-sm" style="color: var(--va-secondary)">
              This group has published a profile but has not written anything in
              it yet.
            </p>
          </VaCardContent>
        </VaCard>
      </div>

      <div class="flex flex-col gap-4">
        <ProfileLinks :links="group.metadata?.links" />

        <!--
          Names only. `admins[*].email` stops at the member tier, so a group that wants to
          be reachable publishes a shared inbox as a contact link instead.
          @see docs/design/groups/profiles.md — What each audience sees
        -->
        <VaCard v-if="group.admins?.length">
          <VaCardContent>
            <h2 class="text-sm font-semibold mb-3">ADMINS</h2>
            <div class="flex flex-col gap-3">
              <div
                v-for="admin in group.admins"
                :key="admin.id"
                class="flex items-center gap-2.5 min-w-0"
              >
                <UserAvatar :name="admin.name" :username="admin.id" />
                <p class="text-sm font-medium truncate">{{ admin.name }}</p>
              </div>
            </div>
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
 * A group profile, readable without an account.
 *
 * The API answers the same 404 for a group that does not exist and for one whose profile
 * is not published, so this page cannot tell the two apart and does not try to.
 *
 * @see docs/design/groups/profiles.md — The public router
 */
const props = defineProps({ id: { type: String, required: true } });

const group = ref(null);
const loading = ref(true);
const error = ref(null);
const notFound = ref(false);

/** A published profile with none of its optional parts filled in still needs to say so. */
const isEmptyProfile = computed(
  () =>
    !group.value?.about_md?.trim() &&
    !group.value?.citation &&
    !group.value?.metadata?.publications?.length,
);

async function fetchGroup() {
  loading.value = true;
  error.value = null;
  notFound.value = false;
  try {
    const { data } = await PublicProfileService.getGroup(props.id);
    group.value = data;
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

onMounted(fetchGroup);
</script>

<route lang="yaml">
meta:
  layout: public
  title: Group profile
  requiresAuth: false
</route>
