<template>
  <VaModal
    v-model="visible"
    :title="`Edit ${props.kind} profile`"
    size="large"
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
      <div class="flex flex-col gap-6 text-sm">
        <!-- Visibility comes first: it decides who the rest of this form is written for. -->
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold uppercase tracking-wide">
            Who can see this profile
          </label>
          <VaOptionList
            v-model="form.profile_visibility"
            type="radio"
            :options="VISIBILITY_OPTIONS"
            value-by="value"
            text-by="label"
          />
          <p class="text-xs" style="color: var(--va-secondary)">
            {{ visibilityHint }}
          </p>
        </div>

        <!-- Profile picture — groups only; a collection is identified by its owner. -->
        <div v-if="props.kind === 'group'" class="flex flex-col gap-2">
          <label class="text-xs font-semibold uppercase tracking-wide">
            Profile picture
          </label>
          <div class="flex items-center gap-4">
            <ProfileAvatar
              :name="props.name"
              :avatar-url="previewAvatarUrl"
              :size="56"
            />
            <div class="flex items-center gap-2">
              <VaButton preset="secondary" size="small" @click="pickFile">
                {{
                  props.avatarKey || pendingAvatarFile ? "Replace" : "Upload"
                }}
              </VaButton>
              <VaButton
                v-if="props.avatarKey || pendingAvatarFile"
                preset="secondary"
                color="danger"
                size="small"
                @click="removeAvatar"
              >
                Remove
              </VaButton>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              class="hidden"
              aria-label="Profile picture file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              @change="onFileChosen"
            />
          </div>
          <p class="text-xs" style="color: var(--va-secondary)">
            PNG, JPG, WebP, or SVG, up to 2 MB. Falls back to a monogram.
          </p>
        </div>

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
            One plain line under the name. Shown on cards and in search results.
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
            :min-rows="8"
            :max-rows="16"
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

        <!-- Links -->
        <div class="flex flex-col gap-2">
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
            <VaButton
              preset="secondary"
              color="danger"
              size="small"
              icon="close"
              @click="form.links.splice(i, 1)"
            />
          </div>
          <p
            v-if="!form.links.length"
            class="text-xs"
            style="color: var(--va-secondary)"
          >
            No links yet.
          </p>
        </div>

        <!-- Citation -->
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
            Leave blank and Bioloop generates this line from the name, the year,
            and the public URL.
          </p>
        </div>

        <!-- Publications -->
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
            <VaButton
              preset="secondary"
              color="danger"
              size="small"
              icon="close"
              @click="form.publications.splice(i, 1)"
            />
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
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import ProfileAboutBody from "@/components/v2/profiles/ProfileAboutBody.vue";
import ProfileAvatar from "@/components/v2/profiles/ProfileAvatar.vue";
import toast from "@/services/toast";
import ProfileService from "@/services/v2/profiles";

/**
 * The one form that writes a profile, for a group or for a collection.
 *
 * Visibility is the first field because it decides who everything below it is written
 * for. The picture is a separate endpoint from the rest, so a save here is up to three
 * requests: the profile PATCH, and an avatar upload or delete.
 *
 * The API is the authority on every rule this form applies. The limits repeated here exist
 * to say "no" before a round trip, not instead of the server's check.
 *
 * @see docs/design/groups/profiles.md — API
 */

const props = defineProps({
  /** "group" or "collection" — decides the endpoint and whether a picture is offered. */
  kind: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, default: "" },
  version: { type: Number, required: true },
  tagline: { type: String, default: null },
  aboutMd: { type: String, default: null },
  profileVisibility: { type: String, default: "PRIVATE" },
  /** The `metadata` object as the API returned it. */
  metadata: { type: Object, default: () => ({}) },
  avatarKey: { type: String, default: null },
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
const aboutTab = ref("write");
const fileInputRef = ref(null);
const pendingAvatarFile = ref(null);
const pendingAvatarUrl = ref(null);
const avatarCleared = ref(false);

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

/** What the picture looks like right now, including a file chosen but not yet uploaded. */
const previewAvatarUrl = computed(() => {
  if (avatarCleared.value) return null;
  if (pendingAvatarUrl.value) return pendingAvatarUrl.value;
  return ProfileService.groupAvatarUrl(props.id, props.avatarKey);
});

const hasChanges = computed(
  () =>
    JSON.stringify(form.value) !== baseline.value ||
    !!pendingAvatarFile.value ||
    avatarCleared.value,
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
  aboutTab.value = "write";
  discardPendingAvatar();
  visible.value = true;
}

function hide() {
  discardPendingAvatar();
  visible.value = false;
}

function discardPendingAvatar() {
  if (pendingAvatarUrl.value) URL.revokeObjectURL(pendingAvatarUrl.value);
  pendingAvatarUrl.value = null;
  pendingAvatarFile.value = null;
  avatarCleared.value = false;
}

function pickFile() {
  fileInputRef.value?.click();
}

function onFileChosen(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (pendingAvatarUrl.value) URL.revokeObjectURL(pendingAvatarUrl.value);
  pendingAvatarFile.value = file;
  pendingAvatarUrl.value = URL.createObjectURL(file);
  avatarCleared.value = false;
}

function removeAvatar() {
  discardPendingAvatar();
  avatarCleared.value = true;
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

    if (props.kind === "group") {
      if (pendingAvatarFile.value) {
        await ProfileService.uploadGroupAvatar(
          props.id,
          pendingAvatarFile.value,
        );
      } else if (avatarCleared.value && props.avatarKey) {
        await ProfileService.deleteGroupAvatar(props.id);
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

onUnmounted(discardPendingAvatar);
</script>
