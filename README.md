# Tulum Trip Vote

Group itinerary and live voting page for Tulum, Dec 16–20. No logins: each person types their name and ticks what they're in for.

## Deploy on Vercel
1. Import this repo in Vercel (no framework, no build settings needed).
2. In the project, open **Storage** → add **Upstash for Redis** (free) and connect it to the project.
3. Redeploy.

Results as CSV: `/api/votes?format=csv`
