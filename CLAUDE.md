<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Debugging third-party APIs — lessons learned

**Default question when an API errors in a way that doesn't match the
operation you're trying to do: am I using the wrong API?** Not "how do
I make this API behave" — that's symptom patching. Stop and verify the
hook/method is actually intended for the operation you're invoking
before adding workarounds.

Specific traps to avoid:

- **Reusing one-shot APIs for repeat operations.** Many SDKs split
  "first-time" and "subsequent" into different surfaces (e.g. Clerk's
  `useCheckout` is for first-time subscriptions only; plan changes use
  the hosted UserProfile UI via `openUserProfile()`). If an API rejects
  with a vague "please choose differently"-type message, suspect
  wrong-API-for-the-state before patching the call site.
- **String-matching error messages as a fallback strategy.** If you
  find yourself parsing English error text to branch on it, you're
  guessing about the API contract. Read the docs, type definitions,
  or source.
- **Layering retries on top of a misused API.** If a runaway loop
  happens because each call to `start()` returns without transitioning
  state, a guard fixes the loop but doesn't fix the underlying bug.
  The loop was a symptom; the call shouldn't have been made at all.

When docs are thin or the API is experimental:

- Read the type definitions in `node_modules` directly — they often
  reveal which states the API supports.
- Search the SDK's GitHub repo for example apps that match the use
  case. If no example does what you're trying to do, the API probably
  doesn't support it.
- Verbose diagnostic logging is high-leverage when an API silently
  does nothing. Logging every state transition + render is what
  surfaced the runaway-loop bug AND the actual Clerk error message in
  the billing checkout investigation. Make failures loud before
  fixing.

**Heuristic:** If a fix needs more than ~50 lines of defensive code
around a single library call (URL-param fallbacks, error-string
matching, timeouts, retries), it's probably the wrong library call.
