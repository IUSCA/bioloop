<template>
  <div style="">
    <va-card>
      <va-card-title>
        <span class="text-xl"> {{ props.title }} </span>
      </va-card-title>
      <va-card-content>
        <div
          class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-3 gap-y-5"
        >
          <div class="flex flex-col items-center justify-end">
            <h2
              v-if="props.data?.count != undefined"
              class="va-h3 flex-auto my-0 ma-0 va-text-center"
              :style="{ color: colors.primary }"
            >
              {{ number_formatter.format(props.data.count) }}
            </h2>
            <VaSkeleton
              v-else
              variant="rounded"
              inline
              width="64px"
              height="32px"
            />
            <p class="va-text-center">Registered</p>
          </div>

          <div class="flex flex-col items-center justify-end">
            <h2
              v-if="props.data?.total_size != undefined"
              class="va-h3 flex-auto my-0 ma-0 va-text-center"
              :style="{ color: colors.info }"
            >
              {{ formatBytes(props.data.total_size, 0) }}
            </h2>
            <VaSkeleton
              v-else
              variant="rounded"
              inline
              width="64px"
              height="32px"
            />
            <p class="va-text-center no-wrap">Total Size</p>
          </div>

          <div
            v-if="config.enabledFeatures.genomeBrowser"
            class="flex flex-col items-center justify-end"
          >
            <h2
              v-if="props.data?.total_num_genome_files != undefined"
              class="va-h3 flex-auto my-0 ma-0 va-text-center"
              :style="{ color: colors.success }"
            >
              {{ number_formatter.format(props.data.total_num_genome_files) }}
            </h2>
            <VaSkeleton
              v-else
              variant="rounded"
              inline
              width="64px"
              height="32px"
            />
            <p class="va-text-center">Data Files</p>
          </div>

          <div class="flex flex-col items-center justify-end">
            <h2
              v-if="props.data?.workflows != undefined"
              class="va-h3 flex-auto my-0 ma-0 va-text-center text-indigo-600"
            >
              {{ number_formatter.format(props.data.workflows) }}
            </h2>
            <VaSkeleton
              v-else
              variant="rounded"
              inline
              width="64px"
              height="32px"
            />
            <p class="va-text-center">Workflows</p>
          </div>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { formatBytes } from "@/services/utils";
import { useColors } from "vuestic-ui";
import config from "@/config";

const { colors } = useColors();
const number_formatter = Intl.NumberFormat("en", { notation: "compact" });

const props = defineProps({
  data: Object,
  title: String,
});
</script>

<style scoped>
.row-separated .flex + .flex {
  border-left: 1px solid var(--va-primary);
}
</style>
