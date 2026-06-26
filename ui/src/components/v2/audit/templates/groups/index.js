import GroupArchived from "./GroupArchived.vue";
import GroupCreated from "./GroupCreated.vue";
import GroupMetadataUpdated from "./GroupMetadataUpdated.vue";
import GroupReparented from "./GroupReparented.vue";
import GroupUnarchived from "./GroupUnarchived.vue";

import GroupAdminAdded from "./GroupAdminAdded.vue";
import GroupAdminRemoved from "./GroupAdminRemoved.vue";
import GroupMemberAdded from "./GroupMemberAdded.vue";
import GroupMemberRemoved from "./GroupMemberRemoved.vue";

export default {
  GROUP_CREATED: GroupCreated,
  GROUP_METADATA_UPDATED: GroupMetadataUpdated,
  GROUP_ARCHIVED: GroupArchived,
  GROUP_UNARCHIVED: GroupUnarchived,
  GROUP_REPARENTED: GroupReparented,

  GROUP_MEMBER_ADDED: GroupMemberAdded,
  GROUP_MEMBER_REMOVED: GroupMemberRemoved,
  GROUP_ADMIN_ADDED: GroupAdminAdded,
  GROUP_ADMIN_REMOVED: GroupAdminRemoved,
};
