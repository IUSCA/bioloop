<template>
  <div
    class="max-h-48 custom-scroll-container off-bottom"
    ref="scroll_container"
  >
    <div class="scrollbox" ref="scroll_box" @scroll="setShadows">
      <v-slot></v-slot>
    </div>
    <div class="shadow shadow-top" aria-hidden="true"></div>
    <div class="shadow shadow-bottom" aria-hidden="true"></div>
  </div>
</template>

<script setup>
const scroll_container = ref(null);
const scroll_box = ref(null);
let isScrolling = false;

function setShadows(event) {
  if (!isScrolling) {
    window.requestAnimationFrame(function () {
      if (event.target.scrollTop > 0) {
        scroll_container.value.classList.add("off-top");
      } else {
        scroll_container.value.classList.remove("off-top");
      }
      if (event.target.scrollTop < 160) {
        scroll_container.value.classList.add("off-bottom");
      } else {
        scroll_container.value.classList.remove("off-bottom");
      }
      isScrolling = false;
    });
    isScrolling = true;
  }
}
</script>

<style lang="scss" scoped>
.custom-scroll-container {
  overflow: hidden;
  position: relative;
  .scrollbox {
    height: 100%;
    overflow: auto;
  }
  .shadow {
    bottom: 0;
    left: 0;
    pointer-events: none;
    position: absolute;
    right: 0;
    top: 0;
    transition: all 0.2s ease-out;
  }
  &.off-top {
    .shadow-top {
      box-shadow: 0 1em 1em -1em black inset;
    }
  }
  &.off-bottom {
    .shadow-bottom {
      box-shadow: 0 -1em 1em -1em black inset;
    }
  }
}
</style>
