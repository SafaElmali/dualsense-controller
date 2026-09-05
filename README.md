# DualSense Controller

An interactive PS5 DualSense recreation built with HTML, CSS, JavaScript, and Three.js. The model, textures, and Three.js modules are included locally; the controller works without an external CDN or a build step. Optional analytics loads from PostHog; blocking it does not affect the controller.

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
- **Auto** follows your inputs: L2/R2 show a tilted rear view, L1/R1 show the shoulders, and face buttons or sticks show the front. Held triggers take priority so aiming and firing do not flip the camera back and forth. The last angle stays after release. Trigger caps light up while pressed, with live L2/R2 pressure labels in the automatic rear view.
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

Node.js 20 or newer is required for the tests. No dependency installation is needed.

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
