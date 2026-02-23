const Policy = require('./base/policy');
const { isPlatformAdmin } = require('./utils');

const meta = {
  model: 'group',
  version: '1.0.0',
  description: 'Policies for Group resource',
};

class GroupPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'group', requires, evaluate,
    });
  }
}

const isGroupAdmin = new GroupPolicy({
  name: 'isGroupAdmin',
  requires: {
    user: ['group_memberships'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .group_memberships
    .some((membership) => membership.group_id === group.id && membership.role === 'ADMIN'),
});

const isGroupMember = new GroupPolicy({
  name: 'isGroupMember',
  requires: {
    user: ['group_memberships'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .group_memberships
    .some((membership) => membership.group_id === group.id),
});

const actions = {
  // Only platform admins can create groups
  create: isPlatformAdmin,
  create_child: Policy.or(isPlatformAdmin, isGroupAdmin),

  // Only platform admins can archive groups
  archive: isPlatformAdmin,
  unarchive: isPlatformAdmin,

  // if platform admin or group member or admin of ancestor group (oversight)
  view_metadata: Policy.or(isPlatformAdmin, isGroupMember),

  // Only platform admins and group admins can edit group metadata
  edit_metadata: Policy.or(isPlatformAdmin, isGroupAdmin),

  // if platform admin or group admin or admin of ancestor group (oversight)
  view_members: Policy.or(isPlatformAdmin, isGroupMember),

  // Only platform admins or group admins can add/remove group members
  add_member: Policy.or(isPlatformAdmin, isGroupAdmin),
  remove_member: Policy.or(isPlatformAdmin, isGroupAdmin),

  // Only platform admins and group admins can edit group member roles
  edit_member_role: Policy.or(isPlatformAdmin, isGroupAdmin),

};

module.exports = {
  meta,
  actions,
};
