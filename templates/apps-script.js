// ══════════════════════════════════════════════════════
//  RAYNERS LANE FC — Squad Manager Apps Script
//  Paste this into your Google Sheet:
//  Extensions → Apps Script → paste → Save → Deploy
// ══════════════════════════════════════════════════════

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data  = JSON.parse(e.postData.contents);

    if (data.action === 'replace_all') {
      // Clear existing data (keep header row)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);

      // Write all players
      data.players.forEach(p => {
        sheet.appendRow([
          p.Squad_No, p.Full_Name, p.Position,
          p.Apps || 0, p.Goals || 0, p.Cards || 0
        ]);
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const players = values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return ContentService
    .createTextOutput(JSON.stringify(players))
    .setMimeType(ContentService.MimeType.JSON);
}
