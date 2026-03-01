import GroupService from "@/services/v2/groups";
import { defineStore } from "pinia";

/**
 * Store for v2 Groups domain.
 *
 * Group admin detection note:
 * The `GET /groups/mine` endpoint does not currently return the caller's role per group.
 * `isGroupAdmin` is currently derived from the groups search result — if the user can see
 * admin-scoped data (pending access requests, etc.), they are effectively a group admin.
 * TODO: update when API returns `caller_role` in group responses.
 */
export const useGroupsStore = defineStore("v2/groups", () => {
  // Groups the current user is a member of (direct membership)
  const myGroups = ref([]);
  const myGroupsLoading = ref(false);
  const myGroupsError = ref(null);

  async function fetchMyGroups(params = {}) {
    myGroupsLoading.value = true;
    myGroupsError.value = null;
    try {
      const {
        data: { data: items },
      } = await GroupService.mine(params);
      myGroups.value = items;
    } catch (err) {
      myGroupsError.value = err;
    } finally {
      myGroupsLoading.value = false;
    }
  }

  // Selected group detail (used in group detail page)
  const selectedGroup = ref(null);
  const selectedGroupLoading = ref(false);
  const selectedGroupError = ref(null);

  async function fetchGroup(id) {
    selectedGroupLoading.value = true;
    selectedGroupError.value = null;
    try {
      const { data } = await GroupService.get(id);
      selectedGroup.value = data;
    } catch (err) {
      selectedGroupError.value = err;
    } finally {
      selectedGroupLoading.value = false;
    }
  }

  function clearSelectedGroup() {
    selectedGroup.value = null;
    selectedGroupError.value = null;
  }

  // Group members (used in group detail > Members tab)
  const members = ref([]);
  const membersLoading = ref(false);

  async function fetchMembers(groupId, params = {}) {
    membersLoading.value = true;
    try {
      const {
        data: { data: items },
      } = await GroupService.getMembers(groupId, params);
      members.value = items;
    } finally {
      membersLoading.value = false;
    }
  }

  // Ancestors of the selected group (for breadcrumb)
  const ancestors = ref([]);

  async function fetchAncestors(groupId) {
    try {
      const { data } = await GroupService.getAncestors(groupId);
      ancestors.value = data;
    } catch {
      ancestors.value = [];
    }
  }

  function $reset() {
    myGroups.value = [];
    myGroupsLoading.value = false;
    myGroupsError.value = null;
    selectedGroup.value = null;
    selectedGroupLoading.value = false;
    selectedGroupError.value = null;
    members.value = [];
    membersLoading.value = false;
    ancestors.value = [];
  }

  return {
    myGroups,
    myGroupsLoading,
    myGroupsError,
    fetchMyGroups,
    selectedGroup,
    selectedGroupLoading,
    selectedGroupError,
    fetchGroup,
    clearSelectedGroup,
    members,
    membersLoading,
    fetchMembers,
    ancestors,
    fetchAncestors,
    $reset,
  };
});
