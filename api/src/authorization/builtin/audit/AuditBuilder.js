/**
 * AuditBuilder: Encapsulates audit record creation with consistent field handling
 * and name resolution.
 *
 * Usage:
 *   const builder = new AuditBuilder(tx, { actor_id: userId });
 *   await builder.setTarget('grant', grantId);
 *   await builder.setSubject(subjectId);
 *   await builder.setResource(resourceId);
 *   builder.mergeMetadata({ from_status: 'DRAFT', to_status: 'SUBMITTED' });
 *   await builder.create(tx, AUTH_EVENT_TYPE.GRANT_CREATED);
 *
 * Batch usage:
 *   const items = [
 *     { subject_id: userId1, metadata: { role: 'ADMIN' } },
 *     { subject_id: userId2, metadata: { role: 'MEMBER' } },
 *   ];
 *   await builder.createBatch(tx, AUTH_EVENT_TYPE.GROUP_MEMBER_ADDED, items);
 */

const { resolveEntityName, resolveSubjects, resolveResources } = require('./helpers');

class AuditBuilder {
  constructor(tx, options = {}) {
    this.tx = tx;
    this.actor_id = options.actor_id ?? null;
    this.actor_name = options.actor_name ?? null;
    this.metadata = options.metadata ? { ...options.metadata } : {};

    // Fields to be resolved/set
    this.target_id = null;
    this.target_type = null;
    this.target_name = null;

    this.subject_id = null;
    this.subject_type = null;
    this.subject_name = null;

    this.resource_id = null;
    this.resource_type = null;
    this.resource_name = null;
  }

  /**
   * Set target entity (the thing being changed)
   * @param {string} type - Target type: 'GRANT' | 'COLLECTION' | 'GROUP' | 'ACCESS_REQUEST' | etc.
   * @param {string} id - Target entity ID
   * @returns {AuditBuilder} For chaining
   */
  setTarget(type, id, name) {
    this.target_type = type;
    this.target_id = id;
    this.target_name = name ?? null;
    return this;
  }

  /**
   * Set subject entity (secondary entity: user added to group, dataset added to collection, etc.)
   * Resolves subject name and type from database.
   * @param {string} id - Subject ID
   * @returns {Promise<AuditBuilder>} For chaining
   */
  setSubject(id, type = null, name = null) {
    if (!id) return this;

    this.subject_id = id;
    if (type != null) {
      this.subject_type = type;
    }
    if (name != null) {
      this.subject_name = name;
    }

    return this;
  }

  /**
   * Set resource entity (affected resource: dataset, collection, etc.)
   * Resolves resource name and type from database.
   * @param {string} id - Resource ID
   * @returns {Promise<AuditBuilder>} For chaining
   */
  setResource(id, type = null, name = null) {
    if (!id) return this;

    this.resource_id = id;
    if (type != null) {
      this.resource_type = type;
    }
    if (name != null) {
      this.resource_name = name;
    }

    return this;
  }

  /**
   * Resolve and set actor_name if not already set
   * @returns {Promise<AuditBuilder>} For chaining
   */
  async resolveActorName() {
    if (!this.actor_name && this.actor_id) {
      this.actor_name = await resolveEntityName(this.tx, 'user', this.actor_id);
    }
    return this;
  }

  /**
   * Resolve and set target_name if not already set
   * @returns {Promise<AuditBuilder>} For chaining
   */
  async resolveTargetName() {
    if (!this.target_name && this.target_id && this.target_type) {
      this.target_name = await resolveEntityName(this.tx, this.target_type, this.target_id);
    }
    return this;
  }

  /**
   * Resolve and set subject_name and subject_type if not already set
   * @returns {Promise<AuditBuilder>} For chaining
   */
  async resolveSubject() {
    if (this.subject_id && (!this.subject_name || !this.subject_type)) {
      const subjects = await resolveSubjects(this.tx, [this.subject_id]);
      const subjectInfo = subjects.get(this.subject_id);
      if (subjectInfo) {
        this.subject_name = subjectInfo.name;
        this.subject_type = subjectInfo.type;
      }
    }
    return this;
  }

