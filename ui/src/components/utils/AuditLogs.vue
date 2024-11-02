<template>
  <div class="">
    <div v-for="log in props.logs" :key="log.id">
      <VaCollapse class="" header="Collapse header" solid>
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
              class="ml-2 flex flex-wrap items-center justify-between w-full gap-3"
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
                <span>{{ datetime.absolute(log.timestamp) }}</span>
              </div>

              <!-- action -->
              <div>
                <div>
                  <span class="uppercase">{{ log.action }}</span>
                </div>
                <div class="va-text-secondary text-sm">Action</div>
              </div>

              <!-- truncated comments -->
              <div class="w-64">
                <div class="line-clamp-1">{{ log.comments }}</div>
                <div class="va-text-secondary text-sm">Comments</div>
              </div>
            </div>
          </div>
        </template>

        <template #body>
          <div class="p-2 h-full">
            <div class="grid grid-cols-12 gap-3 md:gap-5">
              <!-- comments -->
              <div class="col-span-12 md:col-span-6">
                <p class="pt-1 pb-3 font-semibold">Comments</p>
                <span>{{ log.comments }}</span>
              </div>

              <!-- changes -->
              <div class="col-span-12 md:col-span-6">
                <p class="pt-1 pb-3 font-semibold">Changes</p>
                <ObjDiff :before="log.old_data" :after="log.new_data" />
              </div>
            </div>
          </div>
        </template>
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
