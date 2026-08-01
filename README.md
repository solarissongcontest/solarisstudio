# Solaris Studio

Create a professional web application called "Solaris Scoreboard Studio" for the Terra Solaris universe and Solaris Song Contest (SSC).

The goal is to build a modern Eurovision-style voting management, scoreboard, statistics, and broadcast presentation platform inspired by Scoryx, ScoreWIZ, and Eurovisionworld, but fully customized for fictional Terra Solaris countries.

The application should allow organizers to create contests, manage voting, run animated live results, and analyze detailed voting patterns.

Use:

- React + TypeScript

- Tailwind CSS

- Supabase for database/auth/storage

- Modern glassmorphism UI design

- Smooth animations using Framer Motion

- Responsive desktop-first design

==================================================

CORE CONCEPT

==================================================

The platform manages Solaris Song Contest editions.

Each edition contains:

- Countries from Terra Solaris

- Contestants

- Songs

- Jury votes

- Televote results

- Final scoreboard

- Statistics

- Historical data

Everything should support multiple SSC editions.

==================================================

DATABASE STRUCTURE

==================================================

Create database tables:

countries:

- id

- name

- short_code

- flag_image

- region

- description

- first_participation

- statistics

editions:

- id

- name

- year

- host_country

- logo

- theme_colors

- status

participants:

- id

- edition_id

- country_id

- artist

- song

- running_order

- semi_final

jury_votes:

- id

- edition_id

- voter_country_id

- receiving_country_id

- points

televote_votes:

- id

- edition_id

- country_id

- points

results:

- id

- edition_id

- country_id

- jury_points

- televote_points

- total_points

- final_rank

voting_history:

- stores all historical voting relationships between countries

==================================================

ADMIN DASHBOARD

==================================================

Create an organizer dashboard.

Features:

- Create new SSC editions

- Add/remove Terra Solaris countries

- Upload flags and logos

- Add artists and songs

- Set running order

- Enter jury votes

- Enter televote results

- Preview final results

- Start broadcast mode

- Export results

==================================================

JURY VOTING SYSTEM

==================================================

Create a Eurovision-style jury input system.

Allow organizers to enter:

1 point

2 points

3 points

4 points

5 points

6 points

7 points

8 points

10 points

12 points

Validation:

- Country cannot vote for itself

- No duplicate points

- Must assign correct amount of votes

- Save automatically

==================================================

TELEVOTE SYSTEM

==================================================

Allow manual entry of televote points.

Support:

- Eurovision style points

- Custom point systems

- Percentage weighting

- Jury/televote split customization

Examples:

- 50/50

- 60/40

- Custom formulas

==================================================

LIVE BROADCAST MODE

==================================================

Create a full-screen animated scoreboard presentation.

It should feel like a real TV broadcast.

Features:

Opening animation:

- Contest logo reveal

- Theme background

- Music placeholder

- "The voting begins"

Jury sequence:

For each country:

Show:

- Country flag

- Spokesperson area

- Current leaderboard

- Animated points appearing one by one

Sequence:

1 point

2 points

3 points

4 points

5 points

6 points

7 points

8 points

10 points

12 points

The 12 points should have:

- Bigger animation

- Sound effect placeholder

- Highlight effect

- Smooth leaderboard update

Controls:

- Play

- Pause

- Next vote

- Previous vote

- Skip animation

- Jump to country

- Fullscreen mode

==================================================

TELEVOTE REVEAL

==================================================

Create multiple reveal modes:

Mode 1:

Eurovision style:

Reveal televote from lowest jury score upward.

Mode 2:

Country-by-country televote reveal.

Mode 3:

Custom reveal order.

Include:

- Dramatic animations

- Leader changes

- Winner reveal animation

- Confetti effect

==================================================

CUSTOMIZATION SYSTEM

==================================================

Allow organizers to customize:

Visual theme:

- Background

- Colors

- Fonts

- Glass effect strength

- Blur amount

- Border radius

- Shadows

Broadcast:

- Logos

- Flags

- Animations

- Transition styles

- Sound effects

- Background videos

Scoreboard:

- Layout

- Country cards

- Ranking style

- Point animations

==================================================

STATISTICS CENTER

==================================================

Create a complete analytics dashboard after every contest.

Include:

Basic statistics:

- Final ranking

- Jury ranking

- Televote ranking

- Total ranking

- Points received

- Points given

- Highest score

- Lowest score

==================================================

VOTING RELATIONSHIP ANALYSIS

==================================================

Create Eurovisionworld-style voting analysis.

For every Terra Solaris country show:

"How countries voted for this country"

Example:

Country profile:

Asteria received:

