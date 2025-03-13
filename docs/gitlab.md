# Gitlab Setup 

We'll need to generate a personal token and setup our local dev to use that token to avoid having to enter authorization everytime.

## Personal Token

Create a project access token. (https://git.sca.iu.edu/help/user/project/settings/project_access_tokens.md)

- On the left sidebar, select Search or go to and find your project.
- Select Settings > Access tokens.
- Select Add new token.
- Enter a name. The token name is visible to any user with permissions to view the project.
- Enter an expiry date for the token.
  - The token expires on that date at midnight UTC. A token with the expiration date of 2024-01-01 expires at 00:00:00 UTC on 2024-01-01.
  - If you do not enter an expiry date, the expiry date is automatically set to 30 days later than the current date.
  - By default, this date can be a maximum of 365 days later than the current date.
  - An instance-wide maximum lifetime setting can limit the maximum allowable lifetime in self-managed instances.
- Select a role for the token.
- Select the desired scopes.
- Select Create project access token.


## Setup local to use Token


git remote set-url origin https://<username>:<personal_access_token>@git.sca.iu.edu/<your_username or organization_name>/<repo_name>.git