import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '../stores/locale'
import { directionFor } from '../i18n'

// ── Digital Health Pass (PDF export) ───────────────────────────────────
// Renders a self-contained, print-ready health report into a hidden iframe
// and opens the browser's print / "Save as PDF" dialog. We deliberately build
// an isolated document instead of window.print()-ing the live SPA: it
// guarantees a clean, branded A4 layout and inherently excludes on-screen
// chrome (theme toggle, back button, nav) — there's nothing to hide because
// nothing else is in the document.
//
// Shared by the live triage result (SymptomForm) and past logs (HistoryView),
// so the export looks identical whether it comes from a fresh assessment or
// the history timeline. Callers pass a normalized record; see `printHealthReport`.

const REPORT_LOCALE_TAGS = { fa: 'fa-IR', ckb: 'ckb-Arab', en: 'en-US' }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function useHealthReport() {
  const { t } = useI18n()
  const localeStore = useLocaleStore()

  // record: {
  //   urgencyKey, urgencyLabel, redFlag, symptoms[], severity, bodyArea,
  //   durationHours, specialtyName, careActions[], doctors[], refId, issuedAt
  // }
  function buildReportDocument(record) {
    const rt = (k) => escapeHtml(t(`symptom_form.report.${k}`))
    const locale = localeStore.current
    const dir = directionFor(locale)
    const tag = REPORT_LOCALE_TAGS[locale] || 'fa-IR'

    let issued = ''
    try {
      const when = record.issuedAt ? new Date(record.issuedAt) : new Date()
      issued = new Intl.DateTimeFormat(tag, {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(when)
    } catch {
      issued = new Date().toLocaleString()
    }
    const refId = record.refId || `HLT-${Date.now().toString(36).toUpperCase()}`

    const isEmergency = record.urgencyKey === 'emergency'
    const accent = isEmergency ? '#e11d48' : '#059669'
    const accentSoft = isEmergency ? '#fff1f2' : '#ecfdf5'
    const brand = escapeHtml(t('app.name'))

    const symptomChips = (record.symptoms || [])
      .filter(Boolean)
      .map((s) => `<span class="chip">${escapeHtml(s)}</span>`)
      .join('')

    const metaRows = []
    if (Number.isFinite(record.severity)) {
      metaRows.push(`<div class="meta"><dt>${rt('severity')}</dt><dd>${escapeHtml(record.severity)}/10</dd></div>`)
    }
    if (record.bodyArea) {
      metaRows.push(`<div class="meta"><dt>${rt('body_area')}</dt><dd>${escapeHtml(record.bodyArea)}</dd></div>`)
    }
    if (Number.isFinite(record.durationHours) && record.durationHours > 0) {
      metaRows.push(`<div class="meta"><dt>${rt('duration')}</dt><dd>${escapeHtml(record.durationHours)} ${rt('hours')}</dd></div>`)
    }

    const careItems = (record.careActions || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('')

    const doctorRows = (record.doctors || [])
      .map((d) => `
        <li>
          <span class="doc-name">${escapeHtml(d.name)}</span>
          <span class="doc-meta">${escapeHtml(d.experience_years)} ${escapeHtml(t('symptom_form.experience_years'))} · ★ ${escapeHtml(Number(d.rating).toFixed(1))}</span>
        </li>`)
      .join('')

    const specialtyBlock = record.specialtyName
      ? `<section class="card">
           <h3>${rt('specialty')}</h3>
           <p class="specialty">${escapeHtml(record.specialtyName)}</p>
         </section>`
      : ''

    const redFlagBlock = record.redFlag
      ? `<div class="redflag">${escapeHtml(t('symptom_form.red_flag_warning'))}</div>`
      : ''

    return `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${brand} — ${rt('heading')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  :root { --accent: ${accent}; --accent-soft: ${accentSoft}; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Vazirmatn", "Segoe UI", Tahoma, system-ui, sans-serif;
    color: #0f172a; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { position: relative; padding: 8px; overflow: hidden; }
  .watermark {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    transform: rotate(-30deg); font-size: 120px; font-weight: 800; letter-spacing: 6px;
    color: ${accent}; opacity: 0.05; pointer-events: none; z-index: 0; white-space: nowrap;
  }
  .content { position: relative; z-index: 1; }
  header.brand {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding-bottom: 16px; border-bottom: 2px solid var(--accent);
  }
  .brand-id { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 46px; height: 46px; border-radius: 14px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #10b981, #047857); color: #fff;
  }
  .brand-name { font-size: 22px; font-weight: 800; line-height: 1.1; }
  .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .doc-meta-top { text-align: ${dir === 'rtl' ? 'left' : 'right'}; font-size: 11px; color: #64748b; line-height: 1.7; }
  .doc-meta-top b { color: #0f172a; font-weight: 700; }
  h1.report-title { font-size: 16px; margin: 22px 0 14px; font-weight: 800; }
  .classification {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 14px;
    background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent);
  }
  .classification .dot { width: 10px; height: 10px; border-radius: 999px; background: var(--accent); }
  .redflag {
    margin: 14px 0; padding: 12px 16px; border-radius: 12px; font-weight: 700; font-size: 13px;
    background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3;
  }
  .card {
    margin-top: 16px; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 14px;
    background: #f8fafc; break-inside: avoid;
  }
  .card h3 { margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #64748b; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 6px 12px; border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 13px; font-weight: 600; border: 1px solid #a7f3d0; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 10px 28px; margin-top: 14px; }
  .meta dt { font-size: 11px; color: #64748b; }
  .meta dd { margin: 2px 0 0; font-size: 15px; font-weight: 700; }
  .specialty { margin: 0; font-size: 18px; font-weight: 800; color: #047857; }
  ul.care, ul.docs { margin: 0; padding: 0; list-style: none; }
  ul.care li { position: relative; padding: 8px 0 8px 22px; font-size: 13px; line-height: 1.6; border-bottom: 1px dashed #e2e8f0; }
  ul.care li:last-child { border-bottom: 0; }
  ul.care li::before { content: "✓"; position: absolute; inset-inline-start: 0; top: 8px; color: var(--accent); font-weight: 800; }
  ul.docs li { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }
  ul.docs li:last-child { border-bottom: 0; }
  .doc-name { font-weight: 700; font-size: 14px; }
  .doc-meta { font-size: 12px; color: #64748b; }
  footer.seal {
    margin-top: 26px; padding-top: 16px; border-top: 1px solid #e2e8f0;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .verified {
    display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
    border: 1.5px solid var(--accent); border-radius: 12px; color: var(--accent);
    font-weight: 800; font-size: 13px; background: var(--accent-soft);
  }
  .disclaimer { font-size: 10px; color: #94a3b8; line-height: 1.6; max-width: 62%; }
</style>
</head>
<body>
  <div class="page">
    <div class="watermark">${rt('ai_verified')}</div>
    <div class="content">
      <header class="brand">
        <div class="brand-id">
          <div class="logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s-7-4.35-9.5-9C1 8 3 4 6.5 4 9 4 12 7 12 7s3-3 5.5-3C21 4 23 8 21.5 12 19 16.65 12 21 12 21z"/>
              <path d="M8 12h2l1.5-3 2 5 1.5-2H18"/>
            </svg>
          </div>
          <div>
            <div class="brand-name">${brand}</div>
            <div class="brand-sub">${rt('subheading')}</div>
          </div>
        </div>
        <div class="doc-meta-top">
          <div>${rt('generated')}: <b>${escapeHtml(issued)}</b></div>
          <div>${rt('ref')}: <b>${escapeHtml(refId)}</b></div>
        </div>
      </header>

      <h1 class="report-title">${rt('heading')}</h1>

      <div class="classification"><span class="dot"></span>${escapeHtml(record.urgencyLabel || '')}</div>
      ${redFlagBlock}

      <section class="card">
        <h3>${rt('symptoms')}</h3>
        <div class="chips">${symptomChips}</div>
        ${metaRows.length ? `<div class="meta-grid">${metaRows.join('')}</div>` : ''}
      </section>

      ${specialtyBlock}

      <section class="card">
        <h3>${rt('care_actions')}</h3>
        <ul class="care">${careItems}</ul>
      </section>

      ${doctorRows ? `<section class="card"><h3>${rt('doctors')}</h3><ul class="docs">${doctorRows}</ul></section>` : ''}

      <footer class="seal">
        <div class="verified">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
          </svg>
          ${rt('ai_verified')}
        </div>
        <p class="disclaimer">${rt('ai_verified_note')}<br>${rt('disclaimer')}</p>
      </footer>
    </div>
  </div>
</body>
</html>`
  }

  // Returns true on success, false if the export could not be started. The
  // caller is responsible for user-facing error toasts.
  function printHealthReport(record) {
    let iframe = null
    try {
      const html = buildReportDocument(record)
      iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;'
      document.body.appendChild(iframe)

      const frame = iframe
      const triggerPrint = () => {
        try {
          frame.contentWindow.focus()
          frame.contentWindow.print()
        } finally {
          // Leave the frame up briefly so the print dialog can read it, then remove.
          setTimeout(() => frame.remove(), 1000)
        }
      }

      const doc = iframe.contentWindow.document
      doc.open()
      doc.write(html)
      doc.close()
      // Same-origin document.write parses synchronously on close(); a short delay
      // lets layout settle (and fonts swap in) before we open the print dialog.
      setTimeout(triggerPrint, 300)
      return true
    } catch (e) {
      if (iframe) iframe.remove()
      return false
    }
  }

  return { printHealthReport }
}
