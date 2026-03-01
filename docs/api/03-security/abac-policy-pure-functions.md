```
We want to define policies as pure functions. 

However, for the below use case

A dataset read is allowed if any of the following holds:

1. Subject belongs (directly or transitively) to the dataset’s owning group

2. Subject has an active grant to the dataset

3. Subject has an active grant to a collection containing the dataset

4. Groups that subject belongs to have an active grant to the dataset

5. Groups that subject belongs to have an active grant to any dataset collection this dataset belongs to.

6. Dataset is explicitly public



to implement this as a pure function, we need to retrieve 
1. all the groups user belongs to, all the grants of user, all the grants for each of the groups as user's attributes
2. all the collections of the dataset, all the grants of dataset, all the grants for each of the collections  as dataset's attributes.

This is a lot of data to fetch for an access check in a moderately large system.

But the same can be done efficiently in a single sql query on grants table.


Does keeping policies as pure functions is an misguided / Idealistic design?
```

The Pure Function Ideal vs. Reality
You're absolutely right - strict adherence to pure functions is impractical for complex, graph-based authorization like your dataset use case.

The Problem
Your dataset authorization requires:

Transitive group membership resolution
Grant inheritance through collections
Multi-level relationship traversal
Fetching all this data upfront to pass as "attributes" would:

Load massive amounts of data per request
Create N+1 query problems
Defeat the purpose of efficient authorization
Make the system unusable at scale


The Solution: Pragmatic Purity
Maintain the pure function interface but allow controlled impurity for complex queries:

- **Pragmatic purity**: Implement simple policies as pure functions; use query builders for complex graph-based authorization that requires database joins



### When to Use Each Approach

| Use Case | Approach | Example |
|----------|----------|---------|
| Simple attribute checks | Pure function | `user.role === 'admin'` |
| Direct ownership | Pure function | `user.id === resource.ownerId` |
| Transitive relationships | Query builder | Group membership hierarchies |
| Grant inheritance | Query builder | Collection-based permissions |
| Time-based rules | Pure function | `grant.expiresAt > now` |
| Bulk operations | Query builder | `GET /datasets` (list all) |



```
How about we standardize the return type of these policy queries, so that the entire query gets constructed with correct params set (user, resource, context) and returned from policy execution {result: null, needsQueryEvaluation: true, query: SQL}.  The calling code simply executes the query, and as the return type is standardized it is easy to interpret it.
```


### Policy Function Interface

All policy functions must adhere to a standardized interface to ensure consistency and interoperability:

**Function Signature:**
```javascript
(user, resource, context) => PolicyResult
```

**Parameters:**
- `user`: Object containing user attributes and permissions
- `resource`: Object representing the target resource with its attributes (may be null for bulk operations)
- `context`: Object containing environmental and request context information

**Return Type: PolicyResult**

```javascript
{
  // Evaluation outcome
  result: boolean | null,  // true=allow, false=deny, null=needs query evaluation
  
  // Query evaluation (when result is null)
  needsQueryEvaluation: boolean,
  query: Object | string | null,  // Prisma where clause, SQL string, or null
  queryType: 'prisma' | 'sql' | null,
  
  // Attribute filtering
  attributes: string[] | null,  // Notation.js patterns, or null for no filtering
  
  // Audit metadata
  reason: string,  // Human-readable explanation
  policyName: string,  // e.g., 'dataset.read'
  evaluatedConditions: string[]  // Which conditions were checked
}
```

**Return Type Examples:**

```javascript
// Simple allow
{
  result: true,
  needsQueryEvaluation: false,
  query: null,
  queryType: null,
  attributes: ['*'],
  reason: 'Dataset is public',
  policyName: 'dataset.read',
  evaluatedConditions: ['isPublic']
}

// Simple deny
{
  result: false,
  needsQueryEvaluation: false,
  query: null,
  queryType: null,
  attributes: null,
  reason: 'User not authenticated',
  policyName: 'dataset.read',
  evaluatedConditions: ['isAuthenticated']
}

// Query evaluation needed
{
  result: null,
  needsQueryEvaluation: true,
  query: { /* Prisma where clause */ },
  queryType: 'prisma',
  attributes: ['*', '!metadata.internal'],
  reason: 'Checking grant-based access',
  policyName: 'dataset.read',
  evaluatedConditions: ['hasComplexGrants']
}

// SQL query evaluation
{
  result: null,
  needsQueryEvaluation: true,
  query: 'SELECT 1 FROM datasets WHERE id = $1 AND ...',
  queryType: 'sql',
  attributes: ['id', 'name', 'description'],
  reason: 'Checking transitive group membership',
  policyName: 'dataset.read',
  evaluatedConditions: ['hasTransitiveAccess']
}
```


### Benefits of This Approach
1. Predictable interface: Every policy returns the same structure
2. Rich audit metadata: Built-in tracking of evaluation path
3. Type-safe: Easy to validate and document
4. Query transparency: Calling code knows exactly what to execute
5. Testable: Mock queries without executing them
6. Composable: Can combine multiple PolicyResults if needed