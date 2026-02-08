const meta = {
  model: 'Post',
  version: '1.0.0',
  description: 'Policies for Post resource',
};

/**
 * Policy functions must have signature (user, resource, context) and return boolean.
 * Keep them pure and small so they can be unit tested and composed.
 */

const actions = {

  read: (user, post, ctx = {}) => {
    if (!post) return false;
    if (post.visibility === 'public') return true;
    if (post.visibility === 'private') return user.id === post.ownerId;
    if (post.visibility === 'department') {
      // expect post.ownerDepartment to be preloaded by service
      return user.department && (user.department === post.ownerDepartment);
    }
    return false;
  },

  // only owner or admin may update
  update: (user, post, ctx = {}) => user.id === post.ownerId || user.role === 'admin',

  // admins can delete anything; owners can delete their own posts
  delete: (user, post, ctx = {}) => user.role === 'admin' || user.id === post.ownerId,
};

module.exports = {
  meta,
  actions,
};
