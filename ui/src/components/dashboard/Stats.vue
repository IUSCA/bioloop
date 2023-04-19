<template>
  <div style="width: 500px">
    <va-card>
      <va-card-content>
        <div class="row row-separated">
          <div class="flex flex-col xs4 items-center justify-end">
            <h2
              v-if="sequencing_runs_stats?.count != undefined"
              class="va-h2 ma-0 va-text-center"
              :style="{ color: colors.primary }"
            >
              {{ sequencing_runs_stats.count }}
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

          <div class="flex flex-col xs4 items-center justify-end">
            <h2
              v-if="sequencing_runs_stats?.total_size != undefined"
              class="va-h2 ma-0 va-text-center"
              :style="{ color: colors.info }"
            >
              {{ formatBytes(sequencing_runs_stats.total_size) }}
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

          <div class="flex flex-col xs4 items-center justify-end">
            <h2
              v-if="sequencing_runs_stats?.total_genome_files != undefined"
              class="va-h2 ma-0 va-text-center"
              :style="{ color: colors.warning }"
            >
              {{
                number_formatter.format(
                  sequencing_runs_stats.total_genome_files
                )
              }}
            </h2>
            <VaSkeleton
              v-else
              variant="rounded"
              inline
              width="64px"
              height="32px"
            />
            <p class="va-text-center"># Genome Files</p>
          </div>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import toast from "@/services/toast";
import BatchService from "@/services/batch";
import { formatBytes } from "@/services/utils";
import { useColors } from "vuestic-ui";

const { colors } = useColors();
const number_formatter = Intl.NumberFormat("en", { notation: "compact" });

const sequencing_runs_stats = ref({
  count: null,
  total_size: null,
  total_genome_files: null,
});

BatchService.getStats()
  .then((res) => {
    console.log(res.data);
    sequencing_runs_stats.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch batch stats");
  });
</script>

<style lang="scss" scoped>
.row-separated {
  .flex + .flex {
    border-left: 1px solid var(--va-primary);
  }
}
</style>
