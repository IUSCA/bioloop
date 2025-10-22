# Bioloop Access Control Design Discussion

This document summarizes the current access control implementation in **Bioloop**, the hierarchical **Group** design, the suggested shift toward **tag/attribute-based** access models, and their implications.  
It contains sufficient detail for an AI agent or developer to continue this conversation or guide future architectural decisions.

---

## 1. Current State

### 1.1 RBAC Implementation
Bioloop currently implements **Role-Based Access Control (RBAC)** using the [`accesscontrol`](https://www.npmjs.com/package/accesscontrol) library.

- Roles: `admin`, `operator`, and `user`
- Each role has resource-based permissions:  
  e.g., `datasets`, `projects`, `workflow`, `alerts`, etc.
- Permissions defined via grantsObject, e.g.:
  ```js
  'read:any': ['*'],
  'update:own': ['*']
  ```
- Access is coarse-grained and resource-scoped (e.g., `read`, `update`, `delete`).

### 1.2 Group Hierarchy (Tree-like)
Groups are represented by a hierarchical schema:
```prisma
model group {
  id          Int             @id @default(autoincrement())
  name        String          @unique
  description String?
  parent_id   Int?
  ...
  parent      group?          @relation("group_hierarchy", fields: [parent_id], references: [id], onDelete: Cascade)
  children    group[]         @relation("group_hierarchy")
  users       group_user[]
  projects    group_project[]
}
```

#### Recursive Access Function
A recursive CTE retrieves all groups a user can access (direct + descendant groups):

```sql
WITH RECURSIVE accessible_groups AS (
  SELECT g.id, g.name, g.parent_id
  FROM "group" g
  INNER JOIN group_user gu ON g.id = gu.group_id
  WHERE gu.user_id = ${user_id}

  UNION
  SELECT g.id, g.name, g.parent_id
  FROM "group" g
  INNER JOIN accessible_groups ag ON g.parent_id = ag.id
)
SELECT DISTINCT id FROM accessible_groups;
```

This provides **top-down inheritance**:  
membership in a parent implies access to all child groups.

---

## 2. Reviewer Suggestion

During code review, it was suggested that hierarchical (tree-like) group systems may **not be ideal** for this use case. Instead, a **tag + attribute** model should be considered.

They proposed:
- Think of groups more like *tags* (flat, non-hierarchical)
- Add *attributes* to govern finer-grained access to subsets of a resource
- Possibly use an **RBAC + ABAC hybrid** or **policy engine** that supports such logic

---

## 3. Tree-Like Group Systems

### ✅ Advantages
- **Intuitive representation**: mirrors organizational hierarchy  
  (e.g., Biology → Sequencing → RNA-Seq)
- **Inherited permissions**: parent membership automatically grants access to children
- **Delegation-friendly**: easy to delegate access down the tree
- **Predictable relationships**: hierarchical traversal via recursion

### ❌ Disadvantages
- **Rigid structure**: real-world access doesn’t always fit strict hierarchies
- **Maintenance burden**: re-parenting or renaming affects entire subtrees
- **Complex queries**: recursive CTEs can become expensive and error-prone
- **Ambiguous conflicts**: conflicting permissions between ancestors/descendants
- **No contextual logic**: cannot express conditions like “datasets funded by NIH” or “samples from Human subjects only”

---

## 4. Tag + Attribute Model

### 4.1 Tag Concept
Tags are simple labels assigned to users or resources.

- A “Group” can effectively be treated as a **tag**
- Example:
  - Project `A` tagged: `human`, `RNASeq`, `IU`
  - User `X` has tags: `human`, `IU`
- Access is granted if user tags overlap with resource tags.

This **eliminates hierarchies** and simplifies many-to-many relationships.

### 4.2 Attribute Concept
Attributes are **key–value pairs** describing properties of users or resources.

Examples:
- User attributes: `{ department: "Genomics", clearance: "High" }`
- Dataset attributes: `{ sensitivity: "High", department: "Genomics" }`

A rule might read:
> “Allow access if `user.department == dataset.department` and `user.clearance >= dataset.sensitivity`.”

This enables **contextual**, **rule-driven** authorization instead of structural inheritance.

---

## 5. RBAC vs ABAC vs Hybrid (Tag + Attribute)

| Model | Controlled By | Example Rule | Pros | Cons |
|--------|----------------|---------------|--------|--------|
| **RBAC** | Roles and permissions | “Operators can delete datasets.” | Simple, well-known | Coarse, static |
| **ABAC** | User/resource attributes | “Allow if user.department == dataset.department.” | Very flexible | Harder to debug/audit |
| **Tag-based** | Shared tags between user and resource | “Access if project has tag that user owns.” | Simple ABAC form | Needs consistent tagging |
| **Hybrid RBAC+ABAC** | Roles + attributes | “Operators can access datasets *only* if project.tag=‘internal’.” | Context-aware + structured | More policy complexity |

---

## 6. Relation to Reviewer’s Comment

Given:
- They discouraged hierarchical groups
- They emphasized “tags + attributes”
- They mentioned open-source RBAC/ABAC systems

It is **very likely (~90%)** that they were referring to a **hybrid RBAC + ABAC** model:
> “Move away from hierarchical group membership and toward tag/attribute-based contextual access.”

This would allow flexible access such as:
- Show only *some* datasets within a project based on tags/attributes.
- Implement policies like *“Only users with tag=‘human’ can see Human datasets”*.

---

## 7. Potential Open Source Solutions

| Library / Framework | Type | Language | Description |
|----------------------|------|-----------|--------------|
| **[Casbin](https://casbin.org/)** | RBAC + ABAC hybrid | Node / Go / Python | Supports both role and attribute-based policies; efficient; declarative policy model. |
| **[Oso](https://www.osohq.com/)** | ABAC policy engine | Node / Python / Rust | Expressive “policy-as-code” with clear syntax (`allow(user, action, resource)` rules). |
| **[Cedar](https://www.cedarpolicy.com/)** | ABAC policy language | Used by AWS | Declarative and verifiable attribute-based policies. |
| **OpenFGA / Zanzibar** | Relationship-based (graph) | Go | Scalable model for complex graph-style permissions. |
| **Permit.io / AuthZed** | Hybrid hosted APIs | Multi-language | Managed RBAC/ABAC systems for production environments. |

Casbin or Oso are the most practical for Bioloop since they integrate easily with Node.js.

---

## 8. Recommended Transition Path

1. **Flatten Groups**  
   Remove `parent_id` and the recursive hierarchy.
2. **Add Tags or Attributes**
   - `project.tags` or `project.attributes` JSON
   - `user.attributes` JSON
3. **Policy Layer**
   - Introduce Casbin/Oso-based evaluator:
     ```js
     allow(user, "read", dataset) if user.department == dataset.department;
     ```
4. **Hybridize Gradually**
   - Keep RBAC for role permissions (`admin`, `operator`, `user`)
   - Use ABAC (attributes/tags) for contextual visibility.
5. **Schema Example**
   ```prisma
   model project {
     id          String @id @default(uuid())
     name        String
     tags        String[] // or JSON
     attributes  Json?
   }

   model user {
     id          Int @id @default(autoincrement())
     username    String
     attributes  Json? // e.g., {"department": "Genomics"}
   }
   ```
6. **Policy Evaluation Flow**
   - Fetch user + resource attributes
   - Evaluate against defined Casbin/Oso policies
   - Apply only to resources meeting tag/attribute conditions.

---

## 9. Why Attribute-Based Access is Useful Here

- Allows partial exposure of data (specific datasets within a project)
- Avoids rigid hierarchies while preserving flexibility
- Easier to evolve as Bioloop adds new resource types (datasets, bundles, workflows)
- Enables richer policy logic: funding source, data sensitivity, project phase, etc.

---

## 10. Summary

| Aspect | Hierarchical Groups | Tag + Attribute (ABAC) |
|--------|----------------------|------------------------|
| Structure | Tree / recursive | Flat, contextual |
| Access logic | Inherited membership | Conditional matching |
| Scalability | Harder (recursive joins) | Easier (flat queries) |
| Expressiveness | Limited | High |
| Use case fit (Bioloop) | OK for org-level grouping | Better for resource-level policies |

---

## 11. Next Steps for Discussion

- Define what *attributes* are relevant in Bioloop (e.g., dataset type, lab, funding).
- Choose policy framework: Casbin vs Oso.
- Explore hybrid enforcement model:
  - RBAC (role → CRUD)
  - ABAC (attribute/tag → scope/filter)
- Draft example policies and schema changes.

---

**End of Document**
