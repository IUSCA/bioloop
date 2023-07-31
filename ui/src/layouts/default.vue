<template>
  <p>Breakpoint: {{ breakpoint.current }}</p>
  <p>isSidebarCollapsed: {{ isSidebarCollapsed }}</p>
  <Header 
    :isSidebarCollapsed="isSidebarCollapsed"
    @toggle-sidebar-visibility="toggleSidebarVisibility"
  ></Header>
  <div class="flex flex-row h-screen">
    <nav
      aria-label="menu nav"
      class="relative h-full content-center flex-none shadow-xl"
    >
      <Sidebar
        :isSidebarCollapsed="isSidebarCollapsed"
      ></Sidebar>
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

watch(() => breakpoint.current, () => {
  isSidebarCollapsed.value = !(breakpoint.xl || breakpoint.lg || breakpoint.md)
})

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

</script>
