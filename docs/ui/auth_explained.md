# Auth Explained

## Objectives for Auth module
1. Enable users to authenticate with IU CAS, which will create a session.
2. After logging in, redirect users to the URL they originally requested.
3. Allow users to revisit the app without having to log in again within a certain period of time.
4. If the session expires between visits, the user will be required to authenticate again.
5. Ensure that the session does not expire as long as the user remains active on the app.

## Overview of Auth Flow
<img src="/ui/assets/auth-overview-2.png" style="max-width: 75%;" class="center">

refer to https://kb.iu.edu/d/bfpq

## Vue App Code Execution Order
<img src="/ui/assets/app-load.png" style="max-width: 75%;" class="center">

## Route Navigation Guard Logic
<img src="/ui/assets/navigation-guard-logic.png" style="max-width: 90%;" class="center">

## Login Code flow - Before IU Login
<img src="/ui/assets/login-flow-before-cas.png" style="max-width: 75%;" class="center">

## Login Code flow - After IU Login
<img src="/ui/assets/login-flow-after-cas-return.png" style="max-width: 75%;" class="center">

## Code flow for a Revisiting (logged in) User
<img src="/ui/assets/logged-in-flow.png" style="max-width: 75%;" class="center">

## Code flow for token refresh
On login / initialize, the auth store creates a timer that will invoke `refreshToken` function five minutes (configurable) before the current token expires. `refreshToken` requests API for a new token. Once the API responds with a new token and user profile data, `refreshToken` invokes `onLogin`, which updates the user and token refs and stores them in the local storage.

## Cache Invalidation

Using caches to store data can improve the speed of an application and reduce code complexity. However, if the data is modified, both the cache and the database must be updated in a single transaction; otherwise, the cached data becomes stale.

In the Auth module, there are two caches: the first is the local storage of the user's browser, which the app uses to retrieve the user's information without making an API call. The second cache is the token itself, which is included with every request and contains information that the API uses to perform role-based authorization without needing to query the database for the user's information on every incoming request.

The Write-Through cache strategy is an appropriate approach to update the user data stored in the local storage. When a component needs to update the user data, it invokes a auth store method that requests API. If the API responds with success message it updates the local storage. If the API request fails, the cache is not updated and error is propogated to the component. The component can then choose to retry the request or display an error message to the user.

When data encoded in the token is updated through an API request, a new token is created and returned to the UI as one of the headers in the response. The UI should retrieve this header and use the new token to replace the old token stored in the local storage. In this approach, data consistency is not gauarnteed, as the response may not reach the UI or the UI code encounters an error while processing. For this reason, it's important to include only minimal and seldom updated data in the token.

<style>
  .center {
    display: block;
    margin-left: auto;
    margin-right: auto;
  }
</style>