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
          :error="persona.error"
          subject="this dashboard"
          @retry="persona.fetchPersona"
        />
      </div>

      <div v-else key="loaded" class="flex flex-col gap-8">
        <DashboardHero
          :eyebrow="hero.eyebrow"
          :title="hero.title"
          :description="hero.description"
          :role-name="hero.roleName"
        >
          <!--
            An overseer can see a descendant group and act on none of it, and nothing
            else on the page says so.
            @see docs/design/groups/trust-and-communication.md - 4. Oversight visibility
          -->
          <template v-if="heroMeta.length > 0" #meta>
            <template v-for="(item, i) in heroMeta" :key="item">
              <span v-if="i > 0" aria-hidden="true" class="opacity-50">·</span>
              <span>{{ item }}</span>
            </template>
          </template>
        </DashboardHero>

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

        <!--
          Zero-default access means a caller with no grants meets an empty portal
          everywhere, which reads as a broken system rather than as an unshared one.
          @see docs/design/groups/trust-and-communication.md - 8. Zero-default access
        -->
        <ModernAlert
          v-if="hasNoAccessAtAll"
          color="warning"
          title="Nothing has been shared with you yet"
        >
          Access here is granted, never assumed. A dataset stays invisible to
          you until an admin of the group that owns it grants you access, or
          adds you to that group. An empty page means nothing has been shared
          with you, not that the platform is empty.
          <template #actions>
            <VaButton preset="primary" size="small" to="/v2/datasets">
              Browse what I can see
            </VaButton>
          </template>
        </ModernAlert>

        <!--
          Platform sections sit on top for a platform admin. Two signals, both with a
          query behind them; the rest of the mockup's alert panel had none.
        -->
        <template v-if="persona.isPlatformAdmin">
          <p
            class="-mb-4 text-xs font-semibold uppercase tracking-wider va-text-secondary"
          >
            Platform
          </p>

          <!--
            Stacked at full width rather than paired. An audit message wraps to three
            lines in a half-width card, which made this panel five times the height of
            anything beside it.
          -->
          <div class="flex flex-col gap-4">
            <DashboardSection
              title="Groups with no active admin"
              subtitle="Nobody can govern the data these groups own"
              :count="groupsWithoutAdmin.length"
              :count-color="
                groupsWithoutAdmin.length > 0 ? 'warning' : 'neutral'
              "
              to="/v2/groups"
              link-label="All groups →"
            >
              <EmptyState
                v-if="groupsWithoutAdmin.length === 0"
                icon="mdi-shield-check-outline"
                title="Every group has an admin"
                message="A group left without an active admin appears here, because the data it owns then has nobody to govern it."
                :show-clear-filters="false"
                class="py-8"
              />
              <div v-else class="flex flex-col gap-2">
                <DashboardListRow
                  v-for="group in groupsMissingAdminRows"
                  :key="group.id"
                  :title="group.name"
                  :subtitle="groupSubtitle(group)"
                  :to="`/v2/groups/${group.id}`"
                >
                  <template #leading>
                    <GroupIcon :group="group" size="sm" />
                  </template>
                  <template #right>
                    <Badge v-if="group.is_archived" color="neutral">
                      Archived
                    </Badge>
                    <Badge color="warning">No admin</Badge>
                  </template>
                </DashboardListRow>
                <p
                  v-if="
                    groupsWithoutAdmin.length > groupsMissingAdminRows.length
                  "
                  class="text-xs va-text-secondary mt-1"
                >
                  {{
                    groupsWithoutAdmin.length - groupsMissingAdminRows.length
                  }}
                  more.
                </p>
              </div>
            </DashboardSection>

            <DashboardSection
              title="Recent activity"
              subtitle="Platform-wide audit events"
              to="/v2/audit-logs"
              link-label="Audit log →"
            >
              <EmptyState
                v-if="recentActivity.length === 0"
                icon="mdi-book-open-outline"
                title="No events recorded yet"
                message="Every material action lands here as it happens."
                :show-clear-filters="false"
                class="py-8"
              />
              <!--
                AuditLog lays its own message out across the full width and carries its
                own timestamp, so the row gives it the width and adds nothing beside it.
                A second column squeezed the message to one word per line.
              -->
              <div v-else class="flex flex-col">
                <div
                  v-for="record in recentActivity"
                  :key="record.id"
                  class="py-2 border-b border-solid border-gray-200 dark:border-gray-700 last:border-b-0"
                >
                  <AuditLog :record="record" class="text-sm" />
                </div>
              </div>
            </DashboardSection>
          </div>
        </template>

        <!--
          Governance sits above the personal sections for an admin, because the review
          queue is the thing that needs them today.
        -->
        <template v-if="isAdmin">
          <p
            class="-mb-4 text-xs font-semibold uppercase tracking-wider va-text-secondary"
          >
            Governance
          </p>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <DashboardSection
              title="Needs your review"
              subtitle="Oldest first"
              :count="pendingReviewTotal"
              count-color="warning"
              to="/v2/access-requests"
            >
              <EmptyState
                v-if="pendingReviews.length === 0"
                icon="mdi-check-circle-outline"
                title="Nothing waiting on you"
                message="Access requests on the data your groups own appear here."
                :show-clear-filters="false"
                class="py-8"
              />
              <div v-else class="flex flex-col gap-3">
                <AccessRequestCard
                  v-for="req in pendingReviews"
                  :key="req.id"
                  :request="req"
                  can-act
                  @view="viewRequest"
                  @review="viewRequest"
                />
              </div>
            </DashboardSection>

            <DashboardSection
              title="Grants expiring soon"
              :subtitle="`Within ${EXPIRY_WINDOW_DAYS} days, grouped by who holds them`"
              :count="expiringGrants.length"
              :count-color="expiringGrants.length > 0 ? 'warning' : 'neutral'"
            >
              <EmptyState
                v-if="expiringGrants.length === 0"
                icon="mdi-clock-check-outline"
                title="No grant lapses soon"
                message="A grant with an end date inside the window appears here, so access does not lapse unnoticed."
                :show-clear-filters="false"
                class="py-8"
              />
              <div v-else class="flex flex-col gap-2">
                <DashboardGrantRow
                  v-for="row in expiringRows"
                  :key="`${row.subject?.id}-${row.resource?.id}`"
                  :group="row"
                />
                <p
                  v-if="expiringGrants.length > expiringRows.length"
                  class="text-xs va-text-secondary mt-1"
                >
                  {{ expiringGrants.length - expiringRows.length }} more on the
                  resources you govern.
                </p>
              </div>
            </DashboardSection>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <!--
              Omitted rather than shown empty. A platform admin governs every group by
              role and is usually a member of none, so "you administer no groups" would
              be true of the membership table and false of what they can do.
            -->
            <DashboardSection
              v-if="governedGroups.length > 0"
              title="Groups I administer"
              subtitle="Oversight is read-only, and labelled as such"
              to="/v2/groups"
              link-label="All groups →"
            >
              <div class="flex flex-col gap-2">
                <DashboardListRow
                  v-for="group in governedGroups"
                  :key="group.id"
                  :title="group.name"
                  :subtitle="governedGroupSubtitle(group)"
                  :to="`/v2/groups/${group.id}`"
                >
                  <template #leading>
                    <GroupIcon :group="group" size="sm" />
                  </template>
                  <template #right>
                    <RoleBadge
                      v-if="group.user_role"
                      :role-name="group.user_role"
                    />
                  </template>
                </DashboardListRow>
              </div>
            </DashboardSection>

            <DashboardSection
              title="Datasets I govern"
              subtitle="Most recently updated"
              :count="ownedDatasets"
              to="/v2/datasets"
              link-label="View all →"
            >
              <EmptyState
                v-if="ownedRows.length === 0"
                icon="mdi-database-off-outline"
                title="Your groups own no datasets"
                message="A dataset gets its owning group when it is registered."
                :show-clear-filters="false"
                class="py-8"
              />
              <div v-else class="flex flex-col gap-2">
                <DashboardListRow
                  v-for="dataset in ownedRows"
                  :key="dataset.id"
                  :title="dataset.name"
                  :subtitle="datasetSubtitle(dataset)"
                  icon="mdi-database-outline"
                  :to="`/v2/datasets/${dataset.resource_id}`"
                >
                  <template #right>
                    <span class="text-xs va-text-secondary whitespace-nowrap">
                      {{ datetime.fromNowShort(dataset.updated_at) }}
                    </span>
                  </template>
                </DashboardListRow>
              </div>
            </DashboardSection>
          </div>

          <p
            class="-mb-4 text-xs font-semibold uppercase tracking-wider va-text-secondary"
          >
            Yours
          </p>
        </template>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <DashboardSection
            title="My access requests"
            subtitle="What you have asked for, and what came of it"
            to="/v2/access-requests?tab=mine"
          >
            <EmptyState
              v-if="myRequests.length === 0"
              icon="mdi-file-document-outline"
              title="You have not asked for anything yet"
              message="Open a dataset or collection you can see and use Request access. Your requests and their decisions appear here."
              :show-clear-filters="false"
              class="py-8"
            />
            <div v-else class="flex flex-col gap-3">
              <AccessRequestCard
                v-for="req in myRequests"
                :key="req.id"
                :request="req"
                @view="viewRequest"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="My groups"
            subtitle="How you reach each one"
            to="/v2/groups"
            link-label="Browse groups →"
          >
            <EmptyState
              v-if="myGroups.length === 0"
              icon="mdi-account-group-outline"
              title="You are not in any group"
              message="A group admin adds you, or invites you by email. Groups are how a lab's data reaches its people without a grant each time."
              :show-clear-filters="false"
              class="py-8"
            />
            <div v-else class="flex flex-col gap-2">
              <DashboardListRow
                v-for="group in myGroups"
                :key="group.id"
                :title="group.name"
                :subtitle="groupSubtitle(group)"
                :to="`/v2/groups/${group.id}`"
              >
                <template #leading>
                  <GroupIcon :group="group" size="sm" />
                </template>
                <template #right>
                  <RoleBadge
                    v-if="group.user_role"
                    :role-name="group.user_role"
                  />
                </template>
              </DashboardListRow>

              <!--
                Membership flows upward, so a member of a lab is a member of the
                center above it. Nobody guesses that from a list of two names.
                @see docs/design/groups/design.md - Layer 2: Group Membership Transitivity
              -->
              <p
                v-if="hasTransitiveMembership"
                class="text-xs va-text-secondary mt-1"
              >
                Membership of a group also makes you a member of every group
                above it. Membership alone does not grant access to data; a
                grant does.
              </p>
            </div>
          </DashboardSection>
        </div>

        <DashboardSection
          title="Datasets I can reach"
          subtitle="Through a grant to you, to a group you belong to, or to a collection"
          :count="reachableDatasets"
          to="/v2/datasets"
          link-label="Browse datasets →"
        >
          <EmptyState
            v-if="reachableRows.length === 0"
            icon="mdi-database-off-outline"
            title="No data has been shared with you"
            message="Datasets you can read appear here. Ask an admin of the owning group for access to one you need."
            :show-clear-filters="false"
            class="py-8"
          />
          <div v-else class="flex flex-col gap-2">
            <DashboardListRow
              v-for="dataset in reachableRows"
              :key="dataset.id"
              :title="dataset.name"
              :subtitle="datasetSubtitle(dataset)"
              icon="mdi-database-outline"
              :to="`/v2/datasets/${dataset.resource_id}`"
            >
              <template #right>
                <span class="text-xs va-text-secondary whitespace-nowrap">
                  {{ datetime.fromNowShort(dataset.updated_at) }}
                </span>
              </template>
            </DashboardListRow>
          </div>

          <!--
            Saying which grant carried the access costs one coverage call per row. The
            dataset's own Access tab answers it properly.
          -->
          <p class="text-xs va-text-secondary mt-3">
            A row names the owning group. The dataset's Access tab says which
            grant carried the access.
          </p>
        </DashboardSection>
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
import AccessRequestCard from "@/components/v2/access-requests/AccessRequestCard.vue";
import GroupIcon from "@/components/v2/groups/GroupIcon.vue";
import * as datetime from "@/services/datetime";
import AccessRequestService from "@/services/v2/access-requests";
import AuditLogsService from "@/services/v2/audit-logs";
import CollectionService from "@/services/v2/collections";
import DatasetService from "@/services/v2/datasets";
import GrantsService from "@/services/v2/grants";
import GroupService from "@/services/v2/groups";
import { formatBytes, maybePluralize } from "@/services/utils";
import { useUIPersonaStore } from "@/stores/v2/uiPersona";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const persona = useUIPersonaStore();

