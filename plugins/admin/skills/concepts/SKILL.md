---
name: concepts
description: >
    Explains authentik's object model and translates a plain-language goal into the
    right authentik objects. Use when a user knows the outcome they want but not the
    vocabulary — "I want my team to log in with Google", "I want this app to use our
    logins" — or asks what something means or how the pieces relate: Application vs
    Provider, Source vs Provider, Flow vs Stage vs Policy, Outpost, Brand. This skill
    is conceptual and navigational; once the user knows which object they need, hand
    off to the skill that builds it (providers, sources, flows-stages, applications,
    and so on).
---

# authentik concepts and documentation

## Purpose

New admins routinely conflate authentik's objects: Applications with Providers,
Sources with Providers, Flows with Stages. Those mix-ups lead to misconfigured
logins. This skill explains what each object is, how it connects to the others, and
where the authoritative docs live, so the user has the right mental model before they
touch configuration.

## When to invoke

- "What's the difference between an Application and a Provider?"
- "What is a Flow? How does it relate to Stages and Policies?"
- "Is Google a Source or a Provider in authentik?"
- "What's an Outpost and when do I need one?"
- "Where are the docs for SCIM provisioning?"
- The user describes an outcome but doesn't know which object builds it.

Not this skill: building or changing an actual object. Once the user understands the
concept and wants to act, route to the specific skill that owns that object.

## From outcome to object

A user rarely says "Provider." Translate what they want into what to build, then hand
off to that skill:

| The user says                                           | What they need                                                        | Skill                              |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| "log in _with_ Google / Microsoft / GitHub"             | a social **Source**                                                   | sources                            |
| "this app should _use our logins_ / sit behind SSO"     | a **Provider** + an **Application**                                   | applications + providers           |
| "_push_ / sync our users into Google Workspace / Entra" | an outbound provisioning **Provider**                                 | providers                          |
| "_protect_ an app that has no login of its own"         | a **Proxy** provider + an **Outpost**                                 | providers + outposts               |
| "_pull_ users in from Active Directory"                 | an **LDAP Source** + directory sync                                   | sources                            |
| "force a second factor / MFA"                           | an authenticator **Stage** in a **Flow**, often gated by a **Policy** | authenticators-mfa + policies-rbac |
| "change what the login / signup page does"              | a **Flow** and its **Stages**                                         | flows-stages                       |
| "decide _who_ can use an app"                           | a **Policy** or group binding                                         | policies-rbac                      |

## Finding the docs

authentik changes between releases — prefer the live docs over memory: use the
authentik docs base URL from your session context (or the `authentik-code-mode` MCP's
`docs` tool, which returns the version-accurate URL), then fetch `<docs>/llms.txt`
(integrations: `<integrations>/llms.txt`), follow the index to the right page, and
fetch its `.md`.
