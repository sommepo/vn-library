import test from 'node:test';
import assert from 'node:assert/strict';
import {create428ProgressKernel} from '../web/adapters/shibuya428-progress-kernel.mjs';
test('progress kernel rejects oversized or non-byte executable input before interpretation',async()=>{
 for(const elf of [[],new Uint8Array(4*1024*1024+1)])await assert.rejects(create428ProgressKernel({elf},{}),/input bound/);
});
test('progress kernel does not interpret code from a different executable',async()=>{
 await assert.rejects(create428ProgressKernel({elf:new Uint8Array([0x7f,69,76,70])},{}),/elf identity mismatch/);
});
