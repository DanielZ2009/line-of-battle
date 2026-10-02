const assert = require('node:assert/strict');
const { Battle, C, angle, distance, overlaps, sample } = require('../game.js');

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failures.push({ name, error }); console.log('FAIL ' + name + ': ' + error.message); }
}
function fixture() {
  const b = new Battle('duel'); b.start(); b.autoFire = () => {};
  const move = b.moveFleet.bind(b);
  b.moveFleet = (fleet, dt) => { if (fleet.id === 0) move(fleet, dt); };
  return b;
}
function straight(f, x, y, a) {
  f.path = Array.from({ length: 451 }, (_, i) => {
    const s = -900 + i * 2;
    return { x: x + Math.cos(a) * s, y: y + Math.sin(a) * s, a, s };
  });
  Object.assign(f, { x, y, a, s: 0, target: null, manual: 0 });
  f.ships.forEach((ship, i) => Object.assign(ship, sample(f.path, -i * C.gap), { speed: 4 }));
}
function curved(f) {
  const x = 1000, y = 900, a = .8, radius = 500;
  f.path = Array.from({ length: 451 }, (_, i) => {
    const s = -900 + i * 2, heading = a + s / radius;
    return { x: x + radius * (Math.sin(heading) - Math.sin(a)), y: y - radius * (Math.cos(heading) - Math.cos(a)), a: heading, s };
  });
  Object.assign(f, { x, y, a, s: 0, target: null, manual: 0 });
  f.ships.forEach((ship, i) => Object.assign(ship, sample(f.path, -i * C.gap), { speed: 4 }));
}
function auditMotion(b, realSeconds, pace = C.timeScale) {
  const maxStep = C.speed * pace / 60 + .002;
  for (let frame = 0; frame < Math.round(realSeconds * 60); frame++) {
    const before = new Map(b.getShips().map(s => [s.id, { x: s.x, y: s.y, a: s.a }]));
    b.step(1 / 60);
    for (const s of b.getShips()) {
      const old = before.get(s.id);
      assert.ok(Number.isFinite(s.x + s.y + s.a), 'non-finite pose ' + s.id);
      if (old) assert.ok(distance(old, s) <= maxStep, s.id + ' teleported ' + distance(old, s).toFixed(2) + ' metres in one frame');
    }
    const hulls = b.obstacles();
    for (let i = 0; i < hulls.length; i++) for (let j = i + 1; j < hulls.length; j++) {
      assert.ok(!overlaps(hulls[i], hulls[j]), 'overlap: ' + hulls[i].id + ' / ' + hulls[j].id);
    }
    assert.equal(b.state, 'playing', 'unexpected terminal battle during movement fixture');
  }
}
function lossRecovery(index, kind) {
  const b = fixture(), f = b.fleets[0], victim = f.ships[index], following = f.ships[index + 1];
  const start = { x: following.x, y: following.y };
  if (kind === 'sink') victim.hp = 0; else victim.crew = 10;
  b.removeSunk();
  auditMotion(b, 18);
  assert.ok(distance(start, following) > 200, following.id + ' made only ' + distance(start, following).toFixed(1) + ' metres after ' + kind);
  assert.ok(following.x > victim.x + 60, following.id + ' never passed the disabled hull');
  if (kind === 'strike') assert.ok(b.wrecks.some(w => w.id === victim.id && !w.sunk), 'struck hull was removed to solve the obstruction');
}

