<template>
  <VaModal
    v-model="visible"
    :title="`Edit ${props.kind} profile`"
    size="large"
    class="edit-profile-modal"
    hide-default-actions
    @cancel="hide"
  >
    <template #footer>
      <div class="flex items-center gap-5 justify-end mt-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton :loading="saving" :disabled="!hasChanges" @click="save">
          Save changes
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="saving">
      <div class="flex flex-col gap-4 text-sm">
        <!--
          Visibility sits above the tabs rather than inside one, because it decides who
          everything below it is written for. A tab would hide that decision behind a click.
        -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label class="text-xs font-semibold uppercase tracking-wide">
            Who can see this profile
          </label>
          <VaButtonToggle
            v-model="form.profile_visibility"
            size="small"
            preset="secondary"
            :options="VISIBILITY_OPTIONS"
            value-by="value"
          />
          <p class="text-xs basis-full" style="color: var(--va-secondary)">
            {{ visibilityHint }}
          </p>
        </div>

        <VaTabs
          v-model="activeTab"
          class="border-b border-solid border-blue-500/50"
        >
          <template #tabs>
            <VaTab name="profile">Profile</VaTab>
            <VaTab name="links">
              <span class="flex items-center gap-1.5">
                Links
                <span v-if="form.links.length" class="tab-count-badge">
                  {{ form.links.length }}
                </span>
              </span>
            </VaTab>
            <VaTab name="citation">
              <span class="flex items-center gap-1.5">
                Citation
                <span v-if="form.publications.length" class="tab-count-badge">
                  {{ form.publications.length }}
                </span>
              </span>
            </VaTab>
          </template>
        </VaTabs>

        <!--
          One floor for every panel, so switching tabs does not resize the modal under the
          pointer. The tallest panel is Profile with the About editor at its minimum rows.
        -->
        <div class="min-h-[380px]">
          <!-- Profile: the one line under the name, and the body. -->
          <div v-if="activeTab === 'profile'" class="flex flex-col gap-5">
            <!-- Tagline -->
            <div class="flex flex-col gap-1.5">
              <VaInput
                v-model="form.tagline"
                label="Tagline"
                outline
                :max-length="TAGLINE_MAX"
                counter
                :rules="taglineRules"
              />
              <p class="text-xs" style="color: var(--va-secondary)">
                One plain line under the name. Shown on cards and in search
                results.
              </p>
            </div>

            <!-- About, with a preview, because Markdown that renders wrong is worse than none -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold uppercase tracking-wide">
                  About
                </label>
                <VaButtonToggle
                  v-model="aboutTab"
                  size="small"
                  preset="secondary"
                  :options="[
                    { label: 'Write', value: 'write' },
                    { label: 'Preview', value: 'preview' },
                  ]"
                  value-by="value"
                />
              </div>
              <VaTextarea
                v-if="aboutTab === 'write'"
                v-model="form.about_md"
                outline
                :min-rows="6"
                :max-rows="12"
                placeholder="Markdown. Headings, lists, and links."
              />
              <div
                v-else
                class="rounded-md border border-solid border-gray-200 dark:border-gray-700 px-3 py-3 min-h-[180px]"
              >
                <ProfileAboutBody :about-md="form.about_md" />
                <p
                  v-if="!form.about_md?.trim()"
                  class="text-xs"
                  style="color: var(--va-secondary)"
                >
                  Nothing to preview yet.
                </p>
              </div>
            </div>
          </div>

          <!-- Links: where else this group or collection can be found. -->
          <div v-else-if="activeTab === 'links'" class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold uppercase tracking-wide">
                External links
              </label>
              <VaButton
                preset="secondary"
                size="small"
                :disabled="form.links.length >= LINKS_MAX"
                @click="addLink"
              >
                Add link
              </VaButton>
            </div>
            <div
              v-for="(link, i) in form.links"
              :key="`link-${i}`"
              class="flex items-start gap-2"
            >
              <VaSelect
                v-model="link.type"
                class="w-44 shrink-0"
                outline
                :options="LINK_TYPE_OPTIONS"
                value-by="value"
                text-by="label"
              />
              <VaInput
                v-model="link.url"
                class="flex-1"
                outline
                :placeholder="
                  link.type === 'contact_email'
                    ? 'name@example.edu'
                    : 'https://example.edu'
                "
              />
              <VaInput
                v-model="link.label"
                class="w-40 shrink-0"
                outline
                placeholder="Label"
              />
              <!--
                The row stays `items-start` so a validation message under an input cannot
                push the button down. `h-9` is the input's own height, which is what the
                button has to centre against.
              -->
              <div class="flex items-center h-9 shrink-0">
                <VaButton
                  preset="secondary"
                  color="danger"
                  size="small"
                  icon="close"
                  aria-label="Remove this link"
                  @click="form.links.splice(i, 1)"
                />
              </div>
            </div>
            <p
              v-if="!form.links.length"
              class="text-xs"
              style="color: var(--va-secondary)"
            >
              No links yet.
            </p>
          </div>

          <!-- Citation: how to cite this, and what has already been published from it. -->
          <div v-else-if="activeTab === 'citation'" class="flex flex-col gap-5">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold uppercase tracking-wide">
                  Preferred citation
                </label>
                <VaButton
                  preset="secondary"
                  size="small"
                  :disabled="!form.citation"
                  @click="form.citation = ''"
                >
                  Reset to default
                </VaButton>
              </div>
              <VaTextarea v-model="form.citation" outline :min-rows="2" />
              <p class="text-xs" style="color: var(--va-secondary)">
                Leave blank and Bioloop generates this line from the name, the
                year, and the public URL.
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold uppercase tracking-wide">
                  Related publications
                </label>
                <VaButton
                  preset="secondary"
                  size="small"
                  :disabled="form.publications.length >= PUBLICATIONS_MAX"
                  @click="addPublication"
                >
                  Add DOI
                </VaButton>
              </div>
              <div
                v-for="(pub, i) in form.publications"
                :key="`pub-${i}`"
                class="flex items-start gap-2"
              >
                <VaInput
                  v-model="pub.doi"
                  class="w-56 shrink-0"
                  outline
                  placeholder="10.1038/s41477-026-01847-2"
                  :rules="doiRules"
                />
                <VaInput
                  v-model="pub.title"
                  class="flex-1"
                  outline
                  placeholder="Title"
                />
                <VaInput
                  v-model="pub.container"
                  class="w-40 shrink-0"
                  outline
                  placeholder="Journal"
                />
                <VaInput
                  v-model="pub.year"
                  class="w-24 shrink-0"
                  outline
                  placeholder="Year"
                />
                <div class="flex items-center h-9 shrink-0">
                  <VaButton
                    preset="secondary"
                    color="danger"
                    size="small"
                    icon="close"
                    aria-label="Remove this publication"
                    @click="form.publications.splice(i, 1)"
                  />
                </div>
              </div>
              <p
                v-if="!form.publications.length"
                class="text-xs"
                style="color: var(--va-secondary)"
              >
                No publications yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import ProfileAboutBody from "@/components/v2/profiles/ProfileAboutBody.vue";
