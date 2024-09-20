<template>
  <VaPopover :message="props.name || props.username" :hoverOverTimeout="800">
    <div>
      <va-avatar :color="stringToRGB(props.username || '')" size="small">
        <span class="text-sm uppercase">{{ initials(props.name) }}</span>
      </va-avatar>
    </div>
  </VaPopover>
</template>

<script setup>
import { stringToRGB } from "@/services/colors";
import { initials } from "@/services/utils";
const props = defineProps(["username", "name"]);
</script>
