# Request Validation

Request validation ensures that incoming HTTP requests contain the expected data in the correct format. This feature uses [express-validator](https://express-validator.github.io/docs/) to validate the request's query parameters, route parameters, or body content. It helps enforce data integrity and prevents invalid or malicious data from propagating through the system. `express-validator` wraps the extensive collection of validators and sanitizers offered by [validator.js](https://github.com/validatorjs/validator.js).

Without this validation layer, developers would need to write repetitive and error-prone checks in every route handler, leading to cluttered and less maintainable code. By centralizing validation logic, this feature promotes clean, declarative, and reusable code.


## Benefits

- **Improved Code Quality**: Reduces repetitive validation code in route handlers.
- **Error Handling**: Centralizes validation error handling, making it easier to maintain.
- **Declarative Syntax**: Encourages a declarative approach to validation, improving readability.
- **Scalability**: Simplifies adding new routes with consistent validation logic.

## Usage Instructions

To use the validation feature, follow these steps:

1. Import the `validate` function and the necessary validation methods from `express-validator`.
2. Define the validation rules for the request's body, query, or params.
3. Wrap the validation rules with the `validate` function and include it as middleware in your route definition.
4. Handle the request in the route handler, assuming the data is already validated.

see the example [here](#using-validate).

## Comparison with different approaches

### Manual Validation

Manual validation involves writing custom logic directly in the route handler to check and sanitize incoming data. While this approach provides flexibility, it often leads to repetitive, error-prone code that can clutter route handlers and make them harder to maintain.

```javascript
app.post(
  '/user',
  (req, res) => {
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!utils.isEmail(req.body.username)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (req.body.password.length < 5) {
      return res.status(400).json({ error: 'Password must be at least 5 characters long' });
    }

    const age = parseInt(req.body.age, 10);
    if (isNaN(age) || age < 18) {
      return res.status(400).json({ error: 'Age must be a number greater than or equal to 18' });
    }

    User.create({
      username: req.body.username,
      password: req.body.password,
    }).then(user => res.json(user));
  },
);
```

### Using `express-validator`

By leveraging `express-validator`, you can define validation rules declaratively, reducing boilerplate code and improving readability.

```javascript
app.post(
  '/user',
  body('username').isEmail(),
  body('password').isLength({ min: 5 }),
  body('age').isInt({ min: 18 }).toInt(),
  (req, res) => {
    // Finds the validation errors in this request and wraps them in an object with handy functions
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    User.create({
      username: req.body.username,
      password: req.body.password,
      age: req.body.age,
    }).then(user => res.json(user));
  },
);
```

### Using `validate`

The `validate` function further simplifies the use of `express-validator` by wrapping validation rules and handling errors automatically. It returns a `400 Bad Request` response if validation fails, reducing the need for manual error handling in route handlers.

```javascript
const { validate } = require('middleware/validators');
const asyncHandler = require('middleware/asyncHandler');

app.post(
  '/user',
  validate([
    body('username').isEmail(),
    body('password').isLength({ min: 5 }),
    body('age').isInt({ min: 18 }).toInt()
  ]),
  asyncHandler(async (req, res) => {
    const user = await User.create({
      username: req.body.username,
      password: req.body.password,
      age: req.body.age,
    });
    res.json(user);
  }),
);
```

### Explanation of the Code

1. **Validation Rules**: The `body('username').isEmail()`, `body('password').isLength({ min: 5 })`, `body('age').isInt({ min: 18 }).toInt()` define the validation logic for the `username`, `password`,and `age` fields.
2. **`validate` Middleware**: Wraps the validation and sanitization rules and handles errors automatically, returning a `400 Bad Request` response if validation fails.
3. **Async Handler**: The `asyncHandler` middleware ensures proper error handling for asynchronous operations in the route handler.

By using the `validate` function, you can focus on implementing business logic in your route handlers while ensuring that all incoming data is valid and secure. Also ensures that correct error responses are sent back to the client when validation fails.


## Escaping Input with `.escape()`

**When to Use `.escape()`**

The `.escape()` method from Express Validator (which wraps [validator.js](https://github.com/validatorjs/validator.js)) converts characters like `<`, `>`, `&`, `'`, `"`, `` ` ``, `\`, and `/` into their HTML-safe equivalents. This is **only useful** when user input will be rendered directly into HTML **without proper escaping at the output stage**.

Use `.escape()` **only if all of the following are true**:

* The input will be **reflected into an HTML page** (e.g., admin dashboards, email templates).
* The rendering context is **not Vue** (or does not auto-escape output).
* You **cannot guarantee** that escaping will be applied at output time.

**When Not to Use `.escape()`**

Do **not** use `.escape()` for general-purpose input sanitation. It is **not appropriate** for:

* Inputs stored in a database
* Inputs used in business logic or APIs
* JSON APIs (Vue consumes JSON and already auto-escapes in templates)
* Vue 3 applications that use standard interpolation (`{{ }}`) and avoid `v-html`

Using `.escape()` unnecessarily can:

* Corrupt legitimate user input (e.g., names with `'` or `/`)
* Lead to double-escaping bugs
* Create inconsistency between what is stored and what is expected

**Vue 3 Note**:
If you're using Vue 3 and never use `v-html`, all interpolated variables are auto-escaped. There is **no need to pre-escape inputs on the backend**. Let Vue handle it.

**Rule of Thumb**: Escape at output, not at input—unless you control neither.



## More Examples

```javascript
const { validate } = require('middleware/validators');
const {
  query, param, body, checkSchema,
} = require('express-validator');


validate([
  // integer between 1 and 100
  query('limit').isInt({ min: 1, max: 100 }).toInt(), 

  // list of allowed values
  query('type').isIn(['RAW_DATA', 'DATA_PRODUCT']).optional(), 
  query('sort_order').default('desc').isIn(['asc', 'desc'])

  // boolean value with default
  // converts 'true' and 'false' strings to boolean
  query('deleted').toBoolean().default(false),

  // date in ISO8601 format
  query('created_at_start').isISO8601()

  // convert to BigInt
  body('du_size').optional().notEmpty().customSanitizer(BigInt)

  // Array & size limits
  body('datasets').isArray({ min: 1, max: 100 }),

  // validate objects in array
  body('datasets.*.name').notEmpty(),

  // String length
  body('name').optional().isLength({ min: 5 }),

  // Nested object validation
  body('metadata').isObject(),
  body('metadata.owner').isString().notEmpty(),
  body('metadata.tags').isArray({ min: 1 }),
  body('metadata.tags.*').isString().isLength({ min: 2 }),

  // Nested array of objects
  body('datasets.*.attributes').isArray({ min: 1 }),
  body('datasets.*.attributes.*.key').isString().notEmpty(),
  body('datasets.*.attributes.*.value').notEmpty(),
]),
```

## Examples of `checkSchema`

### Array of Objects

When validating an array of objects, you can use `checkSchema` to define the schema for each object in the array. This is useful when you want to validate multiple items in a single request.

```javascript
const { checkSchema } = require('express-validator');
const { validate } = require('middleware/validators');

const assoc_body_schema = {
  '*.source_id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Source ID must be an integer',
    },
    toInt: true,
  },
  '*.derived_id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Derived ID must be an integer',
    },
    toInt: true,
  },
  '*.meta': {
    in: ['body'],
    isObject: true,
    optional: true,
  },
  '*.meta.created_by': {
    in: ['body'],
    isString: true,
    optional: true,
  },
  '*.meta.tags': {
    in: ['body'],
    isArray: true,
    optional: true,
  },
  '*.meta.tags.*': {
    in: ['body'],
    isString: true,
    isLength: {
      options: { min: 2 },
      errorMessage: 'Each tag must be at least 2 characters',
    },
    optional: true,
  },
  '*.children': {
    in: ['body'],
    isArray: true,
    optional: true,
  },
  '*.children.*.id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Child ID must be an integer',
    },
    toInt: true,
    optional: true,
  },
  '*.children.*.name': {
    in: ['body'],
    isString: true,
    notEmpty: true,
    optional: true,
  },
};

validate([
  checkSchema(assoc_body_schema),
])
```

This schema validates the request body to adhere to the following format:
```json
[
  {
    "source_id": 1,
    "derived_id": 2,
    "meta": {
      "created_by": "alice",
      "tags": ["foo", "bar"]
    },
    "children": [
      { "id": 10, "name": "child1" },
      { "id": 11, "name": "child2" }
    ]
  },
  {
    "source_id": 3,
    "derived_id": 4
  }
]
```

### Nested Objects

When validating nested objects, you can use `checkSchema` to define the schema for each level of the object. This is useful when you want to validate complex data structures.

```javascript
const { checkSchema } = require('express-validator');
const { validate } = require('middleware/validators');

const log_process_schema = {
  workflow_id: { notEmpty: true },
  pid: { notEmpty: true, isInt: true, toInt: true },
  task_id: { notEmpty: true },
  step: { notEmpty: true },
  hostname: { notEmpty: true },
  details: {
    isObject: true,
    optional: true,
  },
  'details.started_at': {
    isISO8601: true,
    optional: true,
  },
  'details.resources': {
    isObject: true,
    optional: true,
  },
  'details.resources.cpu': {
    isInt: { options: { min: 1 } },
    toInt: true,
    optional: true,
  },
  'details.resources.memory': {
    isInt: { options: { min: 128 } },
    toInt: true,
    optional: true,
  },
  'details.logs': {
    isArray: true,
    optional: true,
  },
  'details.logs.*.type': {
    isString: true,
    notEmpty: true,
    optional: true,
  },
  'details.logs.*.message': {
    isString: true,
    notEmpty: true,
    optional: true,
  },
};

validate([
  checkSchema(log_process_schema),
])
```
This schema validates the request body to adhere to the following format:
```json
{
  "workflow_id": 1,
  "pid": 1234,
  "task_id": "task_1",
  "step": "step_1",
  "hostname": "localhost",
  "details": {
    "started_at": "2024-06-01T12:00:00Z",
    "resources": {
      "cpu": 4,
      "memory": 2048
    },
    "logs": [
      { "type": "info", "message": "Started" },
      { "type": "error", "message": "Something failed" }
    ]
  }
}
```