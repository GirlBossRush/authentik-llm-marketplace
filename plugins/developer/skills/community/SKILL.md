---
name: community
description: >
    Send a question to the right authentik venue, and frame it so it gets answered. Use when
    someone has a usage question, a possible security issue, an idea to discuss, or isn't
    sure whether something is a bug, and needs to know where it goes (GitHub Issues vs
    Discussions vs Discord vs a security disclosure) and what context to include. Filing the
    formal issue or PR itself lives in contributing.
---

# authentik community and support

## Purpose

Not every question is a bug report or a pull request. Usage questions, design discussions,
and "is this expected?" belong in community channels rather than the issue tracker, and a
security problem belongs in a private disclosure rather than anywhere public. This skill
routes a question to the right venue and helps frame it with the context that gets a useful
answer.

## When to invoke

- "Get help from the community."
- "Where do I ask a question that isn't a bug?"
- "I want to discuss an idea before filing an issue."
- "Which channel should I use — Discussions or Discord?"
- "I think I found a security issue — where does that go?"

Not this skill: filing a formal issue or pull request (contributing).

## Where does this go?

| What you have                            | Where it goes                                              |
| ---------------------------------------- | ---------------------------------------------------------- |
| A reproducible bug (version + steps)     | a GitHub **Issue** (→ contributing)                        |
| A security vulnerability                 | the **private security disclosure** — never a public issue |
| "Is this expected?" / a usage question   | **GitHub Discussions** or the **Discord** server           |
| An idea to shape before it's an issue    | **GitHub Discussions** (or Discord) first                  |
| A feature request you've thought through | a GitHub **Issue** (feature template)                      |

Then frame it with context: your authentik version, what you tried, what you expected versus
what you saw, and logs for anything broken.

**Gotcha:** a security issue in a public tracker exposes users before there's a fix, so always
use the project's private security disclosure (see `SECURITY.md` / the security policy), not
a public issue or Discord.
