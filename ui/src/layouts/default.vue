<template>
  <!-- <p>Breakpoint: {{ breakpoint.current }}</p>
  <p>isSidebarCollapsed: {{ isSidebarCollapsed }}</p> -->
  <Header
    v-show="!isMobileNavVisible"
    :is-mobile-view="isMobileView"
    :is-sidebar-collapsed="isSidebarCollapsed"
    @toggle-sidebar-visibility="toggleSidebarVisibility"
    @toggle-mobile-nav-visibility="toggleMobileNavVisibility">
  </Header>
  <nav>
    <div
    v-show="isMobileView && isMobileNavVisible"
    class="w-full text-right px-5 py-5">
      <va-button
      icon="close"
      @click="toggleMobileNavVisibility"
      />
    </div>
  </nav>
  <div
    v-show="!isMobileNavVisible"
    class="flex flex-row h-screen">
    <nav aria-label="menu nav" class="relative h-full content-center flex-none shadow-xl">
      <Sidebar :isSidebarCollapsed="isSidebarCollapsed"></Sidebar>
    </nav>
    <main class="overflow-y-scroll">
      <div class="px-4 pb-10 pt-3 min-h-screen">
        <router-view></router-view>
      </div>
      <Footer></Footer>
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useBreakpoint } from "vuestic-ui"

const breakpoint = useBreakpoint()

let isSidebarCollapsed = ref(false)
let isMobileNavVisible = ref(false)
let isMobileView = ref(false)

watch(() => breakpoint.current, (newValue, oldValue) => {
  isMobileView = !(
    breakpoint.xl ||
    breakpoint.lg ||
    breakpoint.md
  )

  if (isMobileNavVisible.value && !isMobileView) {
    isMobileNavVisible.value = false
  }

  // If sidebar is already open when going from screen size SM to XS, or XS 
  // to SM, it should stay open.
  if (!isSidebarCollapsed.value) {
    if ((oldValue === 'xs' && newValue === 'sm') 
      || (oldValue === 'sm' && newValue === 'xs')) {
      return
    }
  }
  isSidebarCollapsed.value = isMobileView
})

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

const toggleMobileNavVisibility = () => {
  isMobileNavVisible.value = !isMobileNavVisible.value
}

</script>