import toast from "@/services/toast";
import ProfileService from "@/services/v2/profiles";

/**
 * The one form that writes a profile, for a group or for a collection.
 *
 * The fields are split across three panels — Profile, Links, and Citation — because the
 * full form is taller than a screen. Visibility stays above the panels, because it decides
 * who everything below it is written for.
 *
 * Every panel writes into one `form` object and one save button submits all of them, so a
 * hidden panel is still part of the payload. One PATCH saves the lot.
 *
 * The API is the authority on every rule this form applies. The limits repeated here exist
 * to say "no" before a round trip, not instead of the server's check.
 *
 * @see docs/design/groups/profiles.md — The columns
 */

const props = defineProps({
  /** "group" or "collection" — decides which endpoint the save goes to. */
  kind: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, default: "" },
  version: { type: Number, required: true },
  tagline: { type: String, default: null },
  aboutMd: { type: String, default: null },
  profileVisibility: { type: String, default: "PRIVATE" },
  /** The `metadata` object as the API returned it. */
  metadata: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["update"]);
defineExpose({ show, hide });

const TAGLINE_MAX = 120;
const LINKS_MAX = 10;
const PUBLICATIONS_MAX = 20;
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "Members only" },
  { value: "AUTHENTICATED", label: "Signed-in users" },
  { value: "PUBLIC", label: "Anyone on the web" },
];

const LINK_TYPE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "ror", label: "Organization (ROR)" },
  { value: "protocols", label: "Protocols" },
  { value: "contact_email", label: "Contact email" },
  { value: "other", label: "Other" },
];

const VISIBILITY_HINTS = {
  PRIVATE: "Only members and admins can open this profile.",
  AUTHENTICATED: "Any signed-in Bioloop user can open this profile.",
  PUBLIC: "Anyone with the link can open this profile without signing in.",
};

const visible = ref(false);
const saving = ref(false);
/** Which panel of the form is showing. Reset on every open, so a reopen starts at Profile. */
const activeTab = ref("profile");
const aboutTab = ref("write");

const form = ref(blankForm());
const baseline = ref("");

