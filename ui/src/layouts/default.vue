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
import { ref, computed, onMounted } from 'vue'
import { useBreakpoint } from "vuestic-ui"

const breakpoint = useBreakpoint()

// const isSidebarOpen = !(breakpoint.current !== 'xl' && breakpoint.current !== 'lg' && breakpoint.current !== 'md')

// const isSidebarCollapsed = ref(isSidebarOpen)

// const isSidebarOpen = ref(false)

onMounted(() => {
  console.log(`breakpoint.current = ${breakpoint.current}`)
  console.log(`breakpoint.current !== 'xl' && breakpoint.current !== 'lg' && breakpoint.current !== 'md' = ${breakpoint.current !== 'xl' && breakpoint.current !== 'lg' && breakpoint.current !== 'md'}`)
  console.log(`isSidebarCollapsed = ${isSidebarCollapsed.value}`)
})

const isSidebarCollapsed = computed({
  get() {
    return breakpoint.current !== 'lg' && breakpoint.current !== 'md' && breakpoint.current !== 'xl'
  }
  // , set(newValue) {
    
  // }
  })

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

</script>
