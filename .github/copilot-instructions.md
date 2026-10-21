# La Vendimia MX - GitHub Copilot Instructions

## Project Context

La Vendimia MX is a web application used to manage a small resale business.

The application is built primarily with:

- React
- JavaScript
- Firebase Authentication
- Cloud Firestore
- Vercel

The application is actively being developed.

The goal is to keep the system simple, reliable and maintainable.

Do not introduce enterprise-level complexity unless it is clearly necessary.

---

# Core Development Philosophy

Always prioritize:

Stability > Correctness > Security > Maintainability > Performance > Aesthetics

Existing functionality must be preserved unless the current task explicitly
requires changing it.

Prefer small and incremental changes over large refactors.

---

# Before Modifying Code

Before making changes:

1. Understand the requested task.
2. Inspect the existing implementation.
3. Identify the files involved.
4. Search for related components, functions and references when necessary.
5. Understand how the change could affect existing functionality.
6. Prefer the smallest safe implementation.

Do not immediately start rewriting code.

For changes that could affect multiple modules, briefly explain the proposed
approach before editing.

---

# Scope Control

Only modify code necessary for the current task.

Do NOT perform unrelated cleanup or refactoring while implementing another
feature.

Do NOT:

- redesign working modules without being asked;
- rename files unnecessarily;
- move folders unnecessarily;
- change architecture without justification;
- remove functionality without authorization;
- replace working implementations simply because another approach is newer;
- install new dependencies when the existing stack can solve the problem.

Do not turn a small task into a large architectural change.

---

# Preserve Existing Functionality

Before modifying existing behavior, determine what currently depends on it.

Avoid breaking:

- navigation;
- authentication;
- authorization;
- Firestore operations;
- forms;
- validation;
- existing CRUD operations;
- responsive behavior;
- existing business rules.

When a requested change could create a regression, explain the risk before
performing the change.

---

# Bug Detection During Development

While working on requested tasks, pay attention to potential bugs.

Examples:

- incorrect null/undefined handling;
- incorrect state updates;
- missing validation;
- incorrect async/await usage;
- unhandled promises;
- duplicated operations;
- incorrect Firestore queries;
- inconsistent data;
- authorization problems;
- race conditions;
- memory leaks;
- unnecessary listeners;
- incorrect React lifecycle behavior.

If a bug is directly related to the requested task and the fix is safe,
include it and explain it.

If a bug is unrelated:

1. Do not silently fix it.
2. Report it.
3. Identify the affected file.
4. Explain the potential impact.
5. Continue with the requested task unless the bug blocks development.

---

# Refactoring Rules

Do not refactor code merely because it could look cleaner.

Refactoring must provide a concrete benefit such as:

- fixing a bug;
- reducing meaningful duplication;
- improving maintainability;
- reducing real complexity;
- improving security;
- enabling the requested functionality.

Avoid speculative refactoring.

If existing code works correctly and changing it provides little practical
benefit, leave it unchanged.

---

# Potentially Unused Code

Never automatically delete code because it appears unused.

Before recommending removal:

1. Search the entire project for references.
2. Check routing.
3. Check callbacks and event handlers.
4. Check configuration.
5. Check dynamic imports.
6. Check Firebase-related usage.
7. Check build/deployment configuration.

If usage cannot be confirmed, report:

"Possibly unused - requires verification."

---

# Dependencies

Avoid adding npm packages unless necessary.

Before adding a dependency:

1. Determine whether the project already has a solution.
2. Determine whether React, JavaScript or an existing dependency can handle it.
3. Consider maintenance and security implications.

Never update all dependencies automatically while implementing an unrelated
feature.

---

# Security

Never expose:

- private keys;
- service account credentials;
- passwords;
- access tokens;
- secrets;
- private environment variables.

Remember that frontend code is visible to users.

Do not rely exclusively on frontend validation for security.

Respect Firebase Authentication and Firestore security boundaries.

Never weaken security rules merely to make functionality work.

---

# Database Changes

Treat Firestore structure changes carefully.

Before changing document structure:

1. Identify existing reads.
2. Identify existing writes.
3. Identify components using the affected collection.
4. Consider compatibility with existing documents.

Prefer backward-compatible changes when practical.

Never delete collections or production data automatically.

---

# Error Handling

User-facing operations should handle failures appropriately.

Avoid:

- silent failures;
- empty catch blocks;
- exposing technical stack traces to users;
- assuming Firebase operations always succeed.

Errors shown to users should be understandable.

Technical details may be logged appropriately for development.

---

# Simplicity

This application belongs to a small business.

Prefer straightforward solutions.

Avoid unnecessary:

- abstraction layers;
- design patterns;
- microservices;
- repositories;
- factories;
- complex state management;
- enterprise architecture.

Introduce abstractions only when they solve an actual problem.

---

# Working Method

For normal small changes:

1. Inspect.
2. Implement the smallest safe change.
3. Verify affected references.
4. Check for obvious regressions.
5. Report the result.

For potentially risky changes:

STOP before implementation and explain:

- what needs to change;
- why;
- affected files;
- possible risks.

Wait for confirmation when the change could significantly alter existing
functionality or architecture.

---

# After Making Changes

Provide a concise summary containing:

### Changed
Files modified and what changed.

### Preserved
Relevant existing behavior that remains unchanged.

### Risks
Any known risk or state "No significant risks identified."

### Testing
Steps the developer should use to verify the change.

Do not claim something was tested unless it was actually tested.

---

# Critical Rule

When uncertain between:

A) making a larger "better" implementation

or

B) making a smaller implementation that safely satisfies the requirement

prefer B.

The project should evolve incrementally.