// DO-O / DrHeli-Do-O 物品点検ログ受信用
//
// 物品マスター（HEAD構成）が更新されたら、既存シートの右側に列を追加するのではなく
// 新しいシートを作成して、そちらにヘッダーと点検結果を書き込む。
//
// 導入手順:
//   1. 対象スプレッドシートの「拡張機能 → Apps Script」を開く
//   2. 既存の doPost / resolveSheetName_ などをこのファイルの内容で置き換える
//   3. 保存してデプロイ（ウェブアプリとして更新）

function doPost(e) {
  try {
    var data = parsePayload_(e);
    var header = data.header || [];
    var rows = data.rows || [];
    if (!rows.length) throw new Error('rows is empty');

    var ss = getSpreadsheet_();
    var sheetName = resolveSheetName_(ss, header);
    var sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

    var existingHeader = [];
    if (sh.getLastRow() > 0) {
      existingHeader = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    }
    if (existingHeader.length === 0) {
      if (header.length === 0) throw new Error('header is empty on a new sheet');
      sh.appendRow(header);
      existingHeader = header;
    }

    // 送信されてきた各行のデータを、シートのヘッダー順にマッピングして書き込み
    var values = rows.map(function(row) {
      var mappedRow = new Array(existingHeader.length).fill('');
      header.forEach(function(h, idx) {
        var sheetColIdx = existingHeader.indexOf(h);
        if (sheetColIdx !== -1) {
          mappedRow[sheetColIdx] = row[idx] || '';
        }
      });
      return mappedRow;
    });

    sh.getRange(sh.getLastRow() + 1, 1, values.length, existingHeader.length).setValues(values);

    return json_({ ok: true, rows: values.length, sheet: sheetName });
  } catch (err) {
    logError_(err, e);
    return json_({ ok: false, error: String(err) });
  }
}

// 動作確認用
// 通常: .../exec
// 書き込みテスト: .../exec?test=write
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.test === 'write') {
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName('接続テスト') || ss.insertSheet('接続テスト');
    sh.appendRow([new Date(), 'DO-O 物品点検 受信用 Web App：書き込みテストOK']);
    return text_('DO-O 物品点検 受信用 Web App：書き込みテストOK');
  }
  return text_('DO-O 物品点検 受信用 Web App：稼働中');
}

// ヘッダー構成（=物品マスターの内容）が現在書き込み対象のシートと一致するか確認し、
// 一致しなければ新しいシートを作成してそちらを書き込み対象にする。
function resolveSheetName_(ss, header) {
  var BASE = '点検ログ';
  var props = PropertiesService.getScriptProperties();
  var activeName = props.getProperty('ACTIVE_LOG_SHEET') || BASE;
  var activeSig = props.getProperty('ACTIVE_LOG_HEADER_SIG') || '';
  var sig = headerSignature_(header);

  var sh = ss.getSheetByName(activeName);
  if (!sh) {
    props.setProperty('ACTIVE_LOG_SHEET', BASE);
    props.setProperty('ACTIVE_LOG_HEADER_SIG', sig);
    return BASE;
  }

  if (!activeSig) {
    // 旧バージョンからの移行: シートに残っている既存ヘッダーをシグネチャの基準にする
    var existing = sh.getLastRow() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    activeSig = headerSignature_(existing.length ? existing : header);
    props.setProperty('ACTIVE_LOG_HEADER_SIG', activeSig);
  }

  if (activeSig !== sig) {
    // 物品マスターが更新された → 列を追加せず新しいシートを作る
    var newName = nextSheetName_(ss, BASE);
    props.setProperty('ACTIVE_LOG_SHEET', newName);
    props.setProperty('ACTIVE_LOG_HEADER_SIG', sig);
    return newName;
  }

  return activeName;
}

function headerSignature_(header) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, header.join(''), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(digest);
}

function nextSheetName_(ss, base) {
  var n = 2;
  while (ss.getSheetByName(base + '(' + n + ')')) n++;
  return base + '(' + n + ')';
}

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('SpreadsheetApp.getActiveSpreadsheet() is null. スプレッドシートの「拡張機能 → Apps Script」から作成してください。');
  }
  return ss;
}

function parsePayload_(e) {
  var raw = '';

  // 新旧どちらの送信形式にも対応
  if (e && e.parameter && e.parameter.payload) raw = e.parameter.payload;
  if (!raw && e && e.postData && e.postData.contents) raw = e.postData.contents;
  if (!raw) throw new Error('POST body is empty');

  // application/x-www-form-urlencoded で届いた場合の保険
  if (raw.indexOf('payload=') === 0) raw = formValue_(raw, 'payload');

  return JSON.parse(raw);
}

function formValue_(body, name) {
  var pairs = body.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var kv = pairs[i].split('=');
    var key = decodeURIComponent((kv[0] || '').replace(/\+/g, ' '));
    if (key === name) return decodeURIComponent((kv.slice(1).join('=') || '').replace(/\+/g, ' '));
  }
  return '';
}

function logError_(err, e) {
  try {
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName('受信エラー') || ss.insertSheet('受信エラー');
    sh.appendRow([
      new Date(),
      String(err),
      e && e.postData ? e.postData.contents : '',
      e && e.parameter ? JSON.stringify(e.parameter) : ''
    ]);
  } catch (ignore) {}
}

function text_(s) {
  return ContentService.createTextOutput(s);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
