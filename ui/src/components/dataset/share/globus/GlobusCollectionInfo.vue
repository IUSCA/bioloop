<template>
  <div class="va-table-responsive">
    <table class="va-table w-full">
      <tbody>
        <tr>
          <td>Source Collection</td>
          <td>
            <a
              :href="`${config.globus.collection_base_url}/${props.sourceCollection?.id}`"
              target="blank"
              >{{ props.sourceCollection?.display_name }}</a
            >
          </td>
        </tr>
        <tr>
          <td>Destination Collection</td>
          <td>
            <a
              :href="`${config.globus.collection_base_url}/${props.destinationCollection?.id}`"
              target="blank"
              >{{ props.destinationCollection?.display_name }}</a
            >
          </td>
        </tr>
        <tr>
          <td>Destination Collection Organization</td>
          <td>{{ props.destinationCollection?.organization }}</td>
        </tr>
        <tr>
          <td>Public Destination Collection</td>
          <td>
            <i-mdi-check-circle-outline
              v-if="props.destinationCollection?.public"
              class="text-green-700"
            />
            <i-mdi-close-circle-outline v-else class="text-red-700" />
          </td>
        </tr>
        <tr>
          <td>Source File Path</td>
          <td><CopyText :text="props.filePath" /></td>
        </tr>
        <!--        <tr>-->
        <!--          <td>Description</td>-->
        <!--          <td>{{ props.destinationCollection?.user_message }}</td>-->
        <!--        </tr>-->
      </tbody>
    </table>
  </div>
</template>

<script setup>
import config from "@/config";

const props = defineProps({
  sourceCollection: {
    type: Object,
    required: true,
  },
  destinationCollection: {
    type: Object,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
});
</script>
<style scoped></style>
