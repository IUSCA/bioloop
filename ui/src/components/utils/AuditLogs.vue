<template>
  <div class="">
    <div v-for="log in props.logs" :key="log.id">
      <VaCollapse class="" solid>
        <template #header="{ value, attrs, iconAttrs }">
          <div
            v-bind="attrs"
            class="w-full flex items-center p-2 bg-[var(--va-background-element)]"
          >
            <VaIcon
              name="va-arrow-down"
              :class="value ? '' : 'rotate-[-90deg]'"
              v-bind="iconAttrs"
            />

            <div
              class="ml-2 flex flex-wrap items-center justify-between w-full gap-3 max-w-4xl"
            >
              <!-- user -->
              <div class="flex items-center gap-2">
                <UserAvatar
                  :username="log.user?.username"
                  :name="log.user?.name"
                />
                <span> {{ log.user?.username }} </span>
              </div>

              <!-- timestamp -->
              <div class="flex items-center gap-2">
                <i-mdi-calendar />
                <span>{{ datetime.displayDateTime(log.timestamp) }}</span>
              </div>

              <!-- action -->
              <div>
                <div class="va-text-secondary text-sm">Action</div>
                <div>
                  <span class="uppercase">{{ log.action }}</span>
                </div>
              </div>

              <!-- summary or truncated comments -->
              <div class="w-96 hidden md:block">
                <div class="va-text-secondary text-sm">Summary</div>
                <div class="line-clamp-1 text-sm">
                  {{ log.summary || log.comments }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="px-2 h-full">
          <div class="grid grid-cols-12 gap-3 md:gap-5">
            <!-- comments -->
            <div class="col-span-12 md:col-span-4">
              <p class="pt-1 pb-3 font-semibold">Comments</p>
              <span class="whitespace-pre-line">{{ log.comments }}</span>
            </div>

            <!-- changes -->
            <div class="col-span-12 md:col-span-8">
              <p class="pt-1 pb-3 font-semibold">Changes</p>
              <ObjDiff
                :before="log.old_data"
                :after="log.new_data"
                class="h-0"
              />
              <!-- 
                Adding h-0 seems to enable to VaCollapse component to compute the correct height of the body.
                Without it, the collapse body always has a vertical scrollbar.
                This is likely due to issues with VaCollapse unable to estimate the height of VaDataTable.
                Even though the height is set to 0, the VaDataTable still visible without a scrollbar.
              -->
            </div>
          </div>
        </div>
      </VaCollapse>
    </div>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  logs: Array,
});
</script>
