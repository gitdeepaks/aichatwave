# ADR-0006 — Social-only authentication

**Status:** Accepted · **Date:** 2026-09-09 · **Deciders:** owner

## Context

With Clerk in place ([ADR-0001](0001-clerk-over-better-auth.md)), enabling email and password was a
dashboard toggle. The question was whether to.

The product's audience is developers. Google and GitHub accounts are near-universal there, and
every additional sign-in method is a surface: a password to store, a reset flow to abuse, a
transactional email provider to configure and monitor.

## Decision

Google, GitHub and LinkedIn are the only ways in. No email, no password, no verification codes.

## Consequences

**Bought.** The application never receives, transmits or stores a password, and there is no reset
flow to attack — so the auth-hardening work shrinks accordingly: password policy and reset-flow
abuse simply do not apply. Every identity arrives from a provider that has already verified the
address, so `emailVerified` means something without this app sending a single email. No
deliverability to monitor.

**Cost.** A provider outage is total lockout. With one method there is no fallback; with three
there is, but only for a user who has more than one. Clerk's account linking matches identities by
verified email, so someone who signs in with Google today and GitHub tomorrow lands on the same
account when the addresses match — that dashboard setting is the _only_ fallback social-only
sign-in has, and confirming it is recorded as an open item in `docs/pro_plan.md`.

Anyone without one of the three is excluded. Fine for a developer product; it would not be for a
general consumer audience.

**Applied in code.** The `cl-dividerLine`, `cl-dividerText`, `cl-formFieldInput`, `cl-formFieldLabel`
and `cl-formButtonPrimary` rules were deleted from `app/globals.css` — confirmed against the live
DOM that Clerk renders none of those elements under a social-only configuration. The email/password
styling written "just in case" was deleted rather than carried as speculative code.

`server/auth/user-service.ts` keeps its `@placeholder.invalid` email fallback. Under social-only
every identity carries a verified address, so it should never fire; it stays because the foreign key
must hold even if a provider returns an unexpected payload.

**Watch.** The LinkedIn mark is the weakest signal of the three in a developer context. If sign-in
conversion is ever measured, that is the one to watch.
