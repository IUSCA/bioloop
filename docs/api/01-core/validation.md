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

]),
```