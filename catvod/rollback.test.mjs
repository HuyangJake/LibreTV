import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'catvod-rollback-'));process.env.CATVOD_DATA_DIR=root;
const {rollback}=await import('./bundle-store.mjs');
test('rolling back source/config preserves live credential and ownership history',async()=>{
 const write=(name,value)=>writeFile(path.join(root,name+'.json'),JSON.stringify(value));
 await write('previous-state',{filename:'old.cjs',enabled:['old-site']});
 await write('previous-db',{quark:{account:'expired'},config:{mode:'old'}});
 await write('db',{quark:{account:'current'},config:{mode:'new'}});
 const ledger={directories:[{fid:'owned'}],files:[{fid:'file-saved-after-update'}],pending:[]};
 await write('ledger',ledger);await write('previous-ledger',{directories:[],files:[],pending:[]});
 const state=await rollback();assert.equal(state.filename,'old.cjs');
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'ledger.json'))),ledger);
 const db=JSON.parse(await readFile(path.join(root,'db.json')));assert.equal(db.quark.account,'current');assert.equal(db.config.mode,'old');
});test.after(()=>rm(root,{recursive:true,force:true}));