  /**
   * Resolve and set resource_name and resource_type if not already set
   * @returns {Promise<AuditBuilder>} For chaining
   */
  async resolveResource() {
    if (this.resource_id && (!this.resource_name || !this.resource_type)) {
      const resources = await resolveResources(this.tx, [this.resource_id]);
      const resourceInfo = resources.get(this.resource_id);
      if (resourceInfo) {
        this.resource_name = resourceInfo.name;
        this.resource_type = resourceInfo.type;
      }
    }
    return this;
  }

  /**
   * Merge event-specific metadata
   * @param {Object} fields - Key-value pairs to merge into metadata
   * @returns {AuditBuilder} For chaining
   */
  mergeMetadata(fields) {
    if (fields && typeof fields === 'object') {
      this.metadata = { ...this.metadata, ...fields };
    }
    return this;
  }

  /**
   * Build the audit record object (without creating it)
   * @returns {Object} Audit record data
   */
  _buildRecord() {
    const record = {
      actor_id: this.actor_id,
      actor_name: this.actor_name,
      target_type: this.target_type,
      target_id: this.target_id,
    };

    // Only include fields that are set (not null/undefined)
    if (this.target_name != null) {
      record.target_name = this.target_name;
    }
    if (this.subject_id != null) {
      record.subject_id = this.subject_id;
    }
    if (this.subject_name != null) {
      record.subject_name = this.subject_name;
    }
    if (this.subject_type != null) {
      record.subject_type = this.subject_type;
    }
    if (this.resource_id != null) {
      record.resource_id = this.resource_id;
    }
    if (this.resource_name != null) {
      record.resource_name = this.resource_name;
    }
    if (this.resource_type != null) {
      record.resource_type = this.resource_type;
    }

    // Include metadata if non-empty
    if (Object.keys(this.metadata).length > 0) {
      record.metadata = this.metadata;
    }

    return record;
  }

  /**
   * Create a single audit record
   * @param {PrismaTransaction} tx - Prisma transaction
   * @param {string} eventType - AUTH_EVENT_TYPE value
   * @returns {Promise<Object>} Created audit record
   */
  async create(tx, eventType) {
    // Ensure target name is resolved before creating
    await this.resolveTargetName();
    await this.resolveActorName();
    await this.resolveSubject();
    await this.resolveResource();

    const record = this._buildRecord();
    return tx.authorization_audit.create({
      data: {
        ...record,
        event_type: eventType,
      },
    });
  }

  /**
   * Create multiple audit records in batch
   * Each item can override subject/resource/metadata for that specific record
   * @param {PrismaTransaction} tx - Prisma transaction
   * @param {string} eventType - AUTH_EVENT_TYPE value
   * @param {Array<Object>} items - Array of item overrides: { subject_id?, resource_id?, metadata? }
   * @returns {Promise<Array>} Created audit records
   */
  async createBatch(tx, eventType, items) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    // Resolve all names upfront for efficiency
    await this.resolveTargetName();
    await this.resolveActorName();

    // Batch-resolve all subjects and resources mentioned in items
    const subjectIds = items.map((item) => item.subject_id).filter(Boolean);
    const resourceIds = items.map((item) => item.resource_id).filter(Boolean);

    const subjectMap = subjectIds.length > 0 ? await resolveSubjects(tx, subjectIds) : new Map();
    const resourceMap = resourceIds.length > 0 ? await resolveResources(tx, resourceIds) : new Map();

    // Build all records
    const records = items.map((item) => {
      const baseRecord = this._buildRecord();

      // Override subject if provided in item
      if (item.subject_id) {
        const subjectInfo = subjectMap.get(item.subject_id);
        if (subjectInfo) {
          baseRecord.subject_id = item.subject_id;
          baseRecord.subject_name = subjectInfo.name;
          baseRecord.subject_type = subjectInfo.type;
        }
      }

      // Override resource if provided in item
      if (item.resource_id) {
        const resourceInfo = resourceMap.get(item.resource_id);
        if (resourceInfo) {
          baseRecord.resource_id = item.resource_id;
          baseRecord.resource_name = resourceInfo.name;
          baseRecord.resource_type = resourceInfo.type;
        }
      }

      // Merge item-specific metadata
      if (item.metadata && typeof item.metadata === 'object') {
        baseRecord.metadata = { ...this.metadata, ...item.metadata };
      }

      return {
        ...baseRecord,
        event_type: eventType,
      };
    });

    // Create all records
    return tx.authorization_audit.createMany({
      data: records,
    });
  }
}

module.exports = AuditBuilder;
