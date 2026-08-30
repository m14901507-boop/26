import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'https://m14901507-boop.github.io'
}));

const PORT = Number(process.env.PORT || 8080);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const BUDGET_SHEET_NAME = process.env.BUDGET_SHEET_NAME || 'موازنات الحسابات';

function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ]
  });
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'floosy-backend',
    time: new Date().toISOString()
  });
});

app.get('/api/budgets', async (_req, res) => {
  try {
    if (!SPREADSHEET_ID) {
      return res.status(500).json({
        ok: false,
        error: 'SPREADSHEET_ID is not configured.'
      });
    }

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const range = `'${BUDGET_SHEET_NAME}'!A:H`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });

    const values = response.data.values || [];
    const headers = values[0] || [];
    const rows = values.slice(1);

    res.json({
      ok: true,
      headers,
      rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to read Google Sheets.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Floosy backend listening on port ${PORT}`);
});
