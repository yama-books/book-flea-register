import {spawnSync} from 'node:child_process';
for(const file of ['src/calculation.js','src/storage.js','src/app.js','src/signaling.js','src/amount-link.js','src/qr.js','src/customer.js','src/customer-controls.js','src/display-support.js','src/practice.js','src/staff-call.js','src/menu.js','src/sales-summary.js','tests/browser.js','tests/realtime-browser.js']){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
  console.log(`PASS syntax ${file}`);
}
for(const timezone of ['Asia/Tokyo','UTC']){
  console.log(`TEST TIMEZONE ${timezone}`);
  const result=spawnSync(process.execPath,['--test','tests/calculation.test.js','tests/signaling.test.js','tests/display-support.test.js','tests/menu.test.js','tests/sales-summary.test.js'],{stdio:'inherit',env:{...process.env,TZ:timezone}});
  if(result.status!==0)process.exit(result.status??1);
}
