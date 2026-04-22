[Skip to main content](https://clerk.com/docs/reference/backend/types/auth-object#main)

# Auth object

1. [How to access the `Auth` object](https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object)
2. [Session properties](https://clerk.com/docs/reference/backend/types/auth-object#session-properties)
1. [`has()`](https://clerk.com/docs/reference/backend/types/auth-object#has)
2. [`getToken()`](https://clerk.com/docs/reference/backend/types/auth-object#get-token)
3. [`Auth` object example without Active Organization](https://clerk.com/docs/reference/backend/types/auth-object#auth-object-example-without-active-organization)
4. [`Auth` object example with Active Organization](https://clerk.com/docs/reference/backend/types/auth-object#auth-object-example-with-active-organization)
5. [`Auth` object example with valid factor age](https://clerk.com/docs/reference/backend/types/auth-object#auth-object-example-with-valid-factor-age)
6. [`Auth` object example of a user without an MFA method registered](https://clerk.com/docs/reference/backend/types/auth-object#auth-object-example-of-a-user-without-an-mfa-method-registered)
7. [Machine properties](https://clerk.com/docs/reference/backend/types/auth-object#machine-properties)
8. [`Auth` object example of a machine request](https://clerk.com/docs/reference/backend/types/auth-object#auth-object-example-of-a-machine-request)

Copy as markdownMarkdownCopy as markdown

[Open inOpen in ChatGPTOpenAI](https://chatgpt.com/?q=Read+https%3A%2F%2Fclerk.com%2Fdocs%2Freference%2Fbackend%2Ftypes%2Fauth-object.md&hints=search)

The `Auth` object contains important information like the current user's session ID, user ID, and Organization ID. It also contains methods to check for Permissions and retrieve the current user's session token.

Note

The structure of the `Auth` object varies depending on the type of request.
For machine-authenticated requests (e.g. using an API key or OAuth token), the object reflects machine-level authentication data instead of user session details.

If you're working with machine-authenticated requests, refer to the [Machine properties section](https://clerk.com/docs/reference/backend/types/auth-object#machine-properties) for a detailed breakdown.

## [How to access the `Auth` object](https://clerk.com/docs/reference/backend/types/auth-object\#how-to-access-the-auth-object)

The `Auth` object is available on the `request` object in server contexts. Some frameworks provide a helper that returns the `Auth` object. See the following table for more information.

| Framework | How to access the `Auth` object |
| --- | --- |
| Next.js App Router | [auth()](https://clerk.com/docs/reference/nextjs/app-router/auth) |
| Next.js Pages Router | [getAuth()](https://clerk.com/docs/reference/nextjs/pages-router/get-auth) |
| Astro | [locals.auth()Astro Icon](https://clerk.com/docs/reference/astro/locals#locals-auth) |
| Express | [`req.auth`](https://clerk.com/docs/reference/express/overview) |
| Fastify | [getAuth()Fastify Icon](https://clerk.com/docs/reference/fastify/get-auth) |
| Nuxt | [event.context.auth()Nuxt.js Icon](https://clerk.com/docs/reference/nuxt/overview#auth-object) |
| React Router | [getAuth()React Router Icon](https://clerk.com/docs/reference/react-router/get-auth) |
| TanStack React Start | [auth()Tanstack Start Icon](https://clerk.com/docs/reference/tanstack-react-start/auth) |
| Other | `request.auth` |

## [Session properties](https://clerk.com/docs/reference/backend/types/auth-object\#session-properties)

- Name`actor`Type`ActClaim | undefined`Description





Holds identifier for the user that is impersonating the current user. Read more about [impersonation](https://clerk.com/docs/guides/users/impersonation).

- Name`debug`Type`AuthObjectDebug`Description





Used to help debug issues when using Clerk in development.

- Name`factorVerificationAge`Type`[number, number] | null`Description





An array where each item represents the number of minutes since the last verification of a first factor⁠ or second factor⁠: `[firstFactorAge, secondFactorAge]`.

- Name[`getToken()`](https://clerk.com/docs/reference/backend/types/auth-object#get-token)Type`ServerGetToken`Description





A function that gets the current user's [session token](https://clerk.com/docs/guides/sessions/session-tokens) or a [custom JWT template](https://clerk.com/docs/guides/sessions/jwt-templates).

- Name[`has()`](https://clerk.com/docs/reference/backend/types/auth-object#has)Type`(isAuthorizedParams: CheckAuthorizationParamsWithCustomPermissions) => boolean`Description





A function that checks if the user has an Organization Role or custom Permission.

- Name`orgId`Type`string | undefined`Description





The ID of the user's Active Organization⁠.

- Name`orgPermissions`Type`OrganizationCustomPermissionKey[] | undefined`Description





The current user's Active Organization⁠ permissions.

- Name`orgRole`Type`OrganizationCustomRoleKey | undefined`Description





The current user's Role in their Active Organization⁠.

- Name`orgSlug`Type`string | undefined`Description





The URL-friendly identifier of the user's Active Organization⁠.

- Name`sessionClaims`Type`JwtPayload`Description





The current user's [session claims](https://clerk.com/docs/guides/sessions/session-tokens).

- Name`sessionStatus`Type`'active' | 'pending'`Description





The current state of the session.

- Name`sessionId`Type`string`Description





The ID of the current session.

- Name`tokenType`Type`'session_token'`Description





The type of request to authenticate.

- Name`userId`Type`string`Description





The ID of the current user.


### [`has()`](https://clerk.com/docs/reference/backend/types/auth-object\#has)

The `has()` helper can be used to do two types of checks:

- **Authorization:** Check if the user has been granted a specific type of access control (Role, Permission, Feature, or Plan) and returns a boolean value. For examples, see the [guide on verifying if a user is authorized](https://clerk.com/docs/guides/secure/authorization-checks).
- **Reverification:** Check if the user has verified their credentials within a certain time frame and returns a boolean value. For examples, see the [guide on reverification](https://clerk.com/docs/guides/secure/reverification).

```
function has(isAuthorizedParams: CheckAuthorizationParamsWithCustomPermissions): boolean
```

#### [`CheckAuthorizationParamsWithCustomPermissions`](https://clerk.com/docs/reference/backend/types/auth-object\#check-authorization-params-with-custom-permissions)

`CheckAuthorizationParamsWithCustomPermissions` has the following properties:

- Name`role`Type`string`Description





The [Role](https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions) to check for.

- Name`permission`Type`string`Description





The [Permission](https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions) to check for.

- Name`feature`Type`string`Description





The [Feature](https://clerk.com/docs/guides/billing/overview) to check for.

- Name`plan`Type`string`Description





The [Plan](https://clerk.com/docs/guides/billing/overview) to check for.

- Name`reverification?`Type`ReverificationConfig`Description





The reverification configuration to check for. This feature is currently in public beta. **It is not recommended for production use**.


##### `ReverificationConfig`

```
type ReverificationConfig =
  | SessionVerificationTypes
  | {
      level: SessionVerificationLevel
      afterMinutes: SessionVerificationAfterMinutes
    }

type SessionVerificationTypes = 'strict_mfa' | 'strict' | 'moderate' | 'lax'
```

The `ReverificationConfig` type has the following properties:

- Name`strict_mfa`Description





Requires the user to verify their credentials within the past 10 minutes. If not verified, prompt for both the first factor⁠ and second factor⁠.

- Name`strict`Description





Requires the user to verify their credentials within the past 10 minutes. If not verified, prompt for the second factor⁠.

- Name`moderate`Description





Requires the user to verify their credentials within the past hour. If not verified, prompt for the second factor⁠.

- Name`lax`Description





Requires the user to verify their credentials within the past day. If not verified, prompt for the second factor⁠.

- Name`level`Type`"first_factor" | "second_factor" | "multi_factor"`Description





The reverification level of credentials to check for.

- Name`afterMinutes`Type`number`Description





The age of the factor level to check for. Value should be greater than or equal to 1 and less than 99,999.


### [`getToken()`](https://clerk.com/docs/reference/backend/types/auth-object\#get-token)

`getToken()` retrieves the current user's [session token](https://clerk.com/docs/guides/sessions/session-tokens) or a [custom JWT template](https://clerk.com/docs/guides/sessions/jwt-templates).

Note

Providing a `template` will perform a network request and will count towards [rate limits](https://clerk.com/docs/guides/how-clerk-works/system-limits#backend-api-requests).

```
const getToken: ServerGetToken

type ServerGetToken = (options?: ServerGetTokenOptions) => Promise<string | null>

type ServerGetTokenOptions = {
  template?: string // The name of the custom JWT template to retrieve.
}
```

#### [Example: Use `getToken()` in the frontend](https://clerk.com/docs/reference/backend/types/auth-object\#example-use-get-token-in-the-frontend)

The `Auth` object is not available in the frontend. To use the `getToken()` method in the frontend:

- For React-based applications, you can use the `useAuth()` hook. See the [reference documentation](https://clerk.com/docs/nextjs/reference/hooks/use-auth) for example usage.
- For JavaScript applications, see the [reference documentation](https://clerk.com/docs/nextjs/reference/objects/session#get-token) for example usage.

#### [Example: Use `getToken()` in the backend](https://clerk.com/docs/reference/backend/types/auth-object\#example-use-get-token-in-the-backend)

To use the `getToken()` method in the backend:

- In App Router applications, use the [auth()](https://clerk.com/docs/reference/nextjs/app-router/auth) helper.
- In Pages Router applications, use the [getAuth()](https://clerk.com/docs/reference/nextjs/pages-router/get-auth) helper.

App Router

Pages Router

app/api/get-token-example/route.ts

```
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { getToken } = await auth()

  const template = 'test'

  const token = await getToken({ template })

  return Response.json({ token })
}
```

## [`Auth` object example without Active Organization](https://clerk.com/docs/reference/backend/types/auth-object\#auth-object-example-without-active-organization)

The following is an example of the `Auth` object without an Active Organization⁠. Notice that there is no `o` claim. Read more about token claims in the [guide on session tokens](https://clerk.com/docs/guides/sessions/session-tokens).

Version 2

Version 1

Important

This example is for version 2 of Clerk's session token. To see an example of version 1, select the respective tab above.

```
{
  azp: 'http://localhost:3000',
  email: 'email@example.com',
  exp: 1744735488,
  fva: [ 9, -1 ],
  iat: 1744735428,
  iss: 'https://renewing-bobcat-00.clerk.accounts.dev',
  jti: 'aee4d4a5071bdd66e21b',
  nbf: 1744735418,
  pla: 'u:example-plan',
  role: 'authenticated',
  sid: 'sess_123',
  sub: 'user_123',
  v: 2
}
```

## [`Auth` object example with Active Organization](https://clerk.com/docs/reference/backend/types/auth-object\#auth-object-example-with-active-organization)

The following is an example of the `Auth` object with an Active Organization⁠. Notice the addition of the `o` claim. Read more about token claims in the [guide on session tokens](https://clerk.com/docs/guides/sessions/session-tokens).

Version 2

Version 1

Important

This example is for version 2 of Clerk's session token. To see an example of version 1, select the respective tab above.

```
{
  azp: 'http://localhost:3000',
  email: 'email@example.com',
  exp: 1744734948,
  fea: 'o:example-feature',
  fva: [ 0, -1 ],
  iat: 1744734888,
  iss: 'https://renewing-bobcat-00.clerk.accounts.dev',
  jti: '004f0096e5cd44911924',
  nbf: 1744734878,
  o: {
    fpm: '1',
    id: 'org_123',
    per: 'example-perm',
    rol: 'admin',
    slg: 'example-org'
  },
  pla: 'o:free_org',
  role: 'authenticated',
  sid: 'sess_123',
  sub: 'user_123',
  v: 2
}
```

## [`Auth` object example with valid factor age](https://clerk.com/docs/reference/backend/types/auth-object\#auth-object-example-with-valid-factor-age)

The following is an example of the `Auth` object with a valid factor age. Notice the addition of the `fva` claim with a value of `[0, 0]`, indicating that the first factor⁠ and second factor⁠ have been verified within the past minute. Read more about token claims in the [guide on session tokens](https://clerk.com/docs/guides/sessions/session-tokens).

Version 2

Version 1

Important

This example is for version 2 of Clerk's session token. To see an example of version 1, select the respective tab above.

```
{
  azp: 'http://localhost:3000',
  email: 'email@example.com',
  exp: 1744735488,
  fva: [ 0,0 ],
  iat: 1744735428,
  iss: 'https://renewing-bobcat-00.clerk.accounts.dev',
  jti: 'aee4d4a5071bdd66e21b',
  nbf: 1744735418,
  role: 'authenticated',
  sid: 'sess_123',
  sub: 'user_123',
  v: 2
}
```

## [`Auth` object example of a user without an MFA method registered](https://clerk.com/docs/reference/backend/types/auth-object\#auth-object-example-of-a-user-without-an-mfa-method-registered)

The following is an example of the `Auth` object of a user without an MFA method registered. Notice the addition of the `fva` claim, but the value is `[0, -1]`. `0` indicates that the first factor⁠ has been verified within the past minute, and `-1` indicates that there is no second factor⁠ registered for the user. Read more about token claims in the [guide on session tokens](https://clerk.com/docs/guides/sessions/session-tokens).

Version 2

Version 1

Important

This example is for version 2 of Clerk's session token. To see an example of version 1, select the respective tab above.

```
{
  azp: 'http://localhost:3000',
  email: 'email@example.com',
  exp: 1744735488,
  fva: [ 0,-1 ],
  iat: 1744735428,
  iss: 'https://renewing-bobcat-00.clerk.accounts.dev',
  jti: 'aee4d4a5071bdd66e21b',
  nbf: 1744735418,
  role: 'authenticated',
  sid: 'sess_123',
  sub: 'user_123',
  v: 2
}
```

## [Machine properties](https://clerk.com/docs/reference/backend/types/auth-object\#machine-properties)

- Name`id`Type`string`Description





The ID of the machine.

- Name`subject`Type`string`Description





The ID of the user or Organization that the machine is associated with.

- Name`name`Type`string`Description





The name of the machine. For 'api\_key' and 'machine\_token' types.

- Name`claims`Type`Record<string, unknown> | null`Description





The machine's claims. For 'api\_key' and 'machine\_token' types.

- Name`scopes`Type`string[]`Description





The scopes of the machine.

- Name[`getToken()`](https://clerk.com/docs/reference/backend/types/auth-object#get-token)Type`() => Promise<string>`Description





A function that gets the machine's token.

- Name`tokenType`Type`'api_key' | 'oauth_token' | 'm2m_token'`Description





The type of request to authenticate.

- Name`debug`Type`AuthObjectDebug`Description





Used to help debug issues when using Clerk in development.


## [`Auth` object example of a machine request](https://clerk.com/docs/reference/backend/types/auth-object\#auth-object-example-of-a-machine-request)

The following is an example of the `Auth` object of an authenticated machine request (i.e. a request authenticated using a machine token like an API key).

Notice the addition of a `tokenType` property with the value of `'api_key'`, which distinguishes the request as a machine request rather than a user session. The `scopes` array defines the permissions granted by the token.

```
{
  id: 'oat_123',
  tokenType: 'oauth_token',
  userId: 'user_123',
  clientId: 'client_123',
  name: 'GitHub OAuth',
  scopes: ['read', 'write'],
  getToken: [AsyncFunction (anonymous)],
}
```

## Feedback

What did you think of this content?

It was helpfulIt was not helpfulI have feedback

Last updated onApr 17, 2026

[GitHubEdit on GitHub](https://github.com/clerk/clerk-docs/edit/main/docs/reference/backend/types/auth-object.mdx)

Support