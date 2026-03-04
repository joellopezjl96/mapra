# Launch Guide: Day by Day

**Created:** 2026-03-03
**Milestones:** npm publish (March 15) | blog post (March 22) | Anthropic DevRel (March 31)
**Rule:** No encoding/scanner work until milestones 1 and 2 are done.

---

## Week 1: Make the Package Shippable

### Day 1 — Monday March 3 (today)

**Fix the two things that will break `npx strand`:**

1. **Move tree-sitter from devDependencies to dependencies.** The scanner imports it at runtime. Anyone running `npx strand` will get `MODULE_NOT_FOUND`. Same for `tree-sitter-typescript`.

2. **Add a shebang to the CLI entry point.** `dist/cli/index.js` needs `#!/usr/bin/env node` at the top or npm's bin linking won't work. Add it to the TypeScript source so `tsc` emits it.

**Then verify the whole chain works end to end:**
```
npm run build
npm pack            # creates strand-0.1.0.tgz
npm install -g ./strand-0.1.0.tgz
strand              # should run setup in cwd
strand --help       # should print help
```

If that works, Day 1 is done.

---

### Day 2 — Tuesday March 4

**Write the README.**

This is the npm landing page and the GitHub first impression. It should take 30 minutes to read and answer three questions:
1. What is this?
2. Why should I care?
3. How do I use it?

Structure:
```
# strand

Pre-computed codebase intelligence for AI coding agents.

## The Problem
[2-3 sentences: AI agents waste time exploring. Every session starts from scratch.]

## What Strand Does
[1 paragraph: scans codebase, builds dependency graph, outputs .strand file.
AI agents read it and skip the exploration phase.]

## Results
[Table from experiments — the hard numbers]
| Without strand | With strand |
|----------------|-------------|
| 35 tool calls  | 2 tool calls |
| 57K tokens     | ~3.5K tokens |
| 3 minutes      | 1.3 minutes |
| Wrong conclusion | Correct with blast radius |

## Quick Start
npx strand

## What's in the .strand File
[Brief section list: RISK, CHURN, HOTSPOTS, etc. — one line each]

## Commands
[strand generate, strand impact, strand validate-plan, strand status]

## Works With
Claude Code, Cursor, Aider, any tool that reads project files.

## License
MIT
```

Keep it under 150 lines. No badges, no fancy formatting. Just the facts.

---

### Day 3 — Wednesday March 5

**Update package.json for publish readiness.**

- [ ] Update `description` to match new value prop: "Pre-computed codebase intelligence for AI coding agents"
- [ ] Update `keywords` — drop "visual-encoding", add "blast-radius", "dependency-graph", "codebase-analysis", "code-intelligence"
- [ ] Add `repository`, `bugs`, and `homepage` fields pointing to GitHub
- [ ] Verify `files` array includes everything needed (dist/, README.md) and excludes everything else (experiments/, FINDINGS.md, docs/)
- [ ] Bump version to `0.2.0` (first public release deserves a minor bump)
- [ ] Run `npm pack --dry-run` and review the file list — nothing sensitive should be in there

**Also: audit dependencies.**
```
npm audit
npx license-checker --summary
```

Make sure there's nothing surprising. You're about to put your name on this.

---

### Day 4 — Thursday March 6

**Dry-run the full install experience.**

On a clean directory (or ask a friend), run:
```
npx strand@0.2.0   # after publish, but simulate with local tgz first
```

What to check:
- Does it install in under 30 seconds?
- Does `strand` run without errors on a real JS/TS project?
- Does `strand --help` print clean output?
- Does `.strand` get created and look correct?
- Does `strand init` wire CLAUDE.md properly?
- Does the error message make sense if you run it in an empty directory?

Fix whatever breaks. This is the experience every new user will have.

---

### Day 5 — Friday March 7

**Write the npm publish script and test it.**

- [ ] Create an npm account if you don't have one
- [ ] Set up 2FA on npm (required for new packages)
- [ ] Run `npm publish --dry-run` and verify output
- [ ] Check that the package name `strand` is available (it may not be — have a backup like `strand-ai` or `codebase-strand`)

```
npm view strand    # check if name is taken
```

If `strand` is taken, decide on the name now. Don't wait until publish day.

**End of Week 1 checkpoint:** You should have a package that builds, installs from tarball, runs correctly, has a README, and is ready to publish. Everything from here is polish.

---

## Week 2: Publish and Start the Blog Post

### Day 6 — Monday March 10

**Publish to npm.**

```
npm login
npm publish --provenance
```

Immediately after:
```
npx strand@0.2.0 --help    # verify it works from the registry
```

Then run it against a real project you have locally (the SenorBurritoCompany codebase from your experiments). Verify the output is correct.

**If anything is broken, unpublish within 24 hours and fix it.** After 24 hours, npm won't let you unpublish.

Post on Twitter/X: "strand is on npm. Pre-computed codebase intelligence for AI coding agents. `npx strand` in any JS/TS project. https://npmjs.com/package/strand" — keep it short, include the one-liner.

---

### Day 7 — Tuesday March 11

**Start the blog post. Outline only today.**

Working title: "How We Cut AI Agent Codebase Exploration from 45 Tool Calls to Zero"