const taglineRules = [
  (v) => !v || v.length <= TAGLINE_MAX || `At most ${TAGLINE_MAX} characters`,
];

const doiRules = [
  (v) => !v || DOI_PATTERN.test(v.trim()) || "Not a DOI (starts with 10.)",
];

const visibilityHint = computed(
  () => VISIBILITY_HINTS[form.value.profile_visibility] ?? "",
);

function blankForm() {
  return {
    profile_visibility: "PRIVATE",
    tagline: "",
    about_md: "",
    citation: "",
    links: [],
    publications: [],
  };
}

const hasChanges = computed(
  () => JSON.stringify(form.value) !== baseline.value,
);

function show() {
  form.value = {
    profile_visibility: props.profileVisibility ?? "PRIVATE",
    tagline: props.tagline ?? "",
    about_md: props.aboutMd ?? "",
    citation: props.metadata?.citation ?? "",
    links: (props.metadata?.links ?? []).map((l) => ({
      type: l.type ?? "website",
      url: l.url ?? "",
      label: l.label ?? "",
    })),
    publications: (props.metadata?.publications ?? []).map((p) => ({
      doi: p.doi ?? "",
      title: p.title ?? "",
      container: p.container ?? "",
      year: p.year != null ? String(p.year) : "",
    })),
  };
  baseline.value = JSON.stringify(form.value);
  activeTab.value = "profile";
  aboutTab.value = "write";
  visible.value = true;
}

function hide() {
  visible.value = false;
}

function addLink() {
  form.value.links.push({ type: "website", url: "", label: "" });
}

function addPublication() {
  form.value.publications.push({
    doi: "",
    title: "",
    container: "",
    year: "",
  });
}

/** An empty string means "clear this field", which the API spells as null. */
function orNull(value) {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The profile fields that changed, in the shape the API takes.
 *
 * Lists are sent whole rather than as a patch, because a partial list cannot express the
 * removal of an entry.
 */
function buildPayload() {
  const before = JSON.parse(baseline.value);
  const now = form.value;
  const payload = {};

  if (now.profile_visibility !== before.profile_visibility) {
    payload.profile_visibility = now.profile_visibility;
  }
  if (now.tagline !== before.tagline) payload.tagline = orNull(now.tagline);
  if (now.about_md !== before.about_md) payload.about_md = orNull(now.about_md);
  if (now.citation !== before.citation) payload.citation = orNull(now.citation);

  if (JSON.stringify(now.links) !== JSON.stringify(before.links)) {
    payload.links = now.links
      .filter((l) => l.url.trim())
      .map((l) => ({
        type: l.type,
        url: l.url.trim(),
        ...(l.label.trim() ? { label: l.label.trim() } : {}),
      }));
  }

  if (
    JSON.stringify(now.publications) !== JSON.stringify(before.publications)
  ) {
    payload.publications = now.publications
      .filter((p) => p.doi.trim())
      .map((p) => ({
        doi: p.doi.trim(),
        ...(p.title.trim() ? { title: p.title.trim() } : {}),
        ...(p.container.trim() ? { container: p.container.trim() } : {}),
        ...(p.year.trim() ? { year: Number(p.year.trim()) } : {}),
      }));
  }

  return payload;
}

async function save() {
  saving.value = true;
  try {
    const payload = buildPayload();
    if (Object.keys(payload).length > 0) {
      if (props.kind === "group") {
        await ProfileService.updateGroup(props.id, payload, props.version);
      } else {
        await ProfileService.updateCollection(props.id, payload, props.version);
      }
    }

    hide();
    toast.success("Profile updated.");
    emit("update");
  } catch (err) {
    toast.error(
      err?.response?.data?.message ??
        "Failed to update the profile. Please try again.",
    );
  } finally {
    saving.value = false;
  }
}
</script>

<style>
/*
 * Vuestic's 1.5rem side gutters leave the outlined inputs almost touching the modal edge at
 * `size="large"`. Not scoped, because the modal teleports to `body`.
 *
 * The shorthand has to be restated. `--va-modal-padding` is declared on `:root` as four
 * `var()` references, and a custom property's own `var()`s are substituted where it is
 * declared, so by the time it inherits down here it is already the literal `1.5rem` on every
 * side. Overriding only the per-side variables changes the fixed-layout rules and nothing
 * else. Top and bottom stay as `var()` so the theme still owns them.
 */
.edit-profile-modal {
  --va-modal-padding-left: 2.5rem;
  --va-modal-padding-right: 2.5rem;
  --va-modal-padding: var(--va-modal-padding-top) 2.5rem
    var(--va-modal-padding-bottom) 2.5rem;
}
</style>
