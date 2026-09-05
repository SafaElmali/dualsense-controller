# DualSense Controller

An interactive PS5 DualSense recreation built with HTML, CSS, JavaScript, and Three.js. The model, textures, and Three.js modules are included locally; the controller works without an external CDN. Netlify builds a static publish folder and a leaderboard function. Optional analytics loads from PostHog; blocking it does not affect the controller.

## Run locally

Serve the repository over HTTP rather than opening `index.html` directly. With Python 3 installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [localhost:8000](http://localhost:8000).

## Interactions

- Click or tap the buttons.
- Drag either analog stick; release to center. A short tap clicks L3 or R3.
- Hold a trigger and drag upward to vary its pressure.
- **Auto** follows your inputs: L2/R2 show a tilted rear view, L1/R1 show the shoulders, and face buttons or sticks show the front. Held triggers take priority so aiming and firing do not flip the camera back and forth. The last angle stays after release. All buttons glow soft yellow while pressed; trigger caps also light up, with live L2/R2 pressure labels in the automatic rear view.
- Drag the shell to rotate the controller; scroll to zoom. Dragging or choosing a fixed angle pauses Auto. Choose Auto to resume, or Reset to restore the front and Auto. Camera movement respects reduced-motion preferences.
- Choose Front, Angle, or Back, and switch between White, Midnight Black, and Cosmic Red finishes.
- Enable optional button sounds or connect a standard-mapped gamepad to mirror its inputs.

| Control | Keyboard |
| --- | --- |
| Left stick | W, A, S, D |
| Right stick | I, J, K, L |
| D-pad | Arrow keys |
| Triangle / Circle / Cross / Square | 4 / 2 / X / Z |
| L1 / R1 | Q / E |
| L2 / R2 | 1 / 3 |
| L3 / R3 | F / H |
| Home / Mute / Touchpad | Space / M / T |
| Create / Options | C / Escape |

Home toggles the simulated light bars. Microphone mute remains a visual simulation. A connected DualSense can produce real adaptive trigger resistance through the optional hardware controls below.

## Tests

Node.js 20 or newer is required for the tests. Run `npm ci` to install the server storage dependency.

```sh
npm test
```

Tests cover simultaneous input sources, trigger pressure, circular stick travel, input priority, and release on focus loss.

## Files

- `index.html` — page and controls.
- `controller/controller.css` — layout and appearance.
- `controller/controller-app.js` — mouse, touch, keyboard, gamepad, and UI handling.
- `controller/controller-view.js` — Three.js scene, materials, raycasting, and moving parts.
- `controller/input-state.js` — shared input state service.
- `controller/dualsense.glb` — model with separate interactive parts and embedded textures.
- `controller/vendor/three/` — Three.js 0.180.0 and the required add-ons.
- `tests/` — input behavior tests.

## Attribution

The 3D model is **PS5 Controller** by **Taohid Animation**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Original model and creator](https://sketchfab.com/3d-models/ps5-controller-b7bb9c5102a04cb0b1966c6d02bad7d6).

The model was adapted for interaction, with separated controls, adjusted materials, and projected button markings. Full source and modification details are in [controller/ATTRIBUTION.md](controller/ATTRIBUTION.md).

Three.js is distributed under its included [MIT license](controller/vendor/three/LICENSE).

This is an independent visual recreation, not an official Sony product or a verified dimensional CAD model. PlayStation and DualSense are trademarks of Sony Interactive Entertainment.

## Analytics

[Open the Visitors & Usage dashboard](https://us.posthog.com/project/594399/dashboard/2066186). It shows production traffic over the last 30 days; development test events are excluded.

[PostHog project](https://us.posthog.com/project/594399) tracks this demo with cookieless analytics, no identified person profiles, no session recordings, and no automatic click/keyboard capture. Do Not Track is respected. Unique visitors are estimates and cookieless identity resets daily.

Localhost traffic is disabled by default. For an explicit integration test open `http://localhost:5173/controller.html?analytics_test=1` in the original preview, or `http://localhost:8000/?analytics_test=1` here. Those events have `environment=development`; filter dashboards to `environment=production` for real traffic.

| Event | Meaning |
| --- | --- |
| `$pageview` | Page opened; includes referrer and campaign information |
| `controller_loaded` | 3D model successfully ready |
| `controller_interacted` | First meaningful interaction, once per page visit |
| `controller_feature_used` | Button, stick, rotate, zoom, view, finish, or sound; once per feature per visit |
| `controller_finish_selected` | Selected finish, once per color per visit |
| `controller_gamepad_connected` | Gamepad found, once per page visit; no device identifier captured |
| `controller_active_time` | Incremental `seconds` of estimated active use; stops after 5 seconds of inactivity or when hidden/unfocused |

A visit here means one page load. Sum `controller_active_time.seconds` for active time; count `controller_interacted` for engaged page visits or use unique users for estimated people. Do not treat total events as visitor counts. Tracking begins only after the updated files are deployed.

The public project token in `controller/analytics.js` only allows event ingestion; it cannot read analytics or manage the account. If you fork the project, replace it with your own token. Cookieless server hash mode must be enabled in PostHog project settings.

## Real adaptive triggers

In desktop Chrome or Edge, connect a Sony DualSense or DualSense Edge using USB or Bluetooth, then click **Enable trigger effects** and select it in the browser device picker. **Pistol** (default, previously Shooting) creates a crisp resistance wall and release. **Shotgun** has a heavier, longer pull before the break. Release to rearm either single-shot effect. **LMG** cycles strong trigger pulses at 10 Hz while held past the first third of travel. **SMG** uses lighter, faster pulses at 18 Hz. Release the physical trigger to stop the pulses. **Resistance** provides the original gentle, steady force. These are stylized presets, not replicas of real weapons or a specific game. You can switch effects while enabled; changing modes while Off leaves them off. Squeeze the physical L2/R2 triggers to feel it; the Gamepad API continues to mirror your inputs.

**Off**, **Reset**, opening Controls, and leaving the tab send the explicit Off effect. Returning to the tab requires enabling effects again. Closing the page attempts to release and close the device; abrupt browser termination cannot guarantee a final hardware message. Disconnect the controller if resistance persists.

Safari, Firefox, and browsers without WebHID keep the virtual controls but disable hardware effects. HTTPS or localhost is required. If Bluetooth is unavailable or another controller app has exclusive access, try a USB data cable and close that app.

The feature sends only adaptive-trigger output fields, with no audio, rumble, light, or microphone commands. It does not recreate a particular game's trigger patterns. Software checks cover packet encoding, Bluetooth CRC, unsupported devices, canceled selection, all gun presets and mode switching, concurrent Off, failed writes, and disconnect cleanup. Physical hardware feel requires manual verification.

Protocol references and the adapted trigger encoder's license are in [controller/TRIGGER-NOTICES.md](controller/TRIGGER-NOTICES.md).

## Controller colors

Click the colored circle beside the 3D controller to open **Make it yours**. The **Light** tab changes the glow around the touchpad; **Body** changes the 3D shell, including the touchpad surface. Each has six quick colors, a native custom color picker, a six-digit hex field, and its own reset. The two colors are independent. The existing finish swatches still apply their full shell/button palette and update the Body picker. Colors last for this page visit.

**Sync controller light** connects a physical DualSense through WebHID (desktop Chrome or Edge) and sends the chosen RGB light color without enabling trigger effects. Subsequent Light changes sync after a short debounce. **Stop light sync** stops sending new colors; the physical LEDs keep their last color. Disconnecting clears sync, so reconnecting requires enabling it again. Body coloring is visual only. Changing the shell never prompts for hardware permission.

LED setup and color reports share the controller's existing serialized output queue and Bluetooth sequence/CRC. They enable only lightbar fields; trigger, audio, microphone, rumble, and player-indicator fields remain untouched. A failed LED write stops light sync without changing the trigger state. PostHog counts picker opens, committed light/body color changes, resets, and sync on/off; it receives neither RGB values nor device identifiers.

## Controller battery

The header has a beveled Three.js battery, charge percentage, USB/Bluetooth icon, and a lightning bolt while the controller reports charging. Click the battery to grant controller access in desktop Chrome or Edge. It also starts reading automatically when touchpad, gyro, or adaptive triggers establish the shared WebHID connection. Reading the battery does not enable trigger effects. Hover, focus, or tap the badge for connection and charging details.

This is the controller's battery, not the computer's. DualSense reports coarse 10% intervals; the displayed percentage uses the interval midpoint (5%, 15%, … 95%, capped at 100%) following the Linux driver. Unknown readings show **—%** instead of an invented level. Full charge shows 100%; charging faults are identified in the tooltip. Low charge turns amber, then red. Basic Bluetooth packets contain no battery reading; try a USB data cable if the badge keeps waiting. Disconnecting clears the previous reading.

The small 3D scene renders only on reading or size changes, with a CSS battery fallback if WebGL is unavailable. Battery status remains active when touchpad or gyro is toggled off. PostHog counts `controller_battery_connect_requested` and one `controller_battery_reading_available` per page visit; no charge level, hardware identifiers, or sensor packets are transmitted.

## Touchpad finger tracking

Use the **touchpad icon beside the 3D controller** in desktop Chrome or Edge and select your DualSense. The compact toolbar contains touchpad and gyro toggles plus gyro recentering. Hover or keyboard-focus an icon for its label and connection details; gold indicates an enabled feature. The toolbar sits below the controller on narrow screens.

Touchpad tracking shares the hardware connection with adaptive triggers and does not enable trigger effects. Click its icon again to disable physical finger tracking without disconnecting gyro or adaptive triggers. USB and full Bluetooth reports carry up to two finger positions; the app draws a yellow circle for each contact without requiring a touchpad click. Moving or lifting a finger updates or removes its circle. You can also drag the on-screen touchpad. No vibration is added. PostHog records explicit `controller_touchpad_enabled` and `controller_touchpad_disabled` actions without finger coordinates.

Auto brings the touchpad into view when touched (held triggers retain camera priority). Finger circles clear on focus loss, Reset, and disconnect. Bluetooth tracking requests the extended input report via feature report 0x05; try USB if your browser/controller cannot provide it. Normal Gamepad API input alone cannot provide finger positions. Touch coordinates stay in the browser and are not sent to analytics.

## Target practice

Choose **Play target practice** beneath the page title to open a 20-second arcade round. Three moving bullseyes respawn after hits. Center hits score 100, outer hits score 50, and consecutive hits add a bonus up to 50 per hit. The HUD shows score, time, accuracy, streak, and a personal best stored only in your browser.

- **Controller:** right stick aims, R2 fires, Triangle cycles weapons, and Cross starts/replays/resumes a round.
- **Mouse:** aim and click; hold for automatic weapons. **Touchscreen:** tap targets.
- **Keyboard:** WASD or arrows aim, Space fires, and 1–4 select Pistol, Shotgun, LMG, or SMG.
- Pistol and Shotgun require release between shots. Shotgun has a wider hit area; LMG and SMG fire continuously at their preset cadence. Release R2 after switching weapons to rearm.
- Enable adaptive triggers before starting or while paused to feel the selected preset. Playing itself needs no hardware permission. The range uses the existing trigger connection and changes both L2/R2 to the chosen preset without adding rumble or touchpad vibration.
- Pause, losing focus, hiding the tab, finishing, and closing the range stop firing and release trigger effects. Resume preserves the score and timer, but hardware effects must be enabled again. Closing restores the interactive 3D controller.

The range uses a separate Canvas 2D renderer and suspends the 3D render while open. Tests cover target collision/scoring, cooldowns, automatic-fire cadence, single-shot rearming, pause/resume, round completion, and aiming bounds.

## Touchpad drawing

Open **Touchpad drawing** below the hardware controls. Move one or two fingers on an enabled physical touchpad, or drag across the canvas with a mouse or touchscreen. Choose soft gold, ice blue, or lilac; lifting a finger starts a separate stroke. **Save drawing** exports a 1200 × 735 PNG with a small studio footer. **Clear canvas** starts over. Closing the panel preserves the drawing in memory; refreshing clears it. The canvas caps recorded points at 20,000 and announces when it is full. Drawing adds no vibration and sends no coordinates or artwork to a server.

## Custom trigger presets

Expand **Customize & share this preset** under **Feel the triggers**. Strength runs from 1 to 8. LMG and SMG also support pulse speeds from 1 to 30 Hz; single-shot and steady-resistance modes do not use a pulse speed. Slider changes apply when released, using the existing serialized hardware writes. **Reset preset** restores the selected mode's defaults. Changing the mode also restores its defaults.

**Copy preset link** puts the mode, strength, and speed in the URL fragment. A visible link is provided if clipboard access is unavailable. Loading a link validates all settings and never requests controller access or enables effects. The recipient must choose **Enable trigger effects**. Customization while Off stays off. Target practice selects each weapon's default physical preset to keep its established firing cadence.

## Controller diagnostics

Open **Controller diagnostics**, connect a gamepad, and press a button if the browser has not detected it. The panel displays the first four raw stick axes without the 3D viewer's added deadzone. **Measure resting sticks** samples for two seconds and reports the mean offset from center plus the greatest offset seen. Let go of the sticks during this measurement. Focus loss cancels an incomplete measurement.

For a standard-mapped controller, L2 and R2 show current travel and observed minimum/maximum values. Each button shows its current press/release state and press count. **Reset readings**, reconnecting, or opening the panel starts a new check. These are browser-reported readings, not a hardware calibration, fault diagnosis, or end-to-end latency test. Opening diagnostics releases adaptive trigger effects.

## Shareable scorecards

Finish a target-practice round, then choose **Download scorecard**. The 1200 × 675 PNG includes the score, accuracy, hits/shots, and every weapon actually fired during that round. Switching weapons after completion cannot change the card, and replay cannot change a download already started. Empty rounds explicitly say no shots were fired. Cards are generated locally. Players can separately choose to submit their round to the public leaderboard.

### Studio feature analytics

The new tools send explicit PostHog events through the same cookieless client and development/production filters. `controller_feature_used` counts each feature once per page visit: `touchpad_drawing`, `trigger_presets`, `diagnostics`, `scorecard`, and `target_practice`. For feature reach, count unique visitors or feature-used events; action events below can repeat in one visit.

| Events | Meaning and properties |
| --- | --- |
| `controller_touchpad_drawing_opened`, `_started`, `_cleared`, `_exported`, `_export_failed` | Panel opens, first drawing input, clears, successful PNG generation/download requests, and failed exports. `_started` is once per input source per page visit, with `input_source=hardware` or `pointer`. |
| `controller_trigger_presets_opened`, `_changed`, `_reset` | Editor opened by the user, committed mode/slider changes, or defaults restored. Changes include `mode`, `strength`, and `speed_hz`; resets include `mode`. Slider movement does not send a per-frame stream. |
| `controller_trigger_presets_link_created`, `_link_copied`, `_loaded` | Link prepared, successfully copied through the clipboard API or manual copy action, and valid shared preset loaded. Custom properties are `mode`, `strength`, and `speed_hz`. Loading alone does not count as an engaged visit. |
| `controller_diagnostics_opened`, `_connected`, `_measurement_started`, `_measurement_completed`, `_reset` | Panel use and two-second resting measurements. Connection is counted once per page visit. Canceled measurements do not emit completion. No raw readings or device identifiers are included. |
| `controller_target_practice_started`, `_completed` | New rounds (resuming does not count as a start), with starting `mode`; completion includes `score`, `hits`, `shots`, `accuracy`, and `weapons`. |
| `controller_scorecard_exported`, `_export_failed` | Scorecard PNG generated and download requested, or export failure. Success includes the completed round's `score`, `hits`, `shots`, `accuracy`, and `weapons`. |

In this table, each underscored suffix continues the full event prefix in its row. An export event confirms PNG generation and a browser download request; it cannot confirm that the user saved the file to disk or posted it elsewhere. Custom properties use an allowlist; the existing PostHog client also attaches standard page/browser metadata. No artwork, touch coordinates, stick/trigger readings, controller IDs, or raw error messages are sent. Blocked analytics never interrupts the tools.

To verify in PostHog, open **Activity → Events**, filter event names by the prefixes above, and filter `app=dualsense-controller` plus `environment=production`. For development checks use `?analytics_test=1` on localhost and `environment=development`; these are excluded from the production dashboard.


## Community leaderboard

Open **Play target practice**, then choose **Leaderboard** in the game header. The public board shows the top 50 submitted scores with nickname, accuracy, and weapons used. The 20-second format uses a separate board and local personal best so older, longer rounds do not compete with it. It keeps one best score per browser; ties use accuracy and then the earliest submission. Nicknames are not reserved identities. After a completed round with at least one shot, a results card appears in the center of the arena. Enter your name there and choose **Submit score**. Publication is optional and clearly labeled.

The API is a Netlify Function at `/.netlify/functions/leaderboard`, backed by a site-wide, strongly consistent Netlify Blobs store named `dualsense-leaderboard`. It needs no separate database account or client-side secret. `npm run build` publishes only `index.html` and `controller/` to `dist/`; server code and dependencies are bundled separately as a function. Deploy through the existing Netlify Git connection. A plain static localhost server supports practice but cannot submit scores; the UI explains when the live leaderboard is unavailable.

The server issues a round ID before play, requires at least 20 seconds before submission, and expires an unfinished round after one hour. Starting another round in the same browser invalidates the older unfinished ticket, including across tabs. Failed network requests can be retried without duplicate scores. Conditional storage writes preserve concurrent submissions. Server validation limits nickname characters, weapon values, score/hit relationships, and shot counts. These checks reduce accidental or trivial invalid submissions; this is a casual browser leaderboard, not cheat-proof competitive scoring.

A random first-party `HttpOnly`, `Secure`, `SameSite=Strict` cookie identifies the browser for its personal best. It is restricted to the leaderboard endpoint. Clearing it creates a new player identity. The database retains the current round per browser, up to 100 best entries (50 shown), and hourly request counters keyed by a SHA-256 hash of the connecting IP; raw IPs are not written to Blobs. These gameplay records are separate from cookieless PostHog analytics. The public response never exposes browser identifiers or round IDs. Owners can inspect or remove leaderboard data through the site's Netlify Blobs controls.

PostHog records `controller_leaderboard_opened` and `controller_leaderboard_submitted` (score only), plus once-per-visit `controller_feature_used` with `feature=leaderboard`. Nicknames and player identifiers are not analytics properties.

Tests cover persistent reads, round ownership and expiry, invalid inputs, idempotent retries, concurrent writes, ranking, personal-best retention, board size, rate limits, HTTP request validation, and offline client behavior.


## Gyro

Choose **Enable gyro** on the main page or **Enable gyro aiming** in target practice. This reuses the existing DualSense WebHID connection (desktop Chrome/Edge, secure context, explicit browser device permission). USB and full Bluetooth sensor reports drive the 3D orientation and pitch/yaw aiming alongside the right stick. The 3D view maps sensor X/Y/Z into the mesh’s X/Z/−Y axes, integrates rotation as a quaternion, and uses gravity to align tilt on enable and after recentering. A gentle gravity correction during slow movement limits accumulated tilt error; strong acceleration is ignored. It does not emulate gyro input for other games. Automatic button-follow camera changes are suppressed while gyro is enabled. Dragging the shell, choosing a camera view, or Reset turns gyro off so the physical controller cannot override the chosen view.

**Recenter gyro** resets the heading/aim and measures stationary gyro bias for 1.5 seconds on a stable surface. Place the controller flat with its USB port pointing toward the screen, then pick it up after centering completes; the model follows its physical tilt. In the game, it pauses the round; resume after centering. It cancels on focus loss or substantial movement. Heading remains relative: gravity can correct tilt, but cannot reveal which compass direction the controller faces. Recenter if heading drifts. Tilt is realigned on returning to the tab without integrating the missing time. Turn gyro off to return to normal controls.

The gyro service parses signed axes and the controller's sensor clock (including wraparound), discards missing/large time steps, and removes listeners on disconnect. It reads factory sensitivity from feature report 0x05 when available; otherwise the live rates are explicitly approximate using nominal sensitivity. It never sends feature reports or writes factory calibration. The packet layout, clock units, and scale conventions are referenced from [Sony's Linux hid-playstation driver](https://github.com/torvalds/linux/blob/master/drivers/hid/hid-playstation.c); feature-report framing follows [WebHID](https://wicg.github.io/webhid/).

Gyro coordinate and accelerometer conventions are checked against [SDL’s DualSense driver](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_ps5.c) and [sensor coordinate documentation](https://wiki.libsdl.org/SDL3/SDL_SensorType). No raw motion or orientation data is sent to analytics.

PostHog counts `controller_gyro_enabled`, `controller_gyro_disabled`, and `controller_gyro_recentered`. No raw gyro rates, stick measurements, bias values, or device IDs are sent. Tests cover report decoding, feature framing, timestamp wrap, pause/disconnect, cancellation during calibration, stationary-bias correction, all three model rotation axes, flat/upright/sideways poses, tilt correction, pause/resume, raw diagnostic preservation, and motion aiming. Physical motion direction and feel still require a hands-on controller check.


### Firing-line presentation

Target practice uses a dedicated arena layout with a compact HUD, remaining-time bar, weapon loadout, and an expandable controller setup panel. The locally drawn firing bay includes illuminated hanging targets, impact particles, hit markers, and recoil feedback in the reticle. The arena keeps a fixed coordinate system inside a fitted viewport so mouse/touch aim stays aligned at different screen sizes. Reduced-motion preference removes decorative particles, tracers, and reticle recoil. The 20-second round, score rules, and existing leaderboard records are unchanged.

Completed rounds show score, hits/accuracy, optional name submission, replay, and scorecard download in a centered arena card. The name field receives focus when play ends with focus on the canvas; typing names does not trigger game keyboard shortcuts. The leaderboard is launched from inside the game only. Offline/practice-only rounds explain why submission is unavailable while replay and scorecard exports still work.
