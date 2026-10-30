import {copy} from './calculation.js';
import {openStore,readState,changeState} from './storage.js';
export const PRACTICE_DB='book-flea-register-practice-v1';
export const draftKey=practice=>practice?'book-flea-register-practice-draft':'book-flea-register-draft';
// 設定だけを本番から複写する。会計・取消・採番は一切混ぜない。
export async function openPractice(settings,name=PRACTICE_DB){
  const db=await openStore(name);
  try{
    let state=await readState(db);
    if(JSON.stringify(state.settings)!==JSON.stringify(settings))state=await changeState(db,state.revision,s=>{s.settings=copy(settings);return s;});
    return {db,state};
  }catch(error){db.close();throw error;}
}
export function practiceBackup(state){return JSON.stringify({format:'book-flea-register-practice',version:1,exportedAt:new Date().toISOString(),state},null,2);}
