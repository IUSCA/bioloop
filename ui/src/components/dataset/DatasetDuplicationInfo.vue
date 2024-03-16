<template>
  <va-alert
    :color="alertConfig.color"
  >
  {{ alertConfig.text }}
  </va-alert>
</template>

<script setup>
const props = defineProps({
  dataset: {
    type: Object,
    required: true
  }
})

console.dir(props.dataset, {depth: null})

const alertConfig = computed(() => {
  const dataset = props.dataset

  let color = ""
  let text = ""
  if (dataset.type === 'DUPLICATE') {
    color = "warning"
    text = `This dataset was duplicated from ${dataset.duplicated_from.original_dataset_id}, and is currently pending acceptance.`
  } else {
    if (!dataset.is_deleted) {
      if (dataset.duplicated_by) {
        color = "warning"
        text = `This dataset was duplicated by ${dataset.duplicated_by.duplicate_dataset_id}, which is currently pending acceptance.`
      }
    } else {
      const datasetState = getCurrentState(dataset)
      if (datasetState === 'DELETED') {
        color = "danger"
        text = "You are viewing an inactive (deleted) dataset."
      } else if (datasetState === 'REJECTED_DUPLICATE') {
        color = "warning"
        text = `This dataset was duplicated from ${dataset.duplicated_from.original_dataset_id}, and then rejected.`
      } else if (datasetState === 'OVERWRITTEN') {
        color = "warning"
        text = `This dataset has been overwritten by ${dataset.duplicated_by.duplicate_dataset_id}.`
      }
    }
  }

  return {
    color,
    text
  }
  // const dataset = props.dataset.type === 'DUPLICATE'

})

const getCurrentState = dataset => {
  const latestState = dataset.states[dataset.states.length - 1]
  return latestState.state
}
</script>