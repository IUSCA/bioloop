<template>
  <collapsible
    v-for="item in props.actionItems"
    :key="item.id"
    v-model="item.collapse"
  >
    <template #header-content>
      <div class="flex-[0_0_90%]">
        <div
          class="grid grid-cols-6 lg:grid-cols-12 gap-1 lg:gap-3 items-center p-1"
        >
          <div
            class="col-span-2 lg:col-span-6 flex flex-nowrap items-center gap-3 lg:gap-5"
          >
            <div class="flex-none md:mx-2">
              <i-mdi-check-circle
                style="color: var(--va-success)"
                class="text-xl"
              ></i-mdi-check-circle>
            </div>

            <div class="flex flex-col">
              <span class="text-lg font-semibold capitalize">
                {{ item.label }}
              </span>

              <div class="flex gap-2 text-sm">
                <div>
                  Original Dataset:
                  <router-link
                    :to="`/datasets/${item.dataset_id}`"
                    class="va-link"
                    >#{{ item.dataset_id }}</router-link
                  >
                </div>
                <div>
                  Incoming Duplicate:
                  <router-link
                    :to="`/datasets/${item.duplicate_dataset_id}`"
                    class="va-link"
                    >#{{ item.duplicate_dataset_id }}</router-link
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- created at -->
          <div class="col-span-2 lg:col-span-3">
            <va-popover message="Ingested On">
              <i-mdi-calendar
                class="text-xl inline-block text-slate-700 dark:text-slate-300"
              />
            </va-popover>
            <span
              class="hidden md:inline pl-2 lg:spacing-wider text-sm lg:text-base"
            >
              {{ datetime.absolute(item.created_at) }}
            </span>
            <span class="md:hidden pl-2 lg:spacing-wider text-sm lg:text-base">
              {{ datetime.date(item.created_at) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Details of Action Item -->
    <action-item-details :item="item" />
  </collapsible>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import ActionItemDetails from "@/pages/ingestionManager/actionItem/Details.vue";

const props = defineProps({
  actionItems: {
    type: Array,
    required: true,
  },
});
</script>

<style scoped></style>
