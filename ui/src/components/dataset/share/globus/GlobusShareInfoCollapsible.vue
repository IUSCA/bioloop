<template>
  <collapsible v-model="collapseModel">
    <template #header-content>
      <div class="flex flex-row">
        <GlobusShareInfoCompact :share="props.share" />

        <div class="text-sm gap-x-3">
          <div v-if="props.share?.user" class="grow">
            <span>
              Initiated by: {{ props.share.user?.username }} ({{
                props.share.user?.name
              }})
            </span>
          </div>
        </div>
        <!--    </div>-->
      </div>
    </template>

    <GlobusShareInfo :share="props.share.globus_share" />
    <!--              <workflow :workflow="{}" @update="fetch_dataset(true)"></workflow>-->
  </collapsible>
</template>

<script setup>
const props = defineProps({
  share: {
    type: Object,
    required: true,
  },
});

const collapseModel = ref(false);
</script>

<style scoped></style>
