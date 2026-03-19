# Users & Projects Feature

**Feature Scope:** User management, authentication, authorization, and project organization.

**Status:** Core Platform Feature

---

## Users

### User Model

```prisma
model user {
  id         Int       @id @default(autoincrement())
  username   String    @unique
  email      String?   @unique
  first_name String?
  last_name  String?
  role       String    // "admin", "operator", "user"
  is_active  Boolean   @default(true)
  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt
}
```

### Roles

#### Admin
- Full system access
- Can manage users and roles
- Can configure system settings
- Can access all projects and data

#### Operator
- Can manage workflows and conversions
- Can upload and stage datasets
- Can access assigned projects
- Cannot manage users or system settings

#### User
- Read-only access to assigned projects
- Can view and download data
- Cannot modify datasets or run workflows

---

## Authentication

### JWT-Based Authentication
1. User logs in with username/password
2. API validates credentials
3. API issues JWT token
4. Token stored in httpOnly cookie
5. Client sends cookie with each request
6. API middleware validates token

### Authorization Pattern

**Use helper methods, not direct role checks:**

```javascript
// ✅ CORRECT
if (auth.canAdmin) {
  // Admin-only logic
}

if (auth.canOperate) {
  // Operator or Admin logic
}

// ❌ WRONG
if (auth.hasRole(['admin'])) { }
if (auth.hasRole(['admin', 'operator'])) { }
```

---

## Projects

### Project Model

```prisma
model project {
  id          Int               @id @default(autoincrement())
  name        String
  description String?
  owner_id    Int
  owner       user              @relation(fields: [owner_id], references: [id])
  datasets    project_dataset[]
  members     project_member[]
  created_at  DateTime          @default(now())
  updated_at  DateTime          @updatedAt
}
```

### Project Access Control

#### Ownership
- Project owner has full control
- Can add/remove members
- Can delete project

#### Membership
```prisma
model project_member {
  id         Int     @id @default(autoincrement())
  project_id Int
  user_id    Int
  role       String  // "owner", "editor", "viewer"
  project    project @relation(fields: [project_id], references: [id])
  user       user    @relation(fields: [user_id], references: [id])
  
  @@unique([project_id, user_id])
}
```

**Roles:**
- `owner` - Full control (same as project owner)
- `editor` - Can add/modify datasets, run workflows
- `viewer` - Read-only access

---

## API Endpoints

### Users
- `GET /users` - List users (admin only)
- `GET /users/:username` - Get user details
- `POST /users` - Create user (admin only)
- `PUT /users/:username` - Update user
- `DELETE /users/:username` - Delete user (admin only)

### Projects
- `GET /projects` - List accessible projects
- `GET /projects/:id` - Get project details
- `POST /projects` - Create project
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project
- `POST /projects/:id/members` - Add project member
- `DELETE /projects/:id/members/:user_id` - Remove member

---

## Access Control Pattern

### User-Specific Endpoints
```javascript
// Pattern: /:username/resource
router.get(
  '/:username/datasets',
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res) => {
    const username = req.params.username;
    
    // Ownership check happens in middleware
    const datasets = await prisma.dataset.findMany({
      where: { user: { username } }
    });
    
    res.json({ datasets });
  })
);
```

---

**Last Updated:** 2026-01-16

