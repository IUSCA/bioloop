Admin/Operator role - can create w/out Project
- Dataset should not be assigned to any Projects
- Dataset should be assigned to any Projects

User - cannot create without Project

User - 
- cannot select from Projects that are not assigned to them
- cannot select Datasets from Projects that are not assigned to them
- Project is disabled by default, if user has no Projects
- Dataset should be assigned
- Project is created
- Dataset belongs to Project
- User belongs to Project
- Users only being able to select Datasets they have access to

All role cases:
- No Projects available to choose from
- No Dataseets available to choose from
- clearning source Raw Data when Project is cleared
- Dataset / Project fields being disabled (test if they also get cleared)
- Next / Previous not being enabled until form validation passes
- Form validations
  - Wrong/invalid Dataset name being typed
  - Dataset name already exists
