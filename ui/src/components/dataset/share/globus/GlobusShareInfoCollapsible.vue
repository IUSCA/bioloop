<template>
  <collapsible v-model="collapseModel">
    <template #header-content>
      <div class="flex flex-row">
        <GlobusShareInfoCompact :share="props.share" />

        <div class="text-sm gap-x-3">
          <div v-if="props.share?.user" class="grow">
            Shared by: {{ props.share.user?.username }} ({{
              props.share.user?.name
            }})
          </div>
        </div>

        <div class="text-sm gap-x-3">
          <va-popover message="Shared On" :hover-over-timeout="500">
            <i-mdi-calendar
              class="text-xl inline-block text-slate-700 dark:text-slate-300"
            />
          </va-popover>
          <span
            class="hidden md:inline pl-2 lg:spacing-wider text-sm lg:text-base"
          >
            {{ datetime.absolute(share.timestamp) }}
          </span>
          <span class="md:hidden pl-2 lg:spacing-wider text-sm lg:text-base">
            {{ datetime.date(share.timestamp) }}
          </span>
        </div>
      </div>
    </template>

    <GlobusShareInfo :share="props.share.globus_share" />
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