Outline:
```
1. The problem (2 paragraphs)
   - AI agents re-explore every session
   - Cost in tokens, time, and accuracy

2. What we tried (1 paragraph)
   - 8 controlled experiments, two codebases

3. The results (the meat — tables and numbers)
   - 45 tool calls → 0 (Experiment 7)
   - 78% cost reduction with model downgrade (Experiment 6)
   - 3/3 blast radius accuracy vs 0/3 (Experiment 5)
   - 96% self-documenting format (Experiment 8)
   - Real-world: 35 calls, 57K tokens, wrong → 2 calls, 3.5K tokens, correct

4. How it works (3-4 paragraphs)
   - What .strand contains
   - How agents use it (CLAUDE.md integration)
   - Show a real .strand snippet

5. Try it (CTA)
   - npx strand
   - Link to GitHub
```

Don't write prose today. Just nail the structure and pull the exact numbers from FINDINGS.md.

---

### Day 8 — Wednesday March 12

**Write the blog post: sections 1-3.**

Section 3 (the results) is the most important part. Lead with the numbers. Use tables. Don't bury the lede — the 45→0 comparison should be in the first 200 words or in a callout.

Pull direct quotes from experiment results. Real data > marketing language.

---

### Day 9 — Thursday March 13

**Write the blog post: sections 4-5.**

Include an actual `.strand` snippet (use a trimmed version of your own .strand — 20-30 lines showing RISK and CHURN sections). Let the reader see what the agent sees.

The CTA is just `npx strand`. Don't oversell. The data already did the selling.

---

### Day 10 — Friday March 14

**Edit the blog post.**

Read it out loud. Cut anything that sounds like marketing. Cut anything that repeats a point already made. Target: 800-1,200 words. Developers stop reading after 1,500.

Send it to one person for feedback. Ideally someone who uses Claude Code or Cursor.

---

## Week 3: Publish the Blog Post and Prep DevRel Outreach

### Day 11 — Monday March 17

**Incorporate feedback. Final edit.**

Check:
- [ ] Every number in the post matches FINDINGS.md
- [ ] The `npx strand` command actually works right now
- [ ] All links work
- [ ] No typos in code snippets

---

### Day 12 — Tuesday March 18

**Decide where to publish.**

Options in order of preference:
1. **dev.to** — developer audience, markdown-native, free, shows up in search
2. **Personal blog** (if you have one with existing traffic)
3. **Medium** — broader reach but paywalls hurt distribution

Publish on one platform. Cross-post later if it gets traction.

---

### Day 13 — Wednesday March 19

**Publish the blog post.**

Post it. Share it:
- Twitter/X with the key stat: "45 tool calls → 0. Here's how."
- Relevant Discord servers (Claude Code, Cursor, AI dev tools)
- Hacker News (title: "Show HN: Strand – pre-computed codebase intelligence for AI agents")
- Reddit r/programming, r/ChatGPTCoding

Don't spam. One post per platform. Let the data do the work.

---

### Day 14-15 — Thursday-Friday March 20-21

**Monitor and respond.**

Watch for:
- npm download numbers
- GitHub stars/issues
- Blog post comments
- Any questions about the format

Reply to every comment in the first 48 hours. This is your only distribution channel right now.

---

## Week 4: Anthropic DevRel

### Day 16 — Monday March 24

**Draft the Anthropic DevRel outreach.**

This is a cold email or DM. Keep it under 200 words.

Structure:
```
Subject: .strand — pre-computed codebase intelligence for Claude Code

Hi [name],

I built strand, a tool that pre-computes dependency graphs, blast radius,
and architectural topology for codebases. The output is a .strand file
that Claude Code reads automatically.

I ran 8 controlled experiments. The results:
- 45 tool calls → 0 for structural questions
- 78% cost reduction when pairing with cheaper models
- 3/3 blast radius accuracy vs 0/3 without

It's on npm: npx strand
Blog post with the full data: [link]

I'd love to explore whether .strand could be a recommended practice in
the Claude Code docs. Happy to share the full experiment data.

Joel
```

That's it. Short, data-led, clear ask.

---

### Day 17 — Tuesday March 25

**Find the right person to email.**

Look for:
- Anthropic DevRel team members on Twitter/X
- Authors of Claude Code blog posts or docs
- People who've posted about Claude Code integrations

LinkedIn or Twitter DM are both fine. If you can find an email, use email.

---

### Day 18 — Wednesday March 26

**Send the outreach.**

Send to 2-3 people max. Not a mass email. Personalize if you can reference something they've written.

---

### Days 19-23 — March 27-31

**Follow up if no response by Day 21.**

One follow-up. Short: "Just checking if this landed in your inbox. Happy to do a quick call or share more data."

If no response by March 31, that's fine. The milestone is "initiate contact," not "get a partnership." The blog post and npm presence are doing distribution work regardless.

---

## Checkpoint Summary

| Date | Milestone | Done? |
|------|-----------|-------|
| March 7 | Package installable from tarball, README written | |
| March 10 | Published to npm | |
| March 19 | Blog post live | |
| March 26 | DevRel email sent | |

After March 31, encoding work (v4, Python scanner, etc.) is unblocked. Not before.
