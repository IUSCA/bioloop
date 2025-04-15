<template>
  <div class="parent-container" ref="parentContainer">
    <div class="content">
      <!-- Your main content goes here -->
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <p>This is the main content of the container.</p>
      <!-- ... other paragraphs ... -->
      <!-- ... other paragraphs ... -->
    </div>
    <div class="fixed-element" :style="fixedElementStyle">
      This element is fixed even when scrolling
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const parentContainer = ref(null)
const parentRect = ref(null)

const updateParentRect = () => {
  if (parentContainer.value) {
    parentRect.value = parentContainer.value.getBoundingClientRect()
  }
}

const fixedElementStyle = computed(() => {
  if (!parentRect.value) return {}
  return {
    position: 'fixed',
    bottom: `${window.innerHeight - parentRect.value.bottom + 10}px`,
    right: `${window.innerWidth - parentRect.value.right + 10}px`,
  }
})

onMounted(() => {
  updateParentRect()
  window.addEventListener('resize', updateParentRect)
  window.addEventListener('scroll', updateParentRect)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateParentRect)
  window.removeEventListener('scroll', updateParentRect)
})
</script>

<style scoped>
.parent-container {
  position: relative;
  width: 300px;
  height: 200px;
  border: 1px solid #ccc;
  padding: 10px;
  overflow: auto;
}

.content {
  /* Add any styling for your main content */
}

.fixed-element {
  background-color: #f0f0f0;
  padding: 5px;
  border: 1px solid #999;
}
</style>
