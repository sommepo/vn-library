import assert from 'node:assert/strict';
import {test} from 'node:test';
import {visibleLibrary} from '../web/library.mjs';
const fixture={id:'test',fixture:true}, game={id:'game',fixture:false};
test('empty installation hides synthetic content',()=>assert.deepEqual(visibleLibrary([fixture]),[]));
test('normal library contains only imported games',()=>assert.deepEqual(visibleLibrary([fixture,game]),[game]));
test('developer fixture is explicit',()=>assert.deepEqual(visibleLibrary([fixture],'?fixture=1'),[fixture]));
