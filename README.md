# Line of Battle — prototype 03

A playable Age-of-Sail strategy prototype: steer the flagship and let the line follow its wake. Each ready ship automatically fires when an enemy bears within its broadside arc and 350 m engagement envelope.

Open `index.html` in a browser,. No installation is required.

## Commands

- Hold and drag on the sea to steer; release to hold course.
- Left/right arrows or A/D turn your flagship.
- Space pauses or resumes. R returns to battle setup.
- Resign ends the battle and awards victory to the opposing fleet; it also works while paused.
- A second player uses J/L to steer and has a separate resign button. Both fleets fire automatically.

## What changed

Manual firing controls are removed. Each side reloads independently and fires as soon as a clear enemy target enters its firing arc. Hulls mask friendly guns, and residual shot can pass through a first hull into a second, including a friendly ship.

The same solid hull outline governs movement, drawing and shot intersection. Ships cannot overlap. Contact checks movement and fouls rigging; crews back along the wake to clear the obstruction, with following ships backing to preserve their interval. When a ship strikes, an empty section of the wake is routed around its solid hull; survivors keep their positions and then follow the revised route. A promoted leader can steer around its disabled predecessor. Followers can lag and queue. A surviving ship takes over at its own position when the leader is lost.

Raking fire uses the actual length of the shot's path through the hull to damage fighting strength. It no longer applies a flat 1.5× hull-damage bonus. Stern entries can impair the rudder. Hull integrity, fighting strength, rigging and steering have separate effects. Ships can strike their colours while still afloat and remain solid obstacles.

A fixed northerly wind changes sailing speed. Maximum speed is approximately 7.8 knots; the baseline reload is two simulated minutes. Brisk is the default: 24× simulated time, twice the previous pace. Measured (12×) and Fast (36×) are selectable during play. Sailing, turning and reloads accelerate together, preserving simulated ship speeds and gun drill times. Three shot markers represent groups of guns rather than a ship's literal battery.

## Historical basis and limits

Read `RESEARCH.md` or the in-game research page for sources and an explicit table of numerical assumptions. The research includes period fighting instructions, battle logs, Captain Lucas's report, and material from Royal Museums Greenwich, USS Constitution Museum and the Naval History and Heritage Command.

This is a teaching prototype, not a validated historical simulator. Formation spacing, the wind polar, gun arcs, engagement range, damage coefficients and surrender threshold are game assumptions. Sail handling, currents, sea-state roll, vertical ballistics, smoke obscuration, boarding, damage control and individual captain initiative are omitted. Struck hulls do not drift, and sinking hulls clear immediately. The camera follows the fleet over open sea with no movement walls. Arrows indicate groups of ships beyond view, with direction and distance. A warning begins 2.8 km from the initial battle centre. A flagship that remains beyond 3.6 km for twelve real seconds automatically retreats and concedes the battle; re-entry cancels the countdown, and pausing freezes it. These are gameplay rules. The same rule applies to either fleet; simultaneous withdrawal is a draw. The computer opponent uses simple broadside positioning and obstacle avoidance. There is no online multiplayer, sound or save-game system.

## Verification

Twenty-nine simulation checks cover immediate automatic fire, independent sides, arc and range restrictions, gun masking, raking geometry, projectile penetration, head-on and crossing collisions, follower queues, wind and damage effects, striking, resignation, draws, and a complete deterministic battle with non-overlapping hulls. The new regressions also check continued motion after straight and curved flagship losses, stranded middle ships, adjacent losses, bounded displacement without teleporting, steering after promotion, unrestricted coordinates, retreat warning/re-entry/withdrawal, and pace invariants. Browser checks cover the visible controls, scrolling sea and battle lifecycle.

`game.js` is the simulation; `ui.js` draws the chart and handles input. No external libraries or assets are required.
