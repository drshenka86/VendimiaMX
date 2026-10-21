---
applyTo: "functions/**/*.{js,jsx,ts,tsx}"
---

# La Vendimia MX - Firebase Functions Instructions

These instructions apply to Firebase Cloud Functions.

## General Rule

Firebase Functions are backend code and must be treated as security-sensitive.

Do not modify existing functions unless the requested task requires it.

Before modifying a function:

1. Understand what calls it.
2. Search the frontend for references.
3. Identify its authentication requirements.
4. Identify Firestore collections affected.
5. Determine whether changing it could affect existing users or data.

---

## Security

Never trust data received from the frontend.

Validate important input on the backend.

For operations requiring authentication, verify the authenticated user.

For administrative operations, verify the required permissions or role.

Never expose:

- service account credentials;
- private keys;
- secrets;
- tokens.

Never move privileged backend logic to the React frontend merely to simplify
implementation.

---

## Firebase Admin SDK

Firebase Admin SDK must remain server-side.

Never copy Admin SDK configuration or privileged credentials into:

- src/
- React components;
- Vite environment variables exposed to the browser.

---

## Firestore Operations

Before changing Firestore data:

1. Verify the collection and document structure.
2. Check existing reads and writes.
3. Preserve existing fields unless intentionally changing them.
4. Handle missing documents appropriately.
5. Handle failures explicitly.

Avoid unnecessary reads and writes.

---

## User Management

Operations involving Firebase Authentication users are sensitive.

Be especially careful when:

- creating users;
- deleting users;
- disabling users;
- changing email addresses;
- assigning roles;
- changing custom claims.

Never implement administrative user-management operations directly in the
frontend if they require Firebase Admin privileges.

---

## Existing Functions

Do not rewrite working functions merely to modernize their syntax.

Do not rename exported functions without checking every caller.

Do not remove a function simply because its usage is not immediately visible.

If a function appears unused, report:

"Possibly unused - requires verification."

---

## Dependencies

Do not add or update backend dependencies unless necessary for the requested
task.

Do not automatically upgrade:

- firebase-admin;
- firebase-functions;
- Node runtime;
- other backend dependencies.

Dependency upgrades should be treated as a separate task when possible.

---

## Deployment

DO NOT automatically:

- deploy Firebase Functions;
- deploy Firestore Rules;
- change the Firebase project;
- change production configuration;
- delete deployed functions.

Code changes and production deployment are separate operations.

Only deploy when explicitly requested.

---

## Destructive Operations

Changes capable of:

- deleting users;
- deleting documents;
- modifying many documents;
- changing roles;
- changing permissions;
- migrating data;

must be considered high-risk.

Explain the impact before implementing potentially destructive behavior.

---

## Error Handling

Functions must handle expected failures appropriately.

Do not silently ignore important errors.

Do not return sensitive internal information to frontend users.

Log enough information for debugging without logging secrets or sensitive
credentials.

---

## Critical Rule

Backend security must never be weakened simply to make frontend development
easier.

When uncertain about the security impact of a change, stop and explain the
risk before proceeding.