<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <Transition name="fade-slide" mode="out-in">
      <!-- Until the persona is known, nothing about the page's shape is decided. -->
      <div v-if="persona.loading || !settled" key="loading" class="space-y-6">
        <VaSkeleton variant="text" height="34px" width="280px" />
        <VaSkeleton variant="text" height="20px" width="380px" />
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <VaSkeleton v-for="n in 4" :key="n" variant="rounded" height="96px" />
        </div>
      </div>

      <div v-else-if="!persona.uiPersona" key="error" class="py-12">
        <ErrorState
          title="Could not work out what this page should show"
          :message="persona.error?.message"
          @retry="persona.fetchPersona"
        />
      </div>

      <div v-else key="loaded" class="flex flex-col gap-8">
        <DashboardHero
          :eyebrow="hero.eyebrow"
          :title="hero.title"
          :description="hero.description"
          :role-name="hero.roleName"
        />

        <!--
          A panel that failed is named rather than left as a dash, so a reader can tell a
          broken query from a genuine zero.
        -->
        <ModernAlert
          v-if="failures.length > 0"
          color="warning"
          title="Some of this page could not be loaded"
        >
          {{ failures.join(", ") }} did not load. Everything else on this page
          is current.
          <template #actions>
            <VaButton preset="secondary" size="small" @click="load">
              Try again
            </VaButton>
          </template>
        </ModernAlert>

        <DashboardStatRow :cards="statCards" />
      </div>
    </Transition>
  </div>
</template>

<script setup>
/**
 * The landing page at `/v2/home`.
 *
 * One page composed of sections, each rendered when the caller's persona and data
 * warrant it, rather than three disjoint dashboards. A group admin files access requests
 * and holds grants like anyone else, so the personal sections render for every persona.
 *
 * This page owns every call. A section component is presentational and takes its rows as
 * props, so two panels never ask the same question twice.
 *
 * @see docs/design/groups/dashboard-plan.md
 */
import AccessRequestService from "@/services/v2/access-requests";
import CollectionService from "@/services/v2/collections";
import DatasetService from "@/services/v2/datasets";
import GrantsService from "@/services/v2/grants";
import GroupService from "@/services/v2/groups";
import { maybePluralize } from "@/services/utils";
import { useUIPersonaStore } from "@/stores/v2/uiPersona";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const persona = useUIPersonaStore();

/** How many days ahead the expiring-grants query looks. */
const EXPIRY_WINDOW_DAYS = 30;

const firstName = computed(() => {
  const name = auth.user?.name || "";
  return name.split(" ")[0] || name;
});

// ── State, one entry per query ───────────────────────────────────────────────

const settled = ref(false);
const failures = ref([]);

const reachableDatasets = ref(null);
const myGroupsTotal = ref(null);
const myOpenRequests = ref(null);

const pendingReviewTotal = ref(null);
const ownedDatasets = ref(null);
const administeredGroups = ref(null);
const expiringGrants = ref([]);

const platformGroups = ref(null);
const platformDatasets = ref(null);
const platformCollections = ref(null);
const groupsWithoutAdmin = ref([]);

// ── Fetching ─────────────────────────────────────────────────────────────────

/**
 * Runs one query, records a readable name when it fails, and never rejects.
 *
 * A stat with a broken query behind it must not read as a zero, so the value stays null
 * and the failure is named in the alert above the stat row.
 */
async function attempt(label, fn) {
  try {
    await fn();
  } catch (err) {
    failures.value.push(label);
    console.error(`dashboard: ${label} failed`, err);
  }
}

function totalOf(response) {
  return response?.data?.metadata?.total ?? 0;
}

