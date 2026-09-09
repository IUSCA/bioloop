<template>
  <div v-if="html" class="profile-prose text-sm" v-html="html"></div>
</template>

<script setup>
// cspell:ignore commonmark dompurify markdownit
import DOMPurify from "dompurify";
import markdownit from "markdown-it";

/**
 * Rendered Markdown, with no card around it.
 *
 * `html: false` is deliberate. This text is written by a group admin and rendered to
 * readers who are not signed in, so raw HTML buys a formatting option nobody asked for at
 * the cost of a surface worth defending. DOMPurify still runs, because two independent
 * checks cost nothing here.
 *
 * Kept separate from `ProfileAbout.vue` so the edit form's preview renders through exactly
 * the same code as the page — a preview that differs from the result is worse than none.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
const props = defineProps({
  /** Markdown source. Null or empty renders nothing at all. */
  aboutMd: { type: String, default: "" },
});

const md = markdownit("commonmark", {
  html: false,
  linkify: true,
  typographer: true,
});

const html = computed(() => {
  const source = props.aboutMd?.trim();
  if (!source) return "";
  return DOMPurify.sanitize(md.render(source), { ADD_ATTR: ["target", "rel"] });
});
</script>

<style scoped>
/*
 * The repository has no typography plugin, so the handful of elements Markdown can produce
 * are styled here rather than pulled in as a dependency.
 */
.profile-prose :deep(p) {
  margin-bottom: 0.75rem;
  line-height: 1.6;
}

.profile-prose :deep(p:last-child) {
  margin-bottom: 0;
}

.profile-prose :deep(h1),
.profile-prose :deep(h2),
.profile-prose :deep(h3) {
  font-size: 0.875rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.375rem;
}

.profile-prose :deep(ul),
.profile-prose :deep(ol) {
  padding-left: 1.25rem;
  margin-bottom: 0.75rem;
  list-style: revert;
}

.profile-prose :deep(li) {
  margin-bottom: 0.25rem;
}

.profile-prose :deep(a) {
  color: var(--va-primary);
  text-decoration: underline;
}

.profile-prose :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
}

.profile-prose :deep(blockquote) {
  border-left: 3px solid var(--va-background-border);
  padding-left: 0.75rem;
  color: var(--va-secondary);
}
</style>
