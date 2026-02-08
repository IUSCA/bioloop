# Attribute-Based Access Control (ABAC) Design Document

## Overview

Attribute-Based Access Control (ABAC) is a flexible authorization model that determines access permissions based on attributes associated with users, resources, and environmental context. This document outlines the design and implementation strategy for ABAC within the Bioloop system.

## Introduction

Access control decisions in ABAC are made by evaluating attributes from three primary sources:

- **User attributes**: examples: Role, department, clearance level
- **Resource attributes**: examples: Owner ID, visibility settings, classification
- **Environmental attributes**: examples: Request timestamp, IP address, location

A policy defines the rules that determine whether a specific action is permissible on a resource by a user within a given context.

## Key Features

The ABAC implementation provides the following capabilities:

- **Resource-specific policy organization**: Policies are isolated and organized by resource type
- **Built-in auditing**: All access decisions are logged for compliance and monitoring
- **Static analysis enforcement**: ESLint rules enforce naming conventions and structural requirements
- **Field-level authorization**: Granular attribute disclosure control using [Notation.js](https://www.npmjs.com/package/notation)
- Policy-aware query builders for efficient data retrieval


## Design Principles and Best Practices

### 1. Normalize Attribute Semantics

To ensure consistency and maintainability across the system:

- **Establish naming conventions**: Implement agreed-upon naming styles for all attributes
- **Centralize attribute vocabulary**: Maintain a unified registry of:
  - User attributes (roles, departments, permissions)
  - Resource attributes (ownership, visibility, classification)
  - Environmental attributes (time, location, device context)
  - Available actions (read, write, delete, share)
- **Treat attributes as first-class data**: Avoid ad-hoc JSON fields in favor of properly defined attribute structures
- **Document attribute sources**: Clearly define the origin and lifecycle of attribute values:
  - **User attributes**: Populated during user creation and profile updates
  - **Resource attributes**: Derived from database schema, worker processes, and operator actions
  - **Context attributes**: Collected via middleware and reverse-proxy infrastructure

### 2. Policy Granularity and Composition

Design policies using functional composition principles:

- **Pure function approach**: Implement policies as composable, pure functions
- **Maintain readability**: Keep individual policy components simple and well-documented
- **Enable testing**: Ensure each policy component can be independently tested

**Example implementation:**

```javascript
const isOwner = (user, res) => user.id === res.ownerId;
const sameDept = (user, res) => user.department === res.owner.department;
const canRead = or(isOwner, sameDept, (u, r) => r.visibility === 'public');
```

### 3. Version Control and Testing Strategy

Treat policies as critical code components:

- **Unit testing requirement**: Each policy file must include comprehensive unit tests to prevent silent regressions
- **Version control integration**: Store all policies in version control for change tracking and rollback capabilities
- **Continuous integration**: Include policy validation in the CI/CD pipeline

### 4. Separate policy evaluation from data retrieval

- **Pure function design**: Avoid database or API calls within policy functions
- **Query builder pattern**: For bulk operations, implement policies as query builders that generate efficient database queries rather than fetching all resources for individual evaluation.

### 5. Comprehensive Audit Logging

Maintain detailed audit trails for all access decisions:

- **Decision tracking**: Log every access attempt with its outcome
- **Attribute visibility**: Record which attributes influenced each decision
- **Policy identification**: Track which specific policy rules were applied

**Example audit log entry:**

```javascript
log.info({
  actor: user.id,
  action,
  resource: { model, id },
  decision: allowed ? 'ALLOW' : 'DENY',
  policyVersion: currentVersion
});
```

### 6. Governance and Maintenance

Establish regular review processes:

- **Quarterly policy reviews**: Schedule regular assessments to:
  - Remove unused or obsolete policies
  - Consolidate duplicate or overlapping rules
  - Validate attribute definitions against current data models
- **Documentation updates**: Maintain current documentation as policies evolve
- **Performance monitoring**: Track policy evaluation performance and optimize as needed


## Architectural Decisions

### Policy Storage Strategy

A critical architectural decision involves choosing between code-based policies and database-stored domain-specific language (DSL) policies.

#### Option A: Policies as Code

**Advantages:**
- **Flexibility**: Implement policies as JavaScript functions with full language capabilities
- **Composition support**: Easy to compose complex logic using functional programming patterns
- **Testing integration**: Straightforward unit testing using existing test frameworks
- **Version control**: Native Git integration for change tracking and collaboration
- **Developer workflow**: Familiar development patterns and tooling

**Limitations:**
- **Runtime modification**: Policies cannot be modified through administrative interfaces without code deployment
- **Non-technical user access**: Requires technical knowledge to modify policies

#### Option B: Policies as Database DSL

**Advantages:**
- **Declarative approach**: Policies expressed in a structured, declarative format
- **Runtime modification**: Administrative users can update policies through UI interfaces
- **Non-technical accessibility**: Business users can potentially modify simple policies

**Limitations:**
- **Expressiveness constraints**: Limited to the capabilities of the chosen DSL framework
- **Complexity overhead**: Requires additional infrastructure for DSL parsing and evaluation
- **Version management**: Requires custom versioning mechanisms outside of standard source control
- **Testing complexity**: More complex to unit test compared to plain JavaScript functions

**Recommendation:** Based on the system requirements for flexibility and developer productivity, the code-based approach is recommended for the initial implementation.

## Implementation Specification

### Policy Function Interface

All policy functions must adhere to a standardized interface to ensure consistency and interoperability:

**Function Signature:**
```javascript
(user, resource, context) => boolean | Query | Attributes
```

**Parameters:**
- `user`: Object containing user attributes and permissions
- `resource`: Object representing the target resource with its attributes
- `context`: Object containing environmental and request context information

**Return Types:**
- `boolean`: Simple allow/deny decision
- `Query`: Database query object for bulk operations
- `Attributes`: Filtered attribute set for field-level authorization

### File Organization

Policies are organized by resource type to maintain clear separation of concerns:

**Directory Structure:**
```
authorization/
├── policies/
│   ├── user.js
│   ├── project.js
│   ├── dataset.js
│   └── workflow.js
├── utils/
│   ├── combinators.js
│   └── validators.js
└── tests/
    ├── user.test.js
    ├── project.test.js
    └── integration.test.js
```

**File Naming Convention:** `{resource_name}.js`

### Middleware Integration

The ABAC middleware component provides seamless integration with the application's request processing pipeline:

**Key Responsibilities:**
- Extract user, resource, and context attributes from incoming requests
- Route requests to appropriate policy evaluators
- Log access decisions for audit purposes
- Handle policy evaluation errors gracefully
- Integrate with existing authentication mechanisms

**Integration Points:**
- Express.js middleware stack
- Database query interceptors
- API route protection
- WebSocket connection authorization

### Testing Strategy

Each policy module requires comprehensive test coverage:

**Test Categories:**
- **Unit tests**: Individual policy function validation
- **Integration tests**: End-to-end access control scenarios
- **Performance tests**: Policy evaluation speed and efficiency
- **Security tests**: Attempt to bypass authorization controls

**Test Organization:**
- Mirror the policy directory structure in the test directory
- Include both positive and negative test cases
- Test edge cases and boundary conditions
- Validate audit log generation


### Example

```javascript
export const meta = {
  model: 'post',
  version: '1.0.0',
  description: 'Policies for Post resource'
};

// these functions return a boolean
export const actions = {
    create: (user, post, ctx={}) {},
    update: (user, post, ctx={}) {},
    read: (user, post, ctx={}) {},
    delete: (user, post, ctx={}) {}
}


export const queries = {
    // these functions return prisma where json
    readQuery: (user, post, ctx={}) {},
    searchQuery: (user, post, ctx={}) {},

    // these functions return parameterized SQL templates
    readSQL: (user, post, ctx={}) {},
    searchSQL: (user, post, ctx={}) {},
}

export const attributes = {
    readAttributes: (user, post) => {
        if (user.role === 'admin') return ['*'];
        if (user.id === post.ownerId) return ['*', '!ownerId'];
        if (post.visibility === 'department') return ['*', '!ownerId', '!content.draftNotes'];
        return ['id', 'title', 'visibility']; // minimal public view
      }
}
```

Usages:
- As a middleware to protect API endpoints
- As a simple function that returns whether access is allowed
- As a query builder

Middleware example:
```javascript
const authorize = require('path/to/abac/middleware');
const isPermittedTo = authorize('post')

router.get('/posts/:id', isPermittedTo('read'), async (req, res) => {
  const postId = req.params.id;
  const post = await db.post.findUnique({ where: { id: postId } });
  res.json(req.permission.filter(post));
});
```

Evaluation example:
```javascript
const authorize = require('path/to/abac/evaluator');

router.get('/posts/:id', async (req, res) => {
  const postId = req.params.id;
  const post = await db.post.findUnique({ where: { id: postId } });

  const permission = authorize('post', 'read')(req.user, post);
  if (!permission.granted) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(permission.filter(post));
});
```

Query builder example:
```javascript
const authorize = require('path/to/abac/queryBuilder');
router.get('/posts', async (req, res) => {
  const permission = authorize('post', 'listQuery')(req.user);
  if(!permission.granted) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const posts = await db.post.findMany({ where: {
    AND: [permission.query, { published: req.query.published || true }]
  } });
  res.json(posts.map(post => permission.filter(post)));
});
```
