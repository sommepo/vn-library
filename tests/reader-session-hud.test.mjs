import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,formatRate,sessionHudParts} from '../web/session-hud.mjs';
test('session HUD durations stay compact',()=>{
 assert.equal(formatDuration(0),'0m');assert.equal(formatDuration(59999),'0m');assert.equal(formatDuration(25*60000),'25m');
 assert.equal(formatDuration(3600000),'1:00h');assert.equal(formatDuration((2*60+5)*60000+999),'2:05h');assert.equal(formatDuration(-5),'0m');
});
test('session HUD rate waits for one minute of reading',()=>{
 assert.equal(formatRate({activeMs:59999,characters:500}),'—/h');
 assert.equal(formatRate({activeMs:60000,characters:100}),'6k/h');
 assert.equal(formatRate({activeMs:3600000,characters:840}),'840/h');
 assert.equal(formatRate({activeMs:1450000,characters:3412}),'8.5k/h');
});
test('session HUD shows time, characters and rate in order',()=>{
 assert.deepEqual(sessionHudParts({activeMs:1450000,characters:3412}),['24m','3,412字','8.5k/h']);
});