check('Sunk flagship transfers command and the line continues without teleporting', () => lossRecovery(0, 'sink'));
check('Struck flagship remains solid while the new leader and line bypass it', () => lossRecovery(0, 'strike'));
check('Struck middle ship remains solid while following ships bypass and continue', () => lossRecovery(2, 'strike'));
check('Curved-wake flagship sinking preserves survivor poses and permits continued sailing', () => {
  const b = fixture(), f = b.fleets[0]; curved(f);
  const survivors = f.ships.slice(1), before = survivors.map(s => ({ x: s.x, y: s.y, a: s.a }));
  f.ships[0].hp = 0; b.removeSunk();
  survivors.forEach((s, i) => { assert.equal(distance(s, before[i]), 0); assert.ok(Math.abs(angle(s.a - before[i].a)) < 1e-9); });
  auditMotion(b, 8);
  survivors.forEach((s, i) => assert.ok(distance(s, before[i]) > 80, 'curved-wake survivor stalled: ' + s.id));
});
check('Helm commands immediately control the newly promoted flagship', () => {
  const b = fixture(), f = b.fleets[0]; f.ships[0].hp = 0; b.removeSunk();
  const promoted = f.ships[0], heading = promoted.a; f.manual = 1;
  auditMotion(b, 1);
  assert.ok(angle(promoted.a - heading) > .2, 'new flagship ignored helm input');
  assert.ok(distance(promoted, f) < 1e-7, 'fleet control location did not follow promoted ship');
});
check('Two adjacent struck ships do not permanently trap the rear of the line', () => {
  const b = fixture(), f = b.fleets[0], victims = f.ships.slice(2, 4), rear = f.ships[4];
  const before = { x: rear.x, y: rear.y }; victims.forEach(s => s.crew = 10); b.removeSunk();
  auditMotion(b, 22);
  assert.ok(distance(rear, before) > 200, 'rear failed to recover after adjacent strikes');
  assert.ok(rear.x > Math.max(...victims.map(s => s.x)) + 60, 'rear never passed both struck ships');
  assert.equal(b.wrecks.filter(w => !w.sunk).length, 2);
});
check('Adjacent flagship losses transfer control to the first surviving ship', () => {
  const b = fixture(), f = b.fleets[0], promoted = f.ships[2], before = { x: promoted.x, y: promoted.y };
  f.ships[0].hp = 0; f.ships[1].crew = 10; b.removeSunk();
  assert.equal(f.ships[0].id, promoted.id); auditMotion(b, 18);
  assert.ok(distance(promoted, before) > 200, 'promoted third ship remained jammed');
});
check('Curved-wake strike bypass preserves endpoint poses and remapped wake coordinates', () => {
  const b = fixture(), f = b.fleets[0]; curved(f);
  const victim = f.ships[2], rear = f.ships[3], beforeRear = { x: rear.x, y: rear.y };
  const poses = new Map(f.ships.map(s => [s.id, { x: s.x, y: s.y, a: s.a }]));
  victim.crew = 10; b.removeSunk();
  for (const s of f.ships) {
    assert.equal(distance(s, poses.get(s.id)), 0, 'bypass moved a live ship while remapping its coordinate');
    assert.ok(Math.abs(angle(s.a - poses.get(s.id).a)) < 1e-9, 'bypass changed an endpoint heading');
    assert.ok(distance(s, sample(f.path, s.s)) < .002, 'ship no longer matches its remapped wake coordinate');
  }
  auditMotion(b, 18);
  assert.ok(distance(rear, beforeRear) > 200, 'curved strike bypass left a follower stalled');
  assert.ok(b.wrecks.some(w => w.id === victim.id && !w.sunk));
});
check('A second strike during reforming keeps endpoints fixed and permits the remaining rear to recover', () => {
  const b = fixture(), f = b.fleets[0]; f.ships[2].crew = 10; b.removeSunk(); auditMotion(b, 4);
  const secondVictim = f.ships[2], rear = f.ships[3], beforeRear = { x: rear.x, y: rear.y };
  const poses = new Map(f.ships.map(s => [s.id, { x: s.x, y: s.y, a: s.a }]));
  secondVictim.crew = 10; b.removeSunk();
  for (const s of f.ships) {
    assert.equal(distance(s, poses.get(s.id)), 0, 'second bypass moved a live endpoint');
    assert.ok(distance(s, sample(f.path, s.s)) < .002, 'second splice lost coordinate consistency');
  }
  auditMotion(b, 18);
  assert.ok(distance(rear, beforeRear) > 200, 'second strike permanently trapped the remaining rear');
  assert.equal(b.wrecks.filter(w => !w.sunk).length, 2);
});
check('A temporarily blocked bypass is retried after the available sea lane clears', () => {
  const b = fixture(), f = b.fleets[0], rear = f.ships[3], start = { x: rear.x, y: rear.y };
  const blockers = b.fleets[1].ships.slice(0, 2), original = blockers.map(s => ({ x: s.x, y: s.y, a: s.a }));
  Object.assign(blockers[0], { x: 530, y: 735, a: Math.PI / 2, speed: 0 });
  Object.assign(blockers[1], { x: 530, y: 645, a: Math.PI / 2, speed: 0 });
  f.ships[2].crew = 10; b.removeSunk(); auditMotion(b, 4);
  blockers.forEach((s, i) => Object.assign(s, original[i])); auditMotion(b, 18);
  assert.ok(distance(rear, start) > 200, 'cleared bypass was never retried; rear made ' + distance(rear, start).toFixed(1) + ' metres');
  assert.ok(rear.x > 590, 'rear failed to pass the retained struck hull after sea lane cleared');
});
check('Old left, right and bottom screen edges impose no hull wall', () => {
  for (const [x, y, a, outside] of [
    [1750, 800, 0, s => s.x > C.width + 80],
    [40, 800, Math.PI, s => s.x < -80],
    [900, 1050, Math.PI / 2, s => s.y > C.height + 80]
  ]) {
    const b = fixture(), f = b.fleets[0]; straight(f, x, y, a); auditMotion(b, 3);
    assert.ok(outside(f.ships[0]), 'leader was turned or stopped at an old screen edge');
  }
});
check('A steering destination beyond the initial viewport remains unconstrained', () => {
  const b = fixture(), point = { x: C.width + 1000, y: C.height + 1000 };
  b.steer(0, point); assert.deepEqual(b.fleets[0].target, point);
});

