/**
 * Shared email template wrapper — Sprint 25 Story 3b.
 * Plain inline-styled HTML for maximum email client compatibility.
 */

export function wrapEmailHtml(body: string, locale: 'he' | 'en' = 'he'): string {
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const fontFamily = 'Arial, Helvetica, sans-serif'

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:${fontFamily};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="padding:32px 24px;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 24px;text-align:center;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;">
          Lessio
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
