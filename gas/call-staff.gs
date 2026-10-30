/**
 * 古本フリマレジ「山本を呼ぶ」用のメール送信ウェブアプリ（Google Apps Script）。
 *
 * 宛先と合言葉はこのファイルに書かず、スクリプト プロパティに保存する。
 *   RECIPIENT : 送信先メールアドレス
 *   PASSCODE  : iPadの送信設定に入力する合言葉
 * 手順は docs/CALL_SETUP.md を参照。
 */
const COOLDOWN_SECONDS = 20;
const DAILY_LIMIT = 50;

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const recipient = props.getProperty('RECIPIENT'), passcode = props.getProperty('PASSCODE');
  if (!recipient || !passcode) return json_({ ok: false, error: '送信先が未設定です' });
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: '形式が不正です' }); }
  if (typeof body.key !== 'string' || body.key !== passcode) return json_({ ok: false, error: '合言葉が違います' });
  const text = String(body.text || '').trim().slice(0, 500);
  if (!text) return json_({ ok: false, error: '要件が空です' });
  const staff = String(body.staff || '未設定').slice(0, 80);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return json_({ ok: false, error: '混み合っています。もう一度送信してください' });
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('recent')) return json_({ ok: false, error: `${COOLDOWN_SECONDS}秒ほど待ってから送信してください` });
    const day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const count = props.getProperty('CALL_DAY') === day ? Number(props.getProperty('CALL_COUNT') || 0) : 0;
    if (count >= DAILY_LIMIT) return json_({ ok: false, error: '本日の送信上限に達しました' });
    const time = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    MailApp.sendEmail({
      to: recipient,
      subject: '【古本フリマレジ】山本を呼ぶ',
      body: `要件：\n${text}\n\n担当：${staff}\n送信：${time}\n`,
    });
    cache.put('recent', '1', COOLDOWN_SECONDS);
    props.setProperties({ CALL_DAY: day, CALL_COUNT: String(count + 1) });
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