async function load() {
  failures.value = [];

  const calls = [
    attempt("Datasets you can reach", async () => {
      reachableDatasets.value = totalOf(
        await DatasetService.search({ scope: "grants", limit: 0 }),
      );
    }),
    // `POST /groups/search` validates limit as min 1, so a count-only call asks for one
    // row and reads the total beside it.
    attempt("Your groups", async () => {
      myGroupsTotal.value = totalOf(
        await GroupService.search({ scope: "all", limit: 1 }),
      );
    }),
    attempt("Your access requests", async () => {
      myOpenRequests.value = totalOf(
        await AccessRequestService.requestedByMe({
          status: "UNDER_REVIEW",
          limit: 0,
        }),
      );
    }),
  ];

  if (isAdmin.value) {
    calls.push(
      attempt("Requests needing your review", async () => {
        pendingReviewTotal.value = totalOf(
          await AccessRequestService.pendingReview({ limit: 0 }),
        );
      }),
      attempt("Datasets you govern", async () => {
        ownedDatasets.value = totalOf(
          await DatasetService.search({ scope: "ownership", limit: 0 }),
        );
      }),
      attempt("Groups you administer", async () => {
        administeredGroups.value = totalOf(
          await GroupService.search({ scope: "admin", limit: 1 }),
        );
      }),
      // Unpaginated and grouped by subject and resource, so the count is the array
      // length and the panel in phase 3 reads the same rows.
      attempt("Grants expiring soon", async () => {
        const { data } = await GrantsService.expiringGrants({
          within_days: EXPIRY_WINDOW_DAYS,
        });
        expiringGrants.value = data ?? [];
      }),
    );
  }

  if (persona.isPlatformAdmin) {
    calls.push(
      attempt("Platform totals", async () => {
        const [groups, datasets, collections] = await Promise.all([
          GroupService.search({ limit: 1 }),
          DatasetService.search({ limit: 0 }),
          CollectionService.search({ limit: 0 }),
        ]);
        platformGroups.value = totalOf(groups);
        platformDatasets.value = totalOf(datasets);
        platformCollections.value = totalOf(collections);
      }),
      attempt("Groups with no active admin", async () => {
        const { data } = await GroupService.withoutActiveAdmin();
        groupsWithoutAdmin.value = data ?? [];
      }),
    );
  }

  await Promise.all(calls);
  settled.value = true;
}

// ── Presentation ─────────────────────────────────────────────────────────────

const isAdmin = computed(() => persona.isGroupAdmin || persona.isPlatformAdmin);

const hero = computed(() => {
  if (persona.isPlatformAdmin) {
    return {
      eyebrow: "Platform admin",
      title: "System overview",
      description:
        "Full governance authority across every group and resource on the platform.",
      roleName: "PLATFORM_ADMIN",
    };
  }

  if (persona.isGroupAdmin) {
    return {
      eyebrow: "Group admin",
      title: `Hello, ${firstName.value}`,
      description: pendingReviewTotal.value
        ? `${maybePluralize(pendingReviewTotal.value, "access request")} waiting for your decision.`
        : "Nothing is waiting for your decision right now.",
      roleName: "ADMIN",
    };
  }

  return {
    eyebrow: "Your access",
    title: `Hello, ${firstName.value}`,
    description: "Everything you can reach, and everything you have asked for.",
    roleName: "MEMBER",
  };
});

const statCards = computed(() => {
  if (persona.isPlatformAdmin) {
    return [
      {
        label: "Groups",
        value: platformGroups.value,
        icon: "mdi-account-group",
        color: "info",
      },
      {
        label: "Datasets",
        value: platformDatasets.value,
        icon: "mdi-database",
        color: "primary",
      },
      {
        label: "Collections",
        value: platformCollections.value,
        icon: "mdi-folder-multiple",
        color: "success",
      },
      {
        label: "Groups with no active admin",
        value: groupsWithoutAdmin.value.length,
        icon: "mdi-shield-alert",
        color: "warning",
      },
    ];
  }

  if (persona.isGroupAdmin) {
    return [
      {
        label: "Pending reviews",
        value: pendingReviewTotal.value,
        icon: "mdi-timer-sand",
        color: "warning",
      },
      {
        label: "Datasets I govern",
        value: ownedDatasets.value,
        icon: "mdi-database",
        color: "primary",
      },
      {
        label: "Groups I administer",
        value: administeredGroups.value,
        icon: "mdi-account-group",
        color: "info",
      },
      {
        label: `Grants expiring in ${EXPIRY_WINDOW_DAYS} days`,
        value: expiringGrants.value.length,
        icon: "mdi-clock-alert",
        color: "danger",
      },
    ];
  }

  return [
    {
      label: "Datasets I can reach",
      value: reachableDatasets.value,
      icon: "mdi-database",
      color: "primary",
    },
    {
      label: "Groups I belong to",
      value: myGroupsTotal.value,
      icon: "mdi-account-group",
      color: "info",
    },
    {
      label: "Requests awaiting a decision",
      value: myOpenRequests.value,
      icon: "mdi-timer-sand",
      color: "warning",
    },
  ];
});

// The store fetches the persona from its own onMounted, so this page waits for the
// answer rather than asking a second time.
watch(
  () => [persona.loading, persona.uiPersona],
  () => {
    if (!persona.loading && persona.uiPersona && !settled.value) load();
  },
  { immediate: true },
);
</script>

<route lang="yaml">
meta:
  title: Home
  nav:
    - { label: "Home" }
</route>
