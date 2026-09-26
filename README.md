# QuickPitch AI

Turn rough sales-call notes into a clear, client-ready proposal in minutes.

Type what you know straight after the call (half-sentences are fine). Pick a length (1, 6, 8 or 30 pages). QuickPitch writes the summary, scope, options, pricing, timeline and terms, then you save it as a branded PDF.

## How it works

- **Runs on your computer.** Proposals are written with your own Claude plan through [Claude Code](https://claude.com/claude-code). No API key, no per-proposal cost.
- **Knows your business.** Each account has a business profile: what you do, services and standard pricing, ideal clients, tone and standard terms. Every proposal uses it.
- **Never invents numbers.** Prices and terms come from your notes first, then your profile's standard pricing, otherwise "To be confirmed".
- **Your data stays local.** Accounts and proposals are saved in `data/db.json` on your machine (git-ignored).

## Run it

You need [Node.js](https://nodejs.org) 20+ and Claude Code, logged in.

```bash
git clone https://github.com/Rmtech2006/QuickPitchAi.git
cd QuickPitchAi
npm install
npm run dev
```

Open http://localhost:5173, create an account, fill in your business profile, and write your first proposal.

## Status

Early version. Accounts are local and have no passwords, since the app runs only on your own machine. The hosted page at quickpitchai.vercel.app explains setup; it can't write proposals by itself.

## Stack

Vite, React, TypeScript, zod. Proposal generation runs `claude -p` with a JSON schema for structured output.
