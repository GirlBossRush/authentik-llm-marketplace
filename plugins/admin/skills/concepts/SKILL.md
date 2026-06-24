---
name: concepts
description: >
  Explains authentik's core object model and routes documentation questions.
  Use when a user asks what something means or how authentik's pieces relate —
  Application vs Provider, Source vs Provider, Flow vs Stage vs Policy, Outpost,
  Brand/Tenant, embedded outpost — or wants the right docs page for a topic.
  This skill is conceptual and navigational. For actually building any of these
  objects, hand off to the matching skill (providers,
  sources, flows-stages, and so on).
---

# authentik concepts and documentation

## Purpose

New admins routinely conflate authentik's objects: Applications with Providers,
Sources with Providers, Flows with Stages. Those mix-ups lead to misconfigured
logins. This skill explains what each object is, how it connects to the others,
and where the authoritative docs live, so the user has the right mental model
before they touch configuration.

## When to invoke

- "What's the difference between an Application and a Provider?"
- "What is a Flow? How does it relate to Stages and Policies?"
- "Is Google a Source or a Provider in authentik?"
- "What's an Outpost and when do I need one?"
- "Where are the docs for SCIM provisioning?"
- The user is about to configure something but clearly has the model backwards.

Not this skill: building or changing an actual object. Once the user understands
the concept and wants to act, route to the specific skill that owns that object.

## Finding the docs

authentik changes between releases — prefer the live docs over memory: start at
<https://docs.goauthentik.io/llms.txt> (integrations live at
<https://integrations.goauthentik.io/llms.txt>), follow the index to the right
page, and fetch its `.md`.
