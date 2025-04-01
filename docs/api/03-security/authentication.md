# Authentication

The API uses IU CAS authnetication model. 

<img src="/api_auth.png" >

All the routes and sub-routers added after the [`authenticate`](src/middleware/auth.js) middleware in [index router](src/routes/index.js) require authentication. The routes that do not require authentication such as [auth routes](src/routes/auth.js) are added before this.

The [`authenticate`](src/middleware/auth.js) middleware, parses the `Authorization` header for the bearer token and cryptographically verifies the JWT. If the JWT is deemed valid, the payload is decoded and added to the request as `req.user`

To add authentication to a single route:
```javascript
const { authenticate } = require('../middleware/auth');

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  const user = await userService.findActiveUserBy('username', req.user.username);
  // ...
}))
```