function placeHead(b, id, dx) {
  const f = b.fleets[id], head = f.ships[0]; f.ships = [head];
  straight(f, 900 + dx, 550, id === 0 ? 0 : Math.PI);
}
check('The retreat warning begins before the actual withdrawal boundary', () => {
  const b = fixture(); placeHead(b, 0, C.retreatWarning + 30); b.checkRetreat(.1);
  assert.equal(b.state, 'playing'); assert.equal(b.retreat[0].warned, true); assert.equal(b.retreat[0].outside, false);
});
check('Returning inside the engagement area cancels the retreat countdown', () => {
  const b = fixture(); placeHead(b, 0, C.retreatRadius + 50); b.checkRetreat(.1);
  assert.equal(b.retreat[0].outside, true); const first = b.retreat[0].remaining;
  b.checkRetreat(4); assert.ok(b.retreat[0].remaining < first);
  placeHead(b, 0, 0); b.checkRetreat(.1);
  assert.equal(b.retreat[0].outside, false); assert.equal(b.retreat[0].remaining, C.retreatGrace); assert.equal(b.state, 'playing');
  placeHead(b, 0, C.retreatRadius + 50); b.checkRetreat(.1);
  assert.ok(b.retreat[0].remaining > C.retreatGrace - 1, 're-entry did not reset the countdown');
});
check('Remaining beyond the boundary for the grace period concedes the battle', () => {
  const b = fixture(); placeHead(b, 0, C.retreatRadius + 50);
  for (let i = 0; i < (C.retreatGrace + 1) * 2 && b.state === 'playing'; i++) b.checkRetreat(.5);
  assert.equal(b.state, 'finished'); assert.equal(b.reason, 'retreat'); assert.equal(b.winner, 1);
});
check('Simultaneous automatic retreat by both fleets yields a draw', () => {
  const b = fixture(); placeHead(b, 0, C.retreatRadius + 50); placeHead(b, 1, -C.retreatRadius - 50);
  for (let i = 0; i < (C.retreatGrace + 1) * 2 && b.state === 'playing'; i++) b.checkRetreat(.5);
  assert.equal(b.state, 'finished'); assert.equal(b.reason, 'retreat'); assert.equal(b.winner, 'draw');
});
check('The 12, 24 and 36 pace choices preserve physical sailing and reload durations', () => {
  const results = [12, 24, 36].map(pace => {
    const b = fixture(); b.setPace(pace); b.fleets[0].ships[0].cool = [120, 120];
    auditMotion(b, 36 / pace, pace);
    assert.equal(b.snapshot().timeScale, pace);
    const s = b.fleets[0].ships[0]; assert.ok(s.speed <= C.speed + 1e-8);
    return { x: s.x, y: s.y, a: s.a, cooldown: s.cool[0], simulated: b.time, real: b.realTime };
  });
  results.forEach(r => {
    assert.ok(Math.abs(r.simulated - 36) < 1e-7);
    assert.ok(Math.abs(r.cooldown - 84) < 1e-7);
    for (const field of ['x', 'y', 'a']) assert.ok(Math.abs(r[field] - results[0][field]) < 1e-5, 'pace changed physical ' + field);
  });
  assert.equal(new Battle().snapshot().timeScale, 24, 'pace choice leaked into another battle');
});
check('Retreat grace is measured in real seconds at every battle pace', () => {
  const timings = [12, 24, 36].map(pace => {
    const b = fixture(); b.setPace(pace); placeHead(b, 0, C.retreatRadius + 50); b.moveFleet = () => {};
    for (let i = 0; i < (C.retreatGrace + 1) * 60 && b.state === 'playing'; i++) b.step(1 / 60);
    assert.equal(b.state, 'finished'); assert.equal(b.reason, 'retreat'); return b.realTime;
  });
  timings.forEach(t => assert.ok(Math.abs(t - C.retreatGrace) <= 1 / 60 + 1e-7, 'grace lasted ' + t + ' real seconds'));
  assert.ok(Math.max(...timings) - Math.min(...timings) < 1e-7, 'pace shortened retreat warning');
});

console.log(passed + ' open-sea and formation checks passed; ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
