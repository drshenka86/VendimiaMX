---
applyTo: "**/*{firebase,firestore,Auth,auth}*.{js,jsx,ts,tsx},firestore.rules,firebase.json"
---

# La Vendimia MX - Firebase Instructions

Firebase is a critical part of this application.

Changes involving authentication, Firestore or security must be treated as
potentially sensitive.

---

# Firebase Authentication

Preserve the existing authentication flow.

Do not change authentication providers or architecture unless explicitly
requested.

Do not implement insecure workarounds merely to make a feature work.

Frontend authentication checks are not sufficient authorization by
themselves.

---

# User Management

Be especially careful with:

- creating users;
- changing roles;
- activating/deactivating users;
- password-related operations;
- deleting users.

Do not assume the Firebase client SDK has administrative privileges.

Never place Firebase Admin SDK credentials or service-account credentials in
React frontend code.

---

# Firestore

Before modifying Firestore operations:

1. Identify the collection involved.
2. Identify current document structure.
3. Search for existing reads/writes.
4. Preserve compatibility with existing data when possible.

Avoid unnecessary Firestore reads and writes.

Do not create listeners when a one-time query is sufficient.

Clean up real-time listeners when components unmount.

---

# Firestore Documents

When updating documents, avoid accidentally removing fields that are not part
of the current operation.

Prefer targeted updates when appropriate.

Handle documents that may contain older or missing fields.

Do not assume every existing document contains newly introduced fields.

---

# Firestore Security Rules

Treat `firestore.rules` as security-critical.

DO NOT modify Firestore security rules as an unrelated side effect of another
task.

Before modifying rules:

1. Explain why the change is necessary.
2. Explain what access changes.
3. Identify affected roles/users.
4. Identify security implications.

Never use broad permissions such as allowing unrestricted read/write merely
to make development easier.

Never weaken existing security without explicit authorization.

---

# Roles and Authorization

Respect the existing role model.

When adding functionality, determine which roles should have access based on
the existing application behavior.

Do not invent new roles unless requested.

Do not trust a role sent from UI input as sufficient authorization.

---

# Firebase Configuration

Firebase client configuration may exist in frontend code as required by the
Firebase Web SDK, but secrets and privileged credentials must never be
included.

Never expose:

- service account JSON;
- private keys;
- Admin SDK credentials;
- server secrets.

---

# Environment Configuration

Do not change production Firebase projects, environment variables or Vercel
configuration unless explicitly requested.

Clearly distinguish between:

- local development;
- test;
- production.

Never perform production deployments automatically.

---

# Destructive Operations

Operations that can:

- delete documents;
- delete users;
- delete collections;
- change permissions;
- modify many records;
- migrate existing data;

must be treated as high-risk.

Explain the operation and its impact before implementation.

Never perform destructive production operations automatically.

---

# Schema Evolution

Firestore is schemaless, but the application still depends on expected
document structures.

When adding fields:

Prefer implementations that tolerate older documents where the field does
not yet exist.

Avoid requiring immediate migrations unless genuinely necessary.

When a migration is required, explain it before implementation.

---

# Error Handling

Handle Firebase failures explicitly.

Consider:

- permission-denied;
- unauthenticated;
- unavailable;
- network failures;
- missing documents;
- duplicate operations.

Do not expose raw internal Firebase error details to end users unless useful
during development.

---

# Critical Security Rule

Never solve a Firebase permissions problem by simply granting broader access.

Determine why access is failing first.

Security > Convenience.