<template>
  <VaCard>
    <VaCardContent>
      <div class="flex items-center gap-2">
        <Icon :icon="props.icon" class="text-lg" :style="{ color: iconColor }" />
        <div>
          <p class="text-xs font-medium uppercase tracking-wide" style="color: var(--va-secondary)">
            {{ props.label }}
          </p>
          <p class="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none mt-0.5">
            {{ props.count }}
          </p>
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import { useColors } from 'vuestic-ui';

const props = defineProps({
  label: { type: String, required: true },
  count: { type: Number, default: 0 },
  /** MDI icon name */
  icon: { type: String, required: true },
  /** Vuestic color key */
  color: { type: String, default: 'primary' },
})

const colors = useColors()
const iconColor = computed(() => colors[props.color] ?? colors.primary)
</script>
