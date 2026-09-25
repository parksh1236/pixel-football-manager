# Free football player data for the game

Checked 2026-09-25. Goal: use real-world data to calibrate game attributes without shipping a risky or misleading real-player ratings database.

## Recommended sources

| Source | What it contains | License / public-repo fit | Use here |
|---|---|---|---|
| [Pappalardo & Massucco, Soccer match event dataset (Figshare)](https://figshare.com/collections/Soccer_match_event_dataset/4415000) | Seven competitions (2017/18 top five European leagues, 2018 World Cup, Euro 2016); about 1,941 matches, 3.25M events and 4,299 players. Events include type/subtype, accuracy tags, time, player ID, team ID, and pitch coordinates. Player records include name, birth date, preferred foot, height/weight, nationality, team, and broad role. | Paper and event record say **CC BY 4.0**. Suitable for public redistribution/adaptation with attribution, license link, and indication of changes. Keep attribution separate from the game/code license. | **Best source to calibrate fictional attributes** from observed performance by player and role. Prefer derived position-level distributions over shipping real-player ratings or raw data. |
| [openfootball/players](https://github.com/openfootball/players) | Country-by-country real player names, broad position (G/D/M/F), height and birth information. No performance or skill ratings. | Repository declares **CC0-1.0**, including commercial reuse. CC0 does not itself clear all possible third-party publicity/privacy rights, so avoid implying endorsement or using likenesses. | Optional roster identity/position reference only; not a source for ability scores. |
| [StatsBomb Open Data](https://github.com/statsbomb/open-data) | Selected competitions/seasons with event, lineup and some 360 data. | Freely available under the StatsBomb user agreement for research/analysis; terms require source attribution and logo. No clear blanket commercial-game redistribution grant was verified. | Do not bundle into this public game or use as a shipped ratings source without explicit rights review. |

## Mapping event data to this game's attributes

Calculate per-90 rates and success rates over a minimum playing-time threshold; compare each player with others in the same broad role/position and season. Convert the resulting percentile to the game's existing attribute scale (e.g. percentile × scale maximum), then apply small gameplay-balancing adjustments. This avoids assigning higher scores just because someone played more minutes or occupied a role with more opportunities.

### Extracted reference (Wyscout events, seven competitions)

I downloaded the published Events and Players files to a temporary directory and aggregated event success rates by player and broad role. The app repository does not contain the raw files. The processed files yielded 3,035 event-active player IDs that matched the player metadata. For each measure, only players above the attempt minimum were included; values below are the 25th percentile / median / 75th percentile of individual success rates (not official skill ratings):

| Role | Passing accuracy (50+ passes) | Goals / shots (8+ shots) | Successful attacking duels (8+) | Accurate defending duels (8+) | Accurate aerial duels (5+) |
|---|---:|---:|---:|---:|---:|
| Defender | 78.3 / 83.2 / 87.2% | 0 / 7.7 / 13.0% | 79.3 / 84.1 / 88.9% | 50.0 / 55.2 / 60.0% | 55.6 / 63.0 / 69.8% |
| Midfielder | 78.2 / 83.1 / 87.1% | 0 / 7.0 / 10.8% | 74.3 / 78.4 / 82.2% | 41.8 / 46.2 / 50.4% | 38.5 / 50.0 / 60.0% |
| Forward | 73.0 / 76.2 / 80.1% | 7.7 / 12.5 / 17.9% | 68.9 / 73.1 / 77.7% | 39.3 / 44.8 / 50.0% | 33.3 / 43.2 / 51.0% |

This supports the broad game balance (forwards get the strongest finishing baseline, defenders stronger defensive/aerial baselines, midfielders stronger passing baselines). Do not treat these rates as a direct numeric 1–20 mapping: compare each player's result against the same-role distribution first. These are single-season, event-only estimates; event success is not identical to technical ability.

| Game attribute | Observable proxy from events | Confidence / limitation |
|---|---|---|
| Finishing | Goals and shots on target per shot; separate penalties if possible | Medium. Few shots make single-season estimates noisy. |
| Passing | Accurate/attempted passes; weight progressive and key passes more than routine passes | High for execution; vision is not the same thing. |
| Dribbling | Successful take-ons / dribble duels per attempt | Medium; depends on event definitions and opponent strength. |
| Tackling | Won defensive/ground duels and tackles per attempt | Medium; not all defensive actions are tackles. |
| Marking | Interceptions/duels in defensive zones and defensive event involvement | Low. Events are not a direct measure of off-ball marking; retain as a design prior. |
| Heading | Won aerial duels / aerial-duel attempts | Medium; this indicates aerial success, not heading technique alone. |
| Strength | Aerial/physical duel win rate, optionally informed by listed height/weight | Low. Body size is not strength; use only a weak adjustment. |
| Pace | No reliable speed measurement in event logs | Not inferable; retain a role/archetype prior unless tracking/GPS data with suitable rights is found. |
| Stamina | No workload/physical tracking measure adequate for stamina | Not inferable; retain a game-design prior. |
| Reflexes | Goalkeeper save outcomes, if a suitable keeper-specific event subset is available | Low/incomplete in this dataset; do not infer reflexes from team results. |
| Vision | Key/progressive pass creation and pass destinations | Low-to-medium proxy; opportunity and tactics affect it. |
| Flair | Take-on frequency, unusual/creative actions and risky passes | Low; style is not a directly measured skill. |
| Mentality | Consistency/clutch/discipline indicators across matches | Low; cards and outcomes are not personality measurements. Keep as a gameplay prior. |
| Genius | No objective source field | Design-only trait; generate rarely and independently rather than claiming it is measured. |

## Recommendation

Use the Wyscout-derived events only to calibrate **fictional** players: compute role-specific percentiles for finishing, passing, dribbling, tackling, aerial ability, and cautious vision/flair proxies. Keep pace, stamina, reflexes, mentality and genius generated/balanced by the game until suitable direct data with compatible rights exists. Do not ship the 73.74 MB raw events file unless needed; if derived values are committed, add a data attribution notice naming Pappalardo & Massucco, linking the dataset and CC BY 4.0, and stating that game ratings are transformed estimates—not official ratings. For real names/positions only, openfootball is the simpler CC0 source, but keep the game's current fictional identity model by default.

## Primary sources

- [Figshare collection and dataset description](https://figshare.com/collections/Soccer_match_event_dataset/4415000)
- [Figshare Events item, fields and CC BY 4.0 license](https://figshare.com/articles/dataset/Events/7770599)
- [Dataset paper, scope, player/event fields and license](https://www.nature.com/articles/s41597-019-0247-7)
- [openfootball player dataset](https://github.com/openfootball/players) and its [CC0 license](https://github.com/openfootball/players/blob/master/LICENSE.md)
- [StatsBomb Open Data repository/terms](https://github.com/statsbomb/open-data)
