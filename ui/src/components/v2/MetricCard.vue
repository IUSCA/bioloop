<template>
  <VaCard>
    <VaCardContent>
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg" :class="iconBg">
          <Icon :icon="props.icon" class="text-2xl" :style="{ color: iconColor }" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium uppercase tracking-wide" style="color: var(--va-secondary)">
            {{ props.label }}
          </p>
          <VaSkeleton v-if="props.loading" variant="text" height="28px" width="60px" class="mt-1" />
          <p v-else class="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none mt-1">
            {{ props.value ?? '—' }}
          </p>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import { useColors } from 'vuestic-ui'

const props = defineProps({
  label: { type: String, required: true },
  /** Numeric or string value to display. Use `null` to show "—". */
  value: { type: [Number, String], default: null },
  loading: { type: Boolean, default: false },
  /** MDI icon name, e.g. "mdi-database-outline" */
  icon: { type: String, required: true },
  /** Vuestic color key: "primary", "success", "info", "warning", "danger", "secondary" */
  color: { type: String, default: 'primary' },
})

const colors = useColors()

const iconColor = computed(() => colors[props.color] ?? colors.primary)

const iconBgMap = {
  primary: 'bg-blue-50 dark:bg-blue-900/30',
  success: 'bg-green-50 dark:bg-green-900/30',
  info: 'bg-sky-50 dark:bg-sky-900/30',
  warning: 'bg-amber-50 dark:bg-amber-900/30',
  danger: 'bg-red-50 dark:bg-red-900/30',
  secondary: 'bg-gray-100 dark:bg-gray-800',
}

const iconBg = computed(() => iconBgMap[props.color] ?? iconBgMap.primary)
</script>
