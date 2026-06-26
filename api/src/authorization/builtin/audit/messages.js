/**
 * Audit Event Templates
 * Data structure defining how to render audit events in the UI
 * Each template specifies:
 * - pattern: template string with {placeholder} syntax
 * - fields: mapping of placeholders to data sources
 * - links: array of field names that should be rendered as hyperlinks
 *
 * UI consumes these at page load via GET /api/audit/templates
 * Then uses them to hydrate audit rows into formatted messages
 */

const auditTemplates = {
  // ------- GROUP EVENTS -------
  GROUP_CREATED: {
    pattern: 'Group {group_name} created{parent_clause} by {actor}',
    fields: {
      group_name: { source: 'subject_name', type: 'string' },
      parent_clause: {
        source: 'metadata.parent_name',
        type: 'conditional',
        format: ' under {value}',
        fallback: '',
      },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'group_name'],
  },

  GROUP_METADATA_UPDATED: {
    pattern: 'Group {group_name} {changed_fields} updated by {actor}',
    fields: {
      group_name: { source: 'subject_name', type: 'string' },
      changed_fields: { source: 'metadata.changed_fields', type: 'list-format', format: 'and' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'group_name'],
  },

  GROUP_ARCHIVED: {
    pattern: 'Group {group_name} archived by {actor}',
    fields: {
      group_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'group_name'],
  },

  GROUP_UNARCHIVED: {
    pattern: 'Group {group_name} unarchived by {actor}',
    fields: {
      group_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'group_name'],
  },

  GROUP_REPARENTED: {
    pattern: 'Group {group_name} moved{parent_clause} by {actor}',
    fields: {
      group_name: { source: 'subject_name', type: 'string' },
      parent_clause: {
        source: 'metadata.new_parent_name',
        type: 'conditional',
        format: ' under {value}',
        fallback: '',
      },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'group_name'],
  },

  // ------- GROUP MEMBERSHIP EVENTS -------
  GROUP_MEMBER_ADDED: {
    pattern: '{subject_name} added as {role} by {actor}',
    fields: {
      subject_name: { source: 'subject_name', type: 'string' },
      role: { source: 'metadata.role', type: 'string', fallback: 'Member' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'subject_name'],
  },

  GROUP_MEMBER_REMOVED: {
    pattern: '{subject_name} removed by {actor}',
    fields: {
      subject_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'subject_name'],
  },

  GROUP_ADMIN_ADDED: {
    pattern: '{subject_name} promoted to Admin by {actor}',
    fields: {
      subject_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'subject_name'],
  },

  GROUP_ADMIN_REMOVED: {
    pattern: '{subject_name} demoted to Member by {actor}',
    fields: {
      subject_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'subject_name'],
  },

  // ------- COLLECTION EVENTS -------
  COLLECTION_CREATED: {
    pattern: 'Collection {collection_name} created by {actor}',
    fields: {
      collection_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'collection_name'],
  },

  COLLECTION_ARCHIVED: {
    pattern: 'Collection {collection_name} archived by {actor}',
    fields: {
      collection_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'collection_name'],
  },

  COLLECTION_UNARCHIVED: {
    pattern: 'Collection {collection_name} unarchived by {actor}',
    fields: {
      collection_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'collection_name'],
  },

  COLLECTION_DELETED: {
    pattern: 'Collection {collection_name} deleted by {actor}',
    fields: {
      collection_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'collection_name'],
  },

  COLLECTION_DATASET_ADDED: {
    pattern: 'Dataset {dataset_name} added to collection by {actor}',
    fields: {
      dataset_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'dataset_name'],
  },

  COLLECTION_DATASET_REMOVED: {
    pattern: 'Dataset {dataset_name} removed from collection by {actor}',
    fields: {
      dataset_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'dataset_name'],
  },

  // ------- GRANT EVENTS -------
  GRANT_CREATED: {
    pattern: 'Grant {access_type} created on {resource_name} for {subject_name} by {actor}{expires_clause}',
    fields: {
      access_type: { source: 'metadata.access_type_name', type: 'string', fallback: 'Unknown' },
      resource_name: { source: 'resource_name', type: 'string' },
      subject_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
      expires_clause: {
        source: 'metadata.valid_until',
        type: 'conditional',
        format: ' · expires {date-format}',
        fallback: '',
      },
    },
    links: ['actor', 'subject_name', 'resource_name'],
  },

  GRANT_REVOKED: {
    pattern: 'Grant {access_type} revoked on {resource_name} for {subject_name} by {actor}',
    fields: {
      access_type: { source: 'metadata.access_type_name', type: 'string', fallback: 'Unknown' },
      resource_name: { source: 'resource_name', type: 'string' },
      subject_name: { source: 'subject_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'subject_name', 'resource_name'],
  },

  GRANT_EXPIRED: {
    pattern: 'Grant {access_type} on {resource_name} for {subject_name} expired',
    fields: {
      access_type: { source: 'metadata.access_type_name', type: 'string', fallback: 'Unknown' },
      resource_name: { source: 'resource_name', type: 'string' },
      subject_name: { source: 'subject_name', type: 'string' },
    },
    links: ['subject_name', 'resource_name'],
  },

  // ------- ACCESS REQUEST EVENTS -------
  REQUEST_CREATED: {
    pattern: 'Access request for {resource_name} created by {actor}',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_UPDATED: {
    pattern: 'Access request for {resource_name} updated by {actor}',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_SUBMITTED: {
    pattern: 'Access request for {resource_name} submitted by {actor}',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_APPROVED: {
    pattern: 'Access request for {resource_name} approved by {actor}{item_summary}',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
      item_summary: {
        source: 'metadata',
        type: 'conditional',
        format: ' ({approved_count} approved, {rejected_count} rejected)',
        fallback: '',
      },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_REJECTED: {
    pattern: 'Access request for {resource_name} rejected by {actor}',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_PARTIALLY_APPROVED: {
    pattern: 'Access request for {resource_name} partially approved by {actor}'
    + ' ({approved_count} approved, {rejected_count} rejected)',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
      approved_count: { source: 'metadata.approved_count', type: 'number' },
      rejected_count: { source: 'metadata.rejected_count', type: 'number' },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_WITHDRAWN: {
    pattern: 'Access request for {resource_name} withdrawn by {actor}',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
      actor: { source: 'actor_name', type: 'string' },
    },
    links: ['actor', 'resource_name'],
  },

  REQUEST_EXPIRED: {
    pattern: 'Access request for {resource_name} expired (no action taken)',
    fields: {
      resource_name: { source: 'resource_name', type: 'string' },
    },
    links: ['resource_name'],
  },

  // ------- AUTHORIZATION CHECK -------
  ACCESS_CHECK: {
    pattern: 'Access {decision} on {resource_name}{reason_clause}',
    fields: {
      decision: { source: 'decision', type: 'enum-map', map: { true: 'granted', false: 'denied' } },
      resource_name: { source: 'resource_name', type: 'string' },
      reason_clause: {
        source: 'reason',
        type: 'conditional',
        format: ': {value}',
        fallback: '',
      },
    },
    links: ['resource_name'],
  },
};

/**
 * Build human-readable audit message from authorization_audit row
 * Used for backward compatibility and for API logs/exports that don't use templates
 *
 * @param {Object} row - Authorization audit record with typed columns
 * @returns {string|null} Human-readable message or null if event type is unknown
 */
// function buildAuditMessage(row) {
//   if (!row || !row.event_type) {
//     return null;
//   }

//   const template = auditTemplates[row.event_type];
//   if (!template) {
//     return null;
//   }

//   try {
//     let message = template.pattern;
//     const fields = template.fields || {};

//     // Replace each placeholder with its value
//     Object.entries(fields).forEach(([placeholder, fieldConfig]) => {
//       const value = _resolveFieldValue(row, fieldConfig);
//       if (value !== null && value !== undefined) {
//         message = message.replace(`{${placeholder}}`, value);
//       }
//     });

//     return message;
//   } catch (error) {
//     console.error(`Error building message for event type ${row.event_type}:`, error);
//     return null;
//   }
// }

// /**
//  * Resolve a single field value from audit row based on field configuration
//  * @private
//  */
// function _resolveFieldValue(row, fieldConfig) {
//   if (!fieldConfig || !fieldConfig.source) {
//     return null;
//   }

//   const value = _getNestedValue(row, fieldConfig.source);

//   if (value === null || value === undefined) {
//     return fieldConfig.fallback ?? null;
//   }

//   switch (fieldConfig.type) {
//     case 'string':
//       return String(value);

//     case 'number':
//       return Number(value);

//     case 'list-format': {
//       if (!Array.isArray(value)) return null;
//       const format = fieldConfig.format || 'and';
//       if (value.length === 0) return '';
//       if (value.length === 1) return value[0];
//       if (value.length === 2) return `${value[0]} ${format} ${value[1]}`;
//       const last = value[value.length - 1];
//       const rest = value.slice(0, -1).join(', ');
//       return `${rest}, ${format} ${last}`;
//     }

//     case 'conditional': {
//       if (!value) {
//         return fieldConfig.fallback ?? '';
//       }
//       const fmt = fieldConfig.format || '{value}';
//       return fmt.replace('{value}', value);
//     }

//     case 'enum-map': {
//       const map = fieldConfig.map || {};
//       return map[value] ?? fieldConfig.fallback ?? String(value);
//     }

//     default:
//       return String(value);
//   }
// }

// /**
//  * Get nested value from object using dot notation
//  * @private
//  */
// function _getNestedValue(obj, path) {
//   if (!path || typeof path !== 'string') return null;
//   const parts = path.split('.');
//   let value = obj;
//   for (const part of parts) {
//     if (value === null || value === undefined) return null;
//     value = value[part];
//   }
//   return value;
// }

// /**
//  * Format an audit message for display
//  * Combines audit row data with a timestamp and message
//  * @param {Object} auditRow - Full authorization_audit row
//  * @returns {Object|null} Object with {timestamp, message, event_type} or null
//  */
// function formatAuditEntry(auditRow) {
//   if (!auditRow || !auditRow.timestamp) {
//     return null;
//   }

//   const message = buildAuditMessage(auditRow);
//   if (!message) {
//     return null;
//   }

//   return {
//     timestamp: new Date(auditRow.timestamp),
//     message,
//     event_type: auditRow.event_type,
//   };
// }

module.exports = {
  auditTemplates,
  // buildAuditMessage,
  // formatAuditEntry,
};
