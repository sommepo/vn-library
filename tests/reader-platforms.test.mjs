import assert from 'node:assert/strict';
import {platformGames,platformId,storedPlatform} from '../web/platforms.mjs';
const games=[{id:'same-name',platform:{id:'ps2'}},{id:'same-name',platform:{id:'pc98'}},{id:'unknown',adapter:{id:'ps2-not-evidence'}}];
assert.deepEqual(platformGames(games,'pc98'),[games[1]]);
assert.equal(platformId(games[2]),'unknown');
const legacy=['clannad-slpm66302-1.01','remember11-slpm65550-1.02',
  'remember11-slpm65550-1.0','never7-slps25256-1.01'].map(id=>({id}));
assert.deepEqual(platformGames(legacy,'ps2'),legacy);
assert.deepEqual(platformGames(legacy,'pc98'),[]);
assert.equal(platformId({id:legacy[0].id,platform:{id:'pc98'}}),'pc98');
assert.equal(platformId({id:'clannad-other-edition'}),'unknown');
assert.equal(storedPlatform({getItem:()=>{throw Error('blocked storage');}}),'ps2');
assert.equal(storedPlatform({getItem:()=>'<bad>'}),'ps2');
assert.equal(storedPlatform({getItem:()=> 'pc98'}),'ps2');
