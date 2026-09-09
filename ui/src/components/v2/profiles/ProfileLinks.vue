<template>
  <VaCard v-if="links.length">
    <VaCardContent>
      <h2 class="text-sm font-semibold mb-1">LINKS</h2>
      <div class="flex flex-col">
        <a
          v-for="(link, i) in links"
          :key="i"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-2.5 py-2.5 border-0 border-t border-solid border-gray-100 dark:border-gray-800 hover:opacity-80"
        >
          <Icon
            :icon="link.icon"
            class="text-base shrink-0"
            style="color: var(--va-secondary)"
          />
          <span class="flex flex-col gap-px min-w-0">
            <span class="text-[13px] font-medium">{{ link.label }}</span>
            <span
              class="text-xs truncate"
              :class="{ 'font-mono': link.type === 'ror' }"
              style="color: var(--va-secondary)"
            >
              {{ link.display }}
            </span>
          </span>
        </a>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The typed links on a profile.
 *
 * The API validates that every URL is http or https, or an email address for
 * `contact_email`, so this component renders what it is given without re-checking. It does
 * decide how to display one: a website shows its host, an email address shows itself.
 *
 * @see docs/design/groups/profiles.md — Schema
 */
const props = defineProps({
  /** [{ type, url, label? }] — the validated shape the API stores. */
  links: { type: Array, default: () => [] },
});

const TYPES = {
  website: { label: "Website", icon: "mdi-web" },
  ror: { label: "Organization (ROR)", icon: "mdi-office-building-outline" },
  protocols: { label: "Protocols", icon: "mdi-flask-outline" },
  contact_email: { label: "Contact", icon: "mdi-email-outline" },
  other: { label: "Link", icon: "mdi-link-variant" },
};

/** The part of a URL worth showing: the host and path, without the scheme. */
function display(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

const links = computed(() =>
  (props.links ?? []).map((link) => {
    const type = TYPES[link.type] ?? TYPES.other;
    const isEmail = link.type === "contact_email";
    return {
      type: link.type,
      href: isEmail ? `mailto:${link.url}` : link.url,
      label: link.label || type.label,
      display: isEmail ? link.url : display(link.url),
      icon: type.icon,
    };
  }),
);
</script>
