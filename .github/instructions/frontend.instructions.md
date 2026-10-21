---
applyTo: "src/**/*.{js,jsx,ts,tsx}"
---

# La Vendimia MX - Frontend Instructions

These instructions apply to React frontend code.

## React

Follow the existing React architecture and patterns used by the project.

Prefer functional components and hooks when consistent with the existing
codebase.

Do not convert existing working components simply for stylistic consistency.

---

# Components

Keep components reasonably focused.

Extract components when:

- meaningful UI is reused;
- a component becomes difficult to understand;
- separation clearly improves maintainability.

Do not create tiny components merely to reduce line count.

---

# State

Prefer local state when state is only needed by one component.

Do not introduce Redux, Zustand or another state-management library unless
there is a demonstrated need and explicit authorization.

Avoid duplicated state when values can safely be derived.

Be careful with asynchronous state updates.

---

# useEffect

Review useEffect dependencies carefully.

Avoid:

- infinite rendering loops;
- unnecessary effects;
- missing cleanup;
- duplicated Firebase listeners;
- unnecessary Firestore reads.

Always clean up subscriptions/listeners when required.

---

# Forms

Forms should:

- validate required fields;
- prevent accidental duplicate submissions when appropriate;
- provide understandable validation messages;
- preserve user input when reasonable after recoverable errors.

Do not rely on HTML validation alone for important business rules.

---

# CRUD Operations

For Create, Update and Delete operations:

- handle loading states when appropriate;
- handle errors;
- avoid duplicate operations;
- confirm destructive actions when appropriate;
- preserve existing data that is not being edited.

Do not overwrite entire Firestore documents unnecessarily if only specific
fields need modification.

---

# UI / UX

The application must remain responsive.

Any new screen or component should work reasonably on:

- desktop;
- tablet;
- mobile.

Do not break existing responsive behavior.

Reuse the project's existing visual patterns before creating new ones.

Keep the interface simple and practical for business operations.

---

# Navigation

Preserve existing routes unless explicitly asked to change them.

Do not rename or remove routes without checking references.

Protected pages must continue respecting authentication and role
requirements.

---

# Performance

Do not prematurely optimize.

Address performance when there is evidence of:

- excessive renders;
- unnecessary Firestore reads;
- large repeated calculations;
- unnecessary network requests;
- duplicated listeners.

Do not introduce memoization everywhere without a concrete reason.

---

# User Feedback

When an operation takes noticeable time, provide appropriate feedback.

When an operation fails, display a useful message.

When an operation succeeds, provide feedback when it improves usability.

Avoid exposing raw Firebase errors directly to normal users.