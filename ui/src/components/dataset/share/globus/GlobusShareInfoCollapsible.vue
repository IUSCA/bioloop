<template>
  <collapsible v-model="collapseModel">
    <template #header-content>
      <div class="flex flex-row">
        <GlobusShareInfoCompact
          :globus-share="props.share.globus_share"
          :user="props.share.user"
          :status="props.share.globus_share.status"
        />

        <div class="flex flex-col justify-center text-sm">
          <div class="flex flex-row">
            <va-popover message="Shared On" :hover-over-timeout="500">
              <i-mdi-calendar
                class="text-xl inline-block text-slate-700 dark:text-slate-300"
              />
            </va-popover>
            <!--          <div></div>-->
            <div>
              <span
                class="hidden md:inline pl-2 lg:spacing-wider text-sm lg:text-base"
              >
                {{ datetime.absolute(props.share.timestamp) }}
              </span>
              <span
                class="md:hidden pl-2 lg:spacing-wider text-sm lg:text-base"
              >
                {{ datetime.date(props.share.timestamp) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <GlobusShareInfo
      :globus-share="props.share.globus_share"
      :source-file-path="props.share.source_file_path"
      :destination-file-path="props.share.destination_file_path"
    />
    <!--              <workflow :workflow="{}" @update="fetch_dataset(true)"></workflow>-->
  </collapsible>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  share: {
    type: Object,
    required: true,
  },
});

const collapseModel = ref(false);
</script>

<style scoped></style>