/** How many days ahead the expiring-grants query looks. */
const EXPIRY_WINDOW_DAYS = 30;

/**
 * Rows in a dashboard panel. The panel is a summary with a link to the page that holds
 * the rest, so a longer list only makes the page harder to scan.
 */
const PANEL_ROWS = 5;

const firstName = computed(() => {
  const name = auth.user?.name || "";
  return name.split(" ")[0] || name;
});

// ── State, one entry per query ───────────────────────────────────────────────

const settled = ref(false);
const failures = ref([]);

const reachableDatasets = ref(null);
const reachableRows = ref([]);
const myGroupsTotal = ref(null);
const myGroups = ref([]);
const myOpenRequests = ref(null);
const myRequests = ref([]);

const pendingReviewTotal = ref(null);
const pendingReviews = ref([]);
const ownedDatasets = ref(null);
const ownedRows = ref([]);
const administeredGroups = ref(null);
const oversightGroups = ref(null);
const governedGroups = ref([]);
const expiringGrants = ref([]);

const recentActivity = ref([]);
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
      const response = await DatasetService.search({
        scope: "grants",
        limit: PANEL_ROWS,
        sort_by: "updated_at",
        sort_order: "desc",
        include_owner_group: true,
      });
      reachableDatasets.value = totalOf(response);
      reachableRows.value = response.data?.data ?? [];
    }),
    attempt("Your groups", async () => {
      const response = await GroupService.search({
        scope: "all",
        limit: PANEL_ROWS,
        sort_by: "depth",
        sort_order: "asc",
      });
      myGroupsTotal.value = totalOf(response);
      myGroups.value = response.data?.data ?? [];
    }),
    attempt("Your access requests", async () => {
      // Two calls on purpose. The panel shows the most recent few whatever their state,
      // and the stat card counts every open one, which a page of five would under-report.
      const [recent, open] = await Promise.all([
        AccessRequestService.requestedByMe({
          limit: PANEL_ROWS,
          sort_by: "created_at",
          sort_order: "desc",
        }),
        AccessRequestService.requestedByMe({
          status: "UNDER_REVIEW",
          limit: 0,
        }),
      ]);
      myRequests.value = recent.data?.data ?? [];
      myOpenRequests.value = totalOf(open);
    }),
  ];

  if (isAdmin.value) {
    calls.push(
      // Oldest first, because a request that has waited longest is the one blocking
      // somebody's work.
      attempt("Requests needing your review", async () => {
        const response = await AccessRequestService.pendingReview({
          limit: PANEL_ROWS,
          sort_by: "created_at",
          sort_order: "asc",
        });
        pendingReviewTotal.value = totalOf(response);
        pendingReviews.value = response.data?.data ?? [];
      }),
      attempt("Datasets you govern", async () => {
        const response = await DatasetService.search({
          scope: "ownership",
          limit: PANEL_ROWS,
          sort_by: "updated_at",
          sort_order: "desc",
          include_owner_group: true,
        });
        ownedDatasets.value = totalOf(response);
        ownedRows.value = response.data?.data ?? [];
      }),
      // Two scopes, because an admin and an overseer are told apart in the hero and in
      // the panel, and one search cannot return both counts.
      attempt("Groups you administer", async () => {
        const [admin, oversight] = await Promise.all([
          GroupService.search({
            scope: "admin",
            limit: PANEL_ROWS,
            sort_by: "depth",
            sort_order: "asc",
          }),
          GroupService.search({ scope: "oversight", limit: PANEL_ROWS }),
        ]);
        administeredGroups.value = totalOf(admin);
        oversightGroups.value = totalOf(oversight);
        governedGroups.value = [
          ...(admin.data?.data ?? []),
          ...(oversight.data?.data ?? []),
        ].slice(0, PANEL_ROWS);
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
      // Platform admin only, by design: these records span the whole platform.
      // @see docs/design/groups/use-cases.md - 57
      attempt("Recent activity", async () => {
        const { data } = await AuditLogsService.getAuditRecords({
          limit: PANEL_ROWS,
          sortBy: "timestamp",
          sortOrder: "desc",
        });
        recentActivity.value = data ?? [];
      }),
    );
  }

  await Promise.all(calls);
  settled.value = true;
}

// ── Presentation ─────────────────────────────────────────────────────────────

const isAdmin = computed(() => persona.isGroupAdmin || persona.isPlatformAdmin);

const router = useRouter();

function viewRequest(request) {
  router.push(`/v2/access-requests/${request.id}`).catch(() => {});
}

function groupSubtitle(group) {
  const parts = [];
  if (group.metadata?.type) parts.push(group.metadata.type);
  if (group.size != null) {
    parts.push(maybePluralize(Number(group.size), "member"));
  }
  if (group.is_archived) parts.push("archived");
  return parts.join(" · ");
}

function datasetSubtitle(dataset) {
  const parts = [];
  if (dataset.owner_group?.name) parts.push(dataset.owner_group.name);
  if (dataset.type) parts.push(dataset.type);
  if (dataset.size) parts.push(formatBytes(dataset.size));
  return parts.join(" · ");
}

/**
 * An admin row says what the caller governs there; an oversight row says plainly that
 * they cannot act, because the badge alone reads as authority.
 */
function governedGroupSubtitle(group) {
  if (group.user_role === "OVERSIGHT") {
    return "read-only — you can see this group, and cannot act on it";
  }
  return groupSubtitle(group);
}

const expiringRows = computed(() => expiringGrants.value.slice(0, PANEL_ROWS));

const groupsMissingAdminRows = computed(() =>
  groupsWithoutAdmin.value.slice(0, PANEL_ROWS),
);

const heroMeta = computed(() => {
  if (!isAdmin.value) return [];
  const parts = [];
  if (administeredGroups.value) {
    parts.push(`Admin of ${maybePluralize(administeredGroups.value, "group")}`);
  }
  if (oversightGroups.value) {
    parts.push(
      `Oversight of ${maybePluralize(oversightGroups.value, "group")}, read-only`,
    );
  }
  return parts;
});

const hasTransitiveMembership = computed(() =>
  myGroups.value.some((g) => g.user_role === "TRANSITIVE_MEMBER"),
);

/**
 * A caller who reaches nothing and belongs to nowhere. This is the state the portal
 * explains worst on its own, because every list page is simply empty.
 *
 * An admin is excluded: their governance sections are full, so the portal is plainly
 * not broken for them.
 */
const hasNoAccessAtAll = computed(
  () =>
    !isAdmin.value &&
    reachableDatasets.value === 0 &&
    myGroupsTotal.value === 0,
);

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
