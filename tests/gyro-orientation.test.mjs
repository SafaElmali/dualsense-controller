import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '../controller/vendor/three/three.module.min.js';
import { GyroOrientation } from '../controller/gyro-orientation.js';
import { GyroInput } from '../controller/gyro-input.js';

const still = { pitch: 0, yaw: 0, roll: 0, dt: .01 };
const vector = (orientation, v) => new Vector3(...v).applyQuaternion(new Quaternion().fromArray(orientation)).toArray();
function close(actual, expected, tolerance = 1e-6) {
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < tolerance, `${actual} != ${expected}`));
}
function rotate(pose, rates) {
  let result;
  for (let i = 0; i < 100; i++) result = pose.update({ ...still, ...rates });
  return result;
}

test('gravity aligns a flat, upright, or sideways controller without inventing motion', () => {
  for (const [acceleration, right, face] of [
    [[0, 1, 0], [1, 0, 0], [0, 1, 0]], // Face up on the table.
    [[0, 0, -1], [1, 0, 0], [0, 0, 1]], // Button face toward the viewer.
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], // Right handle above the left.
    [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  ]) {
    const pose = new GyroOrientation();
    const result = pose.update({ ...still, acceleration });
    close(vector(result, [1, 0, 0]), right);
    close(vector(result, [0, 0, 1]), face);
  }
});

test('a quarter turn about the face normal raises the right handle instead of turning the model away', () => {
  const pose = new GyroOrientation();
  pose.update({ ...still, acceleration: [0, 0, -1] });
  const result = rotate(pose, { yaw: 90 });
  close(vector(result, [1, 0, 0]), [0, 1, 0]);
  close(vector(result, [0, 0, 1]), [0, 0, 1]);
});

test('handle-axis turning and pitching map to the other two mesh axes with correct signs', () => {
  close(vector(rotate(new GyroOrientation(), { roll: 90 }), [0, 0, 1]), [-1, 0, 0]);
  close(vector(rotate(new GyroOrientation(), { pitch: 90 }), [0, 0, 1]), [0, -1, 0]);
});

test('picking up a controller after flat calibration brings its button face into view', () => {
  const pose = new GyroOrientation();
  pose.update({ ...still, acceleration: [0, 1, 0] });
  const result = rotate(pose, { pitch: 90 });
  close(vector(result, [0, 0, 1]), [0, 0, 1]);
  close(vector(result, [0, 1, 0]), [0, 1, 0]);
});

test('compound local rotations remain normalized and reverse back to the starting pose', () => {
  const pose = new GyroOrientation();
  const rates = { pitch: 52, yaw: -38, roll: 77 };
  rotate(pose, rates);
  const result = rotate(pose, { pitch: -52, yaw: 38, roll: -77 });
  close(vector(result, [0, 0, 1]), [0, 0, 1]);
  assert.ok(Math.abs(Math.hypot(...result) - 1) < 1e-10);
});

test('gravity corrects tilt error while preserving relative heading', () => {
  const pose = new GyroOrientation();
  pose.update({ ...still, acceleration: [0, 0, -1] });
  rotate(pose, { roll: 60 }); // Relative heading around screen-up.
  rotate(pose, { pitch: 8 }); // Accumulated tilt error.
  let result;
  for (let i = 0; i < 1000; i++) result = pose.update({ ...still, acceleration: [0, 0, -1] });
  close(vector(result, [0, 1, 0]), [0, 1, 0]);
  close(vector(result, [0, 0, 1]), [-Math.sqrt(3) / 2, 0, .5]);
});

test('missing gravity, strong acceleration and invalid time cannot flip the model', () => {
  const pose = new GyroOrientation();
  pose.update({ ...still, acceleration: [0, 0, -1] });
  for (const sample of [
    { acceleration: [0, 0, 0] }, { acceleration: [2, 0, 0] }, { acceleration: [NaN, 0, 0] },
    { pitch: NaN }, { dt: 5, yaw: 360 }, { dt: -.1, yaw: 360 },
  ]) close(pose.update({ ...still, ...sample }), [0, 0, 0, 1]);
});

test('resume realigns current tilt without resetting heading, and reset clears the old reference', () => {
  const pose = new GyroOrientation();
  pose.update({ ...still, acceleration: [0, 0, -1] });
  rotate(pose, { roll: 45 });
  pose.realign();
  const result = pose.update({ ...still, acceleration: [1, 0, 0] });
  close(vector(result, [1, 0, 0]), [0, 1, 0]);
  pose.reset();
  close(pose.update({ ...still, acceleration: [0, 0, -1] }), [0, 0, 0, 1]);
});

test('USB and Bluetooth reports deliver the pictured sideways pose through the gyro service', async () => {
  for (const reportId of [1, 0x31]) {
    const samples = [], gyro = new GyroInput(sample => samples.push(sample));
    const device = { addEventListener() {}, removeEventListener() {}, receiveFeatureReport: async () => new DataView(new ArrayBuffer(0)) };
    gyro.attach(device); await gyro.enable();
    const data = new DataView(new ArrayBuffer(reportId === 1 ? 63 : 77)), offset = reportId === 1 ? 0 : 1;
    data.setInt16(offset + 21, 8192, true); // Right handle up, face toward us.
    for (let i = 0; i < 2; i++) {
      data.setUint32(offset + 27, i * 30000, true);
      gyro.onReport({ device, reportId, data });
    }
    assert.equal(samples.length, 1);
    close(vector(samples[0].orientation, [1, 0, 0]), [0, 1, 0]);
    close(vector(samples[0].orientation, [0, 0, 1]), [0, 0, 1]);
    gyro.setEnabled(false); gyro.onReport({ device, reportId, data });
    assert.equal(samples.length, 1);
  }
});

test('successful recenter uses the actual flat pose and resume realigns an unobserved tilt', async () => {
  let now = 0;
  const samples = [], gyro = new GyroInput(sample => samples.push(sample), () => {}, () => now);
  const device = { addEventListener() {}, removeEventListener() {}, receiveFeatureReport: async () => new DataView(new ArrayBuffer(0)) };
  const data = new DataView(new ArrayBuffer(63));
  function report(acceleration) {
    acceleration.forEach((value, i) => data.setInt16(21 + i * 2, value * 8192, true));
    data.setUint32(27, now * 3000, true);
    gyro.onReport({ device, reportId: 1, data });
  }
  gyro.attach(device); await gyro.enable();
  report([0, 0, -1]); now = 10; report([0, 0, -1]);
  gyro.recenter();
  for (now = 20; now <= 1620; now += 40) report([0, 1, 0]);
  assert.equal(gyro.measurement, null);
  now += 10; report([0, 1, 0]);
  close(vector(samples.at(-1).orientation, [0, 0, 1]), [0, 1, 0]);
  gyro.setPaused(true); now += 3000; report([1, 0, 0]);
  gyro.setPaused(false); report([1, 0, 0]); now += 10; report([1, 0, 0]);
  close(vector(samples.at(-1).orientation, [1, 0, 0]), [0, 1, 0]);
});
