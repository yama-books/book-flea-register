import {spawnSync} from 'node:child_process';
for(const file of ['src/calculation.js','src/storage.js','src/app.js','tests/browser.js']){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
  console.log(`PASS syntax ${file}`);
}
const result=spawnSync(process.execPath,['--test','tests/calculation.test.js'],{stdio:'inherit'});
process.exit(result.status??1);
