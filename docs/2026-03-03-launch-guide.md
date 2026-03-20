# Launch Guide: Day by Day

**Created:** 2026-03-03
**Updated:** 2026-03-19 (rebased from npm publish date)
**Milestones:** ~~npm publish~~ DONE (March 19) | blog post (March 26) | Anthropic DevRel (April 2)
**Rule:** No encoding/scanner work until milestones 1 and 2 are done.

---

## ~~Week 1: Make the Package Shippable~~ DONE

Package renamed from `strnd` to `mapra`. Published to npm on March 19.
README, LICENSE, shebang, dependencies — all handled.

`npx mapra --help` works from the registry.

---

## Week 1 (from publish): Write the Blog Post

### Day 1 — Thursday March 20

**Start the blog post. Outline only today.**

Working title: "How We Cut AI Agent Codebase Exploration from 45 Tool Calls to Zero"

Outline:
```
1. The problem (2 paragraphs)
   - AI agents re-explore every session
   - Cost in tokens, time, and accuracy

2. What we tried (1 paragraph)
   - 13 controlled experiments, two codebases

3. The results (the meat — tables and numbers)
   - 45 tool calls → 0 (Experiment 7)
   - 78% cost reduction with model downgrade (Experiment 6)
   - 3/3 blast radius accuracy vs 0/3 (Experiment 5)
   - 96% self-documenting format (Experiment 8)
   - Real-world: 35 calls, 57K tokens, wrong → 2 calls, 3.5K tokens, correct

4. How it works (3-4 paragraphs)
   - What .mapra contains
   - How agents use it (CLAUDE.md integration)
   - Show a real .mapra snippet

5. Try it (CTA)
   - npx mapra
   - Link to GitHub
```

Don't write prose today. Just nail the structure and pull the exact numbers from FINDINGS.md.

---

### Day 2 — Friday March 21

**Write the blog post: sections 1-3.**

Section 3 (the results) is the most important part. Lead with the numbers. Use tables. Don't bury the lede — the 45→0 comparison should be in the first 200 words or in a callout.

Pull direct quotes from experiment results. Real data > marketing language.

---

### Day 3 — Saturday March 22

**Write the blog post: sections 4-5.**

Include an actual `.mapra` snippet (use a trimmed version of your own .mapra — 20-30 lines showing RISK and CHURN sections). Let the reader see what the agent sees.

The CTA is just `npx mapra`. Don't oversell. The data already did the selling.

---

### Day 4 — Sunday March 23

**Edit the blog post.**

Read it out loud. Cut anything that sounds like marketing. Cut anything that repeats a point already made. Target: 800-1,200 words. Developers stop reading after 1,500.

Send it to one person for feedback. Ideally someone who uses Claude Code or Cursor.

---

## Week 2 (from publish): Publish the Blog Post and Start Distribution

### Day 5 — Monday March 24

**Incorporate feedback. Final edit.**

Check:
- [ ] Every number in the post matches FINDINGS.md
- [ ] The `npx mapra` command actually works right now
- [ ] All links work
- [ ] No typos in code snippets

---

### Day 6 — Tuesday March 25

**Decide where to publish.**

Options in order of preference:
1. **dev.to** — developer audience, markdown-native, free, shows up in search
2. **Personal blog** (if you have one with existing traffic)
3. **Medium** — broader reach but paywalls hurt distribution

Publish on one platform. Cross-post later if it gets traction.

---

### Day 7 — Wednesday March 26

**Publish the blog post.**

Post it. Share it:
- Twitter/X with the key stat: "45 tool calls → 0. Here's how."
- Relevant Discord servers (Claude Code, Cursor, AI dev tools)
- Hacker News (title: "Show HN: Mapra – pre-computed codebase intelligence for AI agents")
- Reddit r/programming, r/ChatGPTCoding

Don't spam. One post per platform. Let the data do the work.

---

### Days 8-9 — Thursday-Friday March 27-28

**Monitor and respond.**

Watch for:
- npm download numbers
- GitHub stars/issues
- Blog post comments
- Any questions about the format

Reply to every comment in the first 48 hours. This is your only distribution channel right now.

---

## Week 3 (from publish): Anthropic DevRel

### Day 10 — Monday March 31

**Draft the Anthropic DevRel outreach.**

This is a cold email or DM. Keep it under 200 words.

Structure:
```
Subject: .mapra — pre-computed codebase intelligence for Claude Code

Hi [name],

I built mapra, a tool that pre-computes dependency graphs, blast radius,
and architectural topology for codebases. The output is a .mapra file
that Claude Code reads automatically.

I ran 13 controlled experiments across two codebases. The results:
- 45 tool calls → 0 for structural questions
- 78% cost reduction when pairing with cheaper models
- 3/3 blast radius accuracy vs 0/3 without

It's on npm: npx mapra
Blog post with the full data: [link]

I'd love to explore whether .mapra could be a recommended practice in
the Claude Code docs. Happy to share the full experiment data.

Joel
```

That's it. Short, data-led, clear ask.

---

### Day 11 — Tuesday April 1

**Find the right person to email.**

Look for:
- Anthropic DevRel team members on Twitter/X
- Authors of Claude Code blog posts or docs
- People who've posted about Claude Code integrations

LinkedIn or Twitter DM are both fine. If you can find an email, use email.

---

### Day 12 — Wednesday April 2

**Send the outreach.**

Send to 2-3 people max. Not a mass email. Personalize if you can reference something they've written.

---

### Days 13-15 — April 3-7

**Follow up if no response by Day 15.**

One follow-up. Short: "Just checking if this landed in your inbox. Happy to do a quick call or share more data."

If no response by April 7, that's fine. The milestone is "initiate contact," not "get a partnership." The blog post and npm presence are doing distribution work regardless.

---

## Checkpoint Summary

| Date | Milestone | Done? |
|------|-----------|-------|
| March 19 | Published to npm as `mapra` | :white_check_mark: |
| March 26 | Blog post live | |
| April 2 | DevRel email sent | |

After April 7, encoding work (v4, Python scanner, etc.) is unblocked. Not before.
