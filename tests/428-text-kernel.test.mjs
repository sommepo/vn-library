import test from 'node:test';
import assert from 'node:assert/strict';
import {create428TextKernel} from '../web/adapters/shibuya428-text-kernel.mjs';
test('text layout rejects unverified or unbounded executable bytes before running code',async()=>{
 for(const elf of [[],new Uint8Array(4*1024*1024+1)])await assert.rejects(create428TextKernel({elf},{}),/input bound/);
 await assert.rejects(create428TextKernel({elf:new Uint8Array([127,69,76,70])},{}),/elf identity mismatch/);
});
