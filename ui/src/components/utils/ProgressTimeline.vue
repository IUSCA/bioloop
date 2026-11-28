<template>
  <div class="flex flex-col pl-6 md:pl-3" role="list">
    <div
      v-for="(item, index) in props.items"
      :key="index"
      class="flex space-x-3 items-stretch h-[75px] overflow-hidden"
      role="listitem"
      :aria-label="`Step ${index + 1}: ${item.label}`"
    >
      <!-- Marker + Vertical segment -->
      <div class="flex flex-col items-center h-full">
        <div class="relative flex items-center justify-center w-5 h-5">
          <!-- Node -->
          <div
            :class="[
              'rounded-full flex items-center justify-center',
              item.color || getColorClass(item.status),
              item.status === 'current'
                ? 'border border-gray-200 dark:border-gray-300 border-solid w-5 h-5 '
                : 'w-4 h-4',
            ]"
          ></div>
        </div>

        <!-- Vertical segment below (except for last item) -->
        <div
          v-if="index < items.length - 1"
          :class="[
            'w-0.5 flex-1',
            item.connectorColor ||
              getConnectorColorClass(item.status) ||
              'bg-gray-300 dark:bg-gray-600',
          ]"
        ></div>
      </div>

      <!-- Text Content -->
      <slot name="content" :item="item">
        <div class="flex flex-col mt-[-0.2rem]">
          <div class="font-semibold text-sm md:text-base">
            {{ item.label }}
          </div>
          <div class="text-xs md:text-sm text-gray-500 dark:text-gray-400">
            {{ item.description }}
          </div>
        </div>
      </slot>
    </div>
  </div>
</template>

<script setup>
// {
//   label: string;
//   description?: string;
//   status: "completed" | "current" | "upcoming" | "terminated";
//   color?: string;
//   connectorColor?: string;
// }
const props = defineProps({
  items: {
    type: Array,
    required: true,
    validator: (items) =>
      items.every(
        (item) =>
          typeof item.label === "string" &&
          (typeof item.description === "string" ||
            item.description === undefined) &&
          ["completed", "current", "upcoming", "terminated"].includes(
            item.status,
          ) &&
          (item.color === undefined || typeof item.color === "string") &&
          (item.connectorColor === undefined ||
            typeof item.connectorColor === "string"),
      ),
    default: () => [],
  },
});

function getColorClass(status) {
  // "completed" | "current" | "upcoming" | "terminated"
  switch (status) {
    case "completed":
      return "bg-green-600";
    case "current":
      return "bg-blue-500";
    case "upcoming":
      return "bg-gray-300 dark:bg-gray-600";
    case "terminated":
      return "bg-red-600";
    default:
      return "bg-gray-300 dark:bg-gray-600";
  }
}

function getConnectorColorClass(status) {
  if (status === "terminated" || status === "current") {
    return getColorClass(); // Default color for terminated and current
  }
  // Use the same color as the node for other statuses
  return getColorClass(status);
}
</script>
