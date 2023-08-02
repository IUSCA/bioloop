<template>
  <!-- <p>Breakpoint: {{ breakpoint.current }}</p>
  <p>isSidebarCollapsed: {{ isSidebarCollapsed }}</p> -->
  <Header :is-mobile-view="isMobileView" :is-sidebar-collapsed="isSidebarCollapsed"
    @toggle-sidebar-visibility="toggleSidebarVisibility">
  </Header>
  <!-- <nav v-show="isMobileView && isMobileNavVisible" class="flex flex-col h-screen mobile-nav">
    <div class="mobile-nav-close-button-container">
      <va-button icon="close" @click="toggleMobileNavVisibility" />
    </div> -->
    <!-- <div class="flex flex-col"> -->
    <!-- <div> -->
      <!-- <va-list class="">
        <va-list-item class="">
          <va-list-item-section> -->
            <!-- <about /> -->
          <!-- </va-list-item-section>
        </va-list-item>
        <va-list-item class="">
          <va-list-item-section> -->
            <!-- <profile-dropdown /> -->
          <!-- </va-list-item-section>
        </va-list-item>
        <va-list-item class="">
          <va-list-item-section> -->
            <!-- <dark-mode /> -->
          <!-- </va-list-item-section>
        </va-list-item>
      </va-list> -->
    <!-- </div> -->
  <!-- </nav> -->
  <div class="flex flex-row h-screen">
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
// import About from '@/components/layout/About.vue';
// import DarkMode from '@/components/layout/DarkMode.vue';
// import ProfileDropdown from '@/components/layout/ProfileDropdown.vue';

const breakpoint = useBreakpoint()

let isSidebarCollapsed = ref(false)
// let isMobileNavVisible = ref(false)
let isMobileView = ref(false)

watch(() => breakpoint.current, (newValue, oldValue) => {
  isMobileView = !(
    breakpoint.xl ||
    breakpoint.lg ||
    breakpoint.md
  )

  // if (isMobileNavVisible.value && !isMobileView) {
  //   isMobileNavVisible.value = false
  // }

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

// const toggleMobileNavVisibility = () => {
//   isMobileNavVisible.value = !isMobileNavVisible.value
// }
</script>

<style>
.mobile-nav .va-list, .mobile-nav .va-button-dropdown, .mobile-nav .va-message-list-wrapper {
  max-height: 100px;
  display: flex;
  justify-content: center;
}

.mobile-nav .va-message-list-wrapper .va-switch__container {
  justify-content: center;
}

.mobile-nav-close-button-container {
  height: 104px;
  max-height: 104px;
  padding-top: 2.125rem;
  padding-bottom: 2.125rem;
  padding-right: 1rem;
  text-align: right;
}
</style>