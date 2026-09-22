# Transfer Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add searchable players, club and contract negotiation, transfer listing, offers, budgets, and persistent transfer records.

**Architecture:** Transfer operations are pure atomic state transitions in `game.js`; failed operations return an unchanged season plus a Korean reason. `app.js` renders a new transfer view and only persists successful returned states.

**Tech Stack:** JavaScript ES modules, Node.js test runner, HTML, CSS, localStorage

**Spec:** `docs/superpowers/specs/2026-09-22-transfer-market-design.md`

## Global Constraints

- Start the user club with a 300억 원 transfer budget and 5억 원 weekly wage budget.
- Filter by nationality, position, age, maximum value, minimum overall, and name.
- Allow one club counteroffer followed by accept or reject.
- Use 1–5 year contracts and four squad roles.
- Never permit fewer than 18 players or 2 goalkeepers.
- Preserve all earlier game, formation, and detailed-player data while migrating version 3 to version 4.

---

### Task 1: League Squads, Finance, and Migration

**Files:**
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Produces: `createLeagueSquads(season): Player[]`, `clubFinance(teamId): ClubFinance`, `migrateSeason(value): Season`, `searchPlayers(season, filters): Player[]`

- [ ] **Step 1: Write failing tests**

```js
import { migrateSeason, searchPlayers } from "./game.js";

test("version three migration creates eight valid squads and finance", () => {
  const old = createSeason(); old.version = 3;
  const next = migrateSeason(old);
  assert.equal(next.version, 4);
  assert.equal(new Set(next.leaguePlayers.map(({ teamId }) => teamId)).size, 8);
  assert.equal(next.finance["team-0"].transferBudget, 3_000_000);
  assert.equal(next.finance["team-0"].weeklyWageBudget, 50_000);
});

test("search combines all supplied filters", () => {
  const season = migrateSeason(Object.assign(createSeason(), { version: 3 }));
  const result = searchPlayers(season, { position: "FW", minOverall: 70, maxAge: 25 });
  assert.ok(result.every((player) => player.position === "FW" && player.overall >= 70 && player.age <= 25));
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because league, finance, and search functions are missing.

- [ ] **Step 3: Implement deterministic opponent squads and combined filtering**

Generate 18 players per club from team and slot seeds, assign contracts and squad roles, add empty negotiations, offers, transfer history, and transfer lists, and set version 4.

- [ ] **Step 4: Run `node --test game.test.js`**

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add game.js game.test.js
git commit -m "feat: add league squads and transfer search"
```

### Task 2: Atomic Transfer Negotiation

**Files:**
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Produces: `submitTransferBid(season, playerId, amount): TransferResult`, `submitContractOffer(season, negotiationId, offer): TransferResult`, `setTransferListed(season, playerId, listed): TransferResult`, `respondToIncomingOffer(season, offerId, accept): TransferResult`
- `TransferResult` is `{ ok: boolean, season: Season, status: string, reason?: string }`.

- [ ] **Step 1: Write failing tests**

```js
import { migrateSeason, respondToIncomingOffer, submitContractOffer, submitTransferBid } from "./game.js";

const versionFourSeason = () => migrateSeason(Object.assign(createSeason(), { version: 3 }));

function preparedAcceptedClubBid() {
  const season = versionFourSeason();
  const player = season.leaguePlayers.find(({ teamId }) => teamId !== "team-0");
  player.id = "target";
  season.negotiations.push({ id: "neg-1", playerId: player.id, fee: player.marketValue, clubAccepted: true, countered: false });
  return season;
}

function seasonWithIncomingGoalkeeperOffer() {
  const season = versionFourSeason();
  const goalkeepers = season.leaguePlayers.filter(({ teamId, position }) => teamId === "team-0" && position === "GK");
  season.leaguePlayers = season.leaguePlayers.filter(({ id }) => id !== goalkeepers[1].id);
  season.incomingOffers.push({ id: "offer-1", playerId: goalkeepers[0].id, amount: goalkeepers[0].marketValue, teamId: "team-1" });
  return season;
}

test("an over-budget bid changes nothing", () => {
  const season = migrateSeason(Object.assign(createSeason(), { version: 3 }));
  const player = season.leaguePlayers.find(({ teamId }) => teamId !== "team-0");
  const result = submitTransferBid(season, player.id, 9_999_999);
  assert.equal(result.ok, false);
  assert.deepEqual(result.season, season);
});

test("an accepted contract moves player and money atomically", () => {
  const season = preparedAcceptedClubBid();
  const before = season.finance["team-0"].transferBudget;
  const result = submitContractOffer(season, "neg-1", { weeklyWage: 2_000, years: 3, squadRole: "starter" });
  assert.equal(result.ok, true);
  assert.equal(result.season.leaguePlayers.find(({ id }) => id === "target").teamId, "team-0");
  assert.ok(result.season.finance["team-0"].transferBudget < before);
});

test("selling cannot leave fewer than two goalkeepers", () => {
  const season = seasonWithIncomingGoalkeeperOffer();
  const result = respondToIncomingOffer(season, "offer-1", true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /골키퍼/);
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because transfer operations are missing.

- [ ] **Step 3: Implement immutable negotiation transitions**

Validate positive integer money, budgets, one-counteroffer limit, contract years, wage budget, duplicate deals, 18-player minimum, and 2-goalkeeper minimum before cloning and changing state. Append a transfer-history entry only after every validation passes.

- [ ] **Step 4: Run `node --test game.test.js`**

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add game.js game.test.js
git commit -m "feat: add atomic transfer negotiations"
```

### Task 3: Transfer Market Interface and Round Offers

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Consumes: Task 1 search and Task 2 transfer transitions.
- Produces: transfer navigation, filters, bid and contract dialogs, transfer-list controls, incoming offers, and round-end AI offers.

- [ ] **Step 1: Write the failing round-offer test**

```js
import { generateIncomingOffers, migrateSeason } from "./game.js";

function listedPlayerSeason() {
  const season = migrateSeason(Object.assign(createSeason(), { version: 3 }));
  const player = season.leaguePlayers.find(({ teamId, position }) => teamId === "team-0" && position !== "GK");
  season.transferListedIds.push(player.id);
  return season;
}

test("round offers target listed players and stay near market value", () => {
  const season = listedPlayerSeason();
  const offers = generateIncomingOffers(season, () => 0.5);
  assert.ok(offers.every(({ playerId, amount }) => season.transferListedIds.includes(playerId) && amount > 0));
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because `generateIncomingOffers` is missing.

- [ ] **Step 3: Implement one seeded round-end offer pass**

Generate at most two offers after each completed round, skip players already in negotiation, and store offer IDs so repeated round completion cannot duplicate them.

- [ ] **Step 4: Add the transfer interface**

Add a fifth navigation button and render budget cards, all six approved search inputs, accessible result rows, bid state, contract state, incoming offers, and transfer history. Disable submission with a visible Korean explanation when validation fails.

- [ ] **Step 5: Verify and run final checks**

In a browser, filter players, complete one purchase, list one eligible player, complete a round, and accept or reject an incoming offer. Reload and verify finance, contracts, offers, and history persist. Run `node --test game.test.js && node --check app.js && git diff --check`.

- [ ] **Step 6: Commit**

```bash
git add index.html app.js styles.css game.js game.test.js
git commit -m "feat: add playable transfer market"
```