Jury:

Country X - 12 points

Country Y - 10 points

Televote:

Country Z - 12 points

Also show:

"How this country voted"

Example:

Asteria gave:

12 points → Country A

10 points → Country B

==================================================

ADVANCED VOTING PATTERN ANALYSIS

==================================================

Create advanced statistics:

Voting matrix:

- Full country-to-country voting table

12 point map:

- Interactive map showing every 12 point exchange

Friendship graph:

- Countries with strong voting relationships

Alliance detection:

Automatically detect countries that frequently support each other.

Voting similarity:

Compare countries based on how similarly they vote.

Example:

Country A and Country B:

92% voting similarity

Voting clusters:

Automatically identify groups of countries with similar patterns.

One-sided relationships:

Example:

"Country A frequently supports Country B, but Country B rarely returns points."

Voting bias analysis:

Detect:

- Regional preference

- Historical alliances

- Language/cultural patterns

==================================================

COUNTRY PROFILE PAGES

==================================================

Every Terra Solaris country gets a profile.

Show:

- Participations

- Wins

- Average placement

- Best result

- Worst result

- Qualification rate

- Total points received

- Total points given

- 12 points received

- 12 points given

- Historical results graph

- Voting relationships

- Biggest supporters

- Biggest rivals

==================================================

RECORDS DATABASE

==================================================

Automatically calculate:

- Highest score ever

- Lowest winning score

- Largest winning margin

- Closest final

- Most 12 points received

- Most 12 points given

- Biggest comeback

- Biggest televote climb

- Biggest jury drop

- Most successful country

- Longest winning streak

- Most consistent country

==================================================

VISUALIZATIONS

==================================================

Add interactive charts:

- Jury vs televote comparison

- Voting heatmap

- Country relationship network

- Points timeline

- Leaderboard progression

- Vote flow animation

- Historical performance charts

==================================================

DESIGN

==================================================

The design should feel like a premium international contest platform.

Style:

- Dark futuristic theme

- Frosted glass panels

- Smooth animations

- Modern typography

- Elegant gradients

- Broadcast-quality visuals

The interface should feel like a combination of:

- Eurovision broadcast graphics

- Professional sports analytics dashboard

- Modern SaaS platform

==================================================

FINAL GOAL

==================================================

Create the ultimate Solaris Song Contest management platform.

It should not only calculate points but create a complete experience:

- Organize contests

- Run live voting shows

- Analyze Terra Solaris voting history

- Discover voting patterns

- Create professional broadcast results

- Preserve SSC history across editions

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://solarisstudio.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4677004e-1f85-4ed4-b23a-b11bcfa45a6f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Package manager

This project uses **Bun** (`bunfig.toml`, `bun.lock`). The stale `package-lock.json`
was removed so there is a single authoritative lockfile.

```bash
bun install
bun run dev      # local development
bun run build    # production build (Cloudflare Workers output)
bun run lint
```

## Environment variables

Copy `.env.example` to `.env`. Only public, browser-safe values belong there:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
(plus their non-prefixed SSR mirrors). The service-role key and database password
must never appear in the repository or in client code. `.env` is git-ignored.

## Cloudflare Workers deployment

The build already targets Cloudflare Workers. `bun run build` emits:

- `dist/server/` — the Worker (SSR + server functions)
- `dist/client/` — static assets
- `dist/server/wrangler.json` — generated Wrangler config (do not hand-edit)

Deploy the prebuilt output:

```bash
bun run build
npx nitro deploy --prebuilt
# or: npx wrangler deploy --config dist/server/wrangler.json
```

Do **not** add `@cloudflare/vite-plugin` — the Lovable/Nitro Vite config already
produces the Workers bundle, and adding it duplicates the build target.

### Connecting the GitHub repository

1. Create a free Cloudflare account and open **Workers & Pages**.
2. Import the GitHub repository and select `main` as the production branch.
3. Build command: `bun install && bun run build`
4. Deploy command: `npx nitro deploy --prebuilt`
5. Add the `VITE_SUPABASE_*` variables in the Cloudflare dashboard.
6. Deploy and copy the resulting `*.workers.dev` URL.

### Supabase authentication URLs (manual step)

After the production URL exists, set it in the backend auth settings:

- Site URL: `https://<your-worker>.workers.dev`
- Redirect URLs: `https://<your-worker>.workers.dev/**` (keep `http://localhost:8080/**` for local development)

## Development-only data reset

`scripts/reset-demo-data.sql` clears contest data for a fresh local seed. It
refuses to run unless `solaris.allow_demo_reset` is set. **Never run it against
production.** Schema migrations no longer contain destructive deletes.
