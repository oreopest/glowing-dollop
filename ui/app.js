import { VENDOR_LIST } from './constants.js';
import {
  parseLocalDate, formatDate, formatDateDisplay,
  generateCampaignWeeks, buildDarkDatesSet, classifyWeek,
} from './darkHelpers.js';
import { distributeImpressions } from '../logic/distributeImpressions.js';
import {
  formatVendorBlockText, formatAllVendorsText, generateExcelXML,
  downloadFile, copyToClipboard,
} from './exportHelpers.js';

let state = {
  campaignName: '', flightStartDate: '', flightEndDate: '',
  darkEnabled: false, darkMode: 'range',
  darkRanges: [], darkWeekOfMondays: [], darkSpecificDates: [],
  vendors: [], results: null, _nextId: 1,
};

function createVendor() {
  return { id: state._nextId++, partnerName: '', customName: '', vendorPlannedImpressions: '', collapsed: false };
}

function resetState() {
  state = { campaignName: '', flightStartDate: '', flightEndDate: '',
    darkEnabled: false, darkMode: 'range',
    darkRanges: [], darkWeekOfMondays: [], darkSpecificDates: [],
    vendors: [], results: null, _nextId: 1 };
  render();
  showToast('Reset complete!');
}

function getDarkConfig() {
  return { darkEnabled: state.darkEnabled, darkMode: state.darkMode,
    darkRanges: state.darkRanges, darkWeekOfMondays: state.darkWeekOfMondays,
    darkSpecificDates: state.darkSpecificDates };
}

function getCampaignDaysSummary() {
  if (!state.flightStartDate || !state.flightEndDate || state.flightStartDate > state.flightEndDate) return null;
  const start = parseLocalDate(state.flightStartDate);
  const end = parseLocalDate(state.flightEndDate);
  const totalDays = Math.round((end - start) / 86400000) + 1;
  const weeks = generateCampaignWeeks(start, end);
  const darkSet = buildDarkDatesSet(getDarkConfig(), start, end);
  let darkDays = 0, activeDays = 0, darkWeeksCount = 0;
  weeks.forEach((w) => {
    const c = classifyWeek(w, start, end, darkSet);
    darkDays += c.campaignDaysInWeek - c.activeDaysInWeek;
    activeDays += c.activeDaysInWeek;
    if (c.isDark) darkWeeksCount++;
  });
  return { totalDays, numWeeks: weeks.length, darkDays, activeDays, darkWeeksCount };
}

function getBlockingIssues() {
  const issues = [];
  if (!state.campaignName.trim()) issues.push('Campaign name is required.');
  if (!state.flightStartDate) issues.push('Flight start date is required.');
  if (!state.flightEndDate) issues.push('Flight end date is required.');
  if (state.flightStartDate && state.flightEndDate && state.flightStartDate > state.flightEndDate)
    issues.push('Flight start date must be on or before end date.');
  if (state.vendors.length === 0) issues.push('At least one vendor is required.');
  if (state.darkEnabled && state.flightStartDate && state.flightEndDate && state.flightStartDate <= state.flightEndDate) {
    const s = getCampaignDaysSummary();
    if (s && s.activeDays === 0) issues.push('No live days remain after dark periods — all vendors are blocked.');
  }
  state.vendors.forEach((v, i) => {
    const label = v.partnerName ? (v.partnerName === 'Custom' ? (v.customName || 'Vendor #'+(i+1)) : v.partnerName) : 'Vendor #'+(i+1);
    if (!v.partnerName) issues.push(label + ': partner name is required.');
    if (v.partnerName === 'Custom' && !v.customName.trim()) issues.push(label + ': custom partner name is required.');
    const imp = Number(v.vendorPlannedImpressions);
    if (!v.vendorPlannedImpressions || isNaN(imp) || imp <= 0)
      issues.push(label + ': planned impressions must be a positive number.');
  });
  return issues;
}

function getWarnings() {
  const warns = [];
  if (state.darkEnabled) {
    if (state.darkMode === 'range') {
      if (state.darkRanges.length === 0) warns.push('Dark range enabled but no ranges added.');
      state.darkRanges.forEach((r, i) => {
        if (!r.start || !r.end) warns.push('Dark range #'+(i+1)+' is incomplete.');
        else if (r.start > r.end) warns.push('Dark range #'+(i+1)+': start is after end.');
      });
    }
    if (state.darkMode === 'weeks' && state.darkWeekOfMondays.length === 0) warns.push('Dark weeks enabled but none selected.');
    if (state.darkMode === 'dates' && state.darkSpecificDates.length === 0) warns.push('Dark dates enabled but none added.');
  }
  const seen = {};
  state.vendors.forEach((v) => {
    const name = v.partnerName === 'Custom' ? v.customName.trim() : v.partnerName;
    if (name) seen[name] = (seen[name] || 0) + 1;
  });
  Object.entries(seen).forEach(([name, count]) => {
    if (count > 1) warns.push('Duplicate vendor: "'+name+'" appears '+count+' times.');
  });
  return warns;
}

function calculateAllVendors() {
  const start = parseLocalDate(state.flightStartDate);
  const end = parseLocalDate(state.flightEndDate);
  const weeks = generateCampaignWeeks(start, end);
  const darkSet = buildDarkDatesSet(getDarkConfig(), start, end);
  const classified = weeks.map((w) => classifyWeek(w, start, end, darkSet));
  state.results = state.vendors.map((v) => {
    const imps = Number(v.vendorPlannedImpressions);
    const distResult = distributeImpressions(imps, classified);
    const partnerLabel = v.partnerName === 'Custom' ? v.customName : v.partnerName;
    if (distResult.error) {
      return { partnerName: partnerLabel, vendorPlannedImpressions: imps, error: distResult.error,
        mondays: weeks.map((w) => formatDate(w.monday)), weeklyImpressions: [], weekStatuses: [],
        flightStart: state.flightStartDate, flightEnd: state.flightEndDate, numWeeks: weeks.length };
    }
    return { partnerName: partnerLabel, vendorPlannedImpressions: imps,
      mondays: weeks.map((w) => formatDate(w.monday)),
      weeklyImpressions: distResult.weeklyImpressions,
      weekStatuses: classified.map((c) => (c.isDark ? 'Dark' : 'Live')),
      flightStart: state.flightStartDate, flightEnd: state.flightEndDate, numWeeks: weeks.length };
  });
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.remove('show'); void t.offsetWidth;
  t.classList.add('show'); clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function render() {
  const active = document.activeElement;
  let focusMeta = null;
  if (active && active.id) {
    focusMeta = { id: active.id };
    if (active.selectionStart !== undefined) { focusMeta.ss = active.selectionStart; focusMeta.se = active.selectionEnd; }
  } else if (active && active.dataset && active.dataset.vid) {
    focusMeta = { vid: active.dataset.vid, field: active.dataset.field || '', cls: active.className.split(' ')[0] };
    if (active.selectionStart !== undefined) { focusMeta.ss = active.selectionStart; focusMeta.se = active.selectionEnd; }
  }
  const app = document.getElementById('app');
  const blocking = getBlockingIssues();
  const warnings = getWarnings();
  const summary = getCampaignDaysSummary();
  let h = '';
  h += '<header class="app-header">';
  h += '<button class="btn-reset-top" id="btnResetTop">↻ Reset</button>';
  h += '<h1>📊 Weekly Planned Impressions</h1>';
  h += '<p>Convert planned impressions &amp; flight dates into weekly plans per vendor.</p></header>';

  h += '<section class="card"><h2>Campaign Configuration</h2>';
  h += '<div class="form-row"><label>Campaign Name <span class="req">*</span>';
  h += '<input type="text" id="campaignName" value="' + escHtml(state.campaignName) + '" placeholder="Enter campaign name" /></label></div>';
  h += '<div class="form-row two-col">';
  h += '<label>Flight Start Date <span class="req">*</span><input type="date" id="flightStartDate" value="' + state.flightStartDate + '" /></label>';
  h += '<label>Flight End Date <span class="req">*</span><input type="date" id="flightEndDate" value="' + state.flightEndDate + '" /></label></div>';
  h += '<div class="form-row" style="margin-top:8px"><label class="checkbox-label">';
  h += '<input type="checkbox" id="darkEnabled" ' + (state.darkEnabled ? 'checked' : '') + ' />';
  h += 'Enable Dark Periods (applies to all vendors)</label></div>';
  if (state.darkEnabled) h += renderCampaignDarkSection();
  if (summary) {
    h += '<div class="days-summary">';
    h += '<div class="days-summary-item">📅 <strong>' + summary.totalDays + '</strong> total day' + (summary.totalDays !== 1 ? 's' : '') + ' across <strong>' + summary.numWeeks + '</strong> week' + (summary.numWeeks !== 1 ? 's' : '') + '</div>';
    if (state.darkEnabled && summary.darkDays > 0) {
      h += '<div class="days-summary-item dark">🌑 <strong>' + summary.darkDays + '</strong> dark day' + (summary.darkDays !== 1 ? 's' : '');
      if (summary.darkWeeksCount > 0) h += ' (' + summary.darkWeeksCount + ' full dark week' + (summary.darkWeeksCount !== 1 ? 's' : '') + ')';
      h += '</div>';
    }
    h += '<div class="days-summary-item active">✅ <strong>' + summary.activeDays + '</strong> active / live day' + (summary.activeDays !== 1 ? 's' : '') + '</div>';
    h += '</div>';
  }
  h += '</section>';

  h += '<section class="card"><div class="section-header"><h2>Vendors</h2>';
  h += '<button class="btn btn-primary" id="btnAddVendor">+ Add Vendor</button></div>';
  if (state.vendors.length === 0) {
    h += '<p class="empty-state">No vendors added yet. Click "Add Vendor" to begin.</p>';
  }
  state.vendors.forEach((v, idx) => {
    const pl = v.partnerName === 'Custom' ? (v.customName || 'Custom Vendor') : (v.partnerName || 'Vendor #'+(idx+1));
    const il = v.vendorPlannedImpressions ? Number(v.vendorPlannedImpressions).toLocaleString() + ' imps' : '';
    h += '<details class="vendor-card" data-vid="' + v.id + '" ' + (v.collapsed ? '' : 'open') + '>';
    h += '<summary class="vendor-summary"><span class="vendor-title">' + escHtml(pl) + '</span>';
    if (il) h += '<span class="badge">' + il + '</span>';
    h += '<button class="btn btn-danger btn-sm btn-remove" data-action="removeVendor" data-vid="' + v.id + '" title="Remove">✕</button></summary>';
    h += '<div class="vendor-body"><div class="form-row two-col">';
    h += '<label>Partner Name <span class="req">*</span><select data-vid="' + v.id + '" data-field="partnerName" class="partnerSelect">';
    h += '<option value="">— Select —</option>';
    VENDOR_LIST.forEach((name) => {
      h += '<option value="' + escHtml(name) + '" ' + (v.partnerName === name ? 'selected' : '') + '>' + escHtml(name) + '</option>';
    });
    h += '<option value="Custom" ' + (v.partnerName === 'Custom' ? 'selected' : '') + '>Custom…</option></select></label>';
    if (v.partnerName === 'Custom') {
      h += '<label>Custom Partner Name <span class="req">*</span>';
      h += '<input type="text" data-vid="' + v.id + '" data-field="customName" class="customNameInput" value="' + escHtml(v.customName) + '" placeholder="Enter partner name" /></label>';
    }
    h += '</div><div class="form-row"><label>Planned Impressions <span class="req">*</span>';
    h += '<input type="number" min="1" data-vid="' + v.id + '" data-field="vendorPlannedImpressions" class="impInput" value="' + v.vendorPlannedImpressions + '" placeholder="e.g. 500000" /></label></div>';
    h += '</div></details>';
  });
  h += '</section>';

  h += '<div class="actions-bar">';
  h += '<button class="btn btn-success btn-lg" id="btnCalculate" ' + (blocking.length ? 'disabled' : '') + '>Calculate All Vendors</button>';
  h += '<button class="btn btn-secondary" id="btnReset">↻ Reset</button></div>';

  if (blocking.length) {
    h += '<div class="issues-panel blocking"><h3>🚫 Blocking Issues</h3><ul>';
    blocking.forEach((i) => { h += '<li>' + escHtml(i) + '</li>'; });
    h += '</ul></div>';
  }
  if (warnings.length) {
    h += '<div class="issues-panel warning"><h3>⚠️ Warnings</h3><ul>';
    warnings.forEach((w) => { h += '<li>' + escHtml(w) + '</li>'; });
    h += '</ul></div>';
  }

  if (state.results && state.results.length) {
    h += '<section class="card results-section"><div class="section-header"><h2>Results</h2><div>';
    h += '<button class="btn btn-primary btn-sm" id="btnCopyAll">📋 Copy All</button> ';
    h += '<button class="btn btn-secondary btn-sm" id="btnExport">📥 Export .xls</button>';
    h += '</div></div>';
    state.results.forEach((r, ri) => { h += renderResultBlock(r, ri); });
    h += '</section>';
  }

  h += '<footer class="app-footer">Weekly Planned Impressions Planner — Offline-first tool</footer>';
  app.innerHTML = h;

  if (focusMeta) {
    let el = null;
    if (focusMeta.id) el = document.getElementById(focusMeta.id);
    else if (focusMeta.vid && focusMeta.field) el = app.querySelector('[data-vid="'+focusMeta.vid+'"][data-field="'+focusMeta.field+'"]');
    else if (focusMeta.vid && focusMeta.cls) el = app.querySelector('[data-vid="'+focusMeta.vid+'"].'+focusMeta.cls);
    if (el) {
      el.focus();
      if (focusMeta.ss !== undefined && el.setSelectionRange) {
        try { el.setSelectionRange(focusMeta.ss, focusMeta.se); } catch(_) {}
      }
    }
  }
}

function renderCampaignDarkSection() {
  let h = '<div class="dark-section"><div class="dark-mode-selector">';
  h += '<label class="' + (state.darkMode==='range'?'active':'') + '"><input type="radio" name="darkMode" value="range" ' + (state.darkMode==='range'?'checked':'') + ' /> Date Range</label>';
  h += '<label class="' + (state.darkMode==='weeks'?'active':'') + '"><input type="radio" name="darkMode" value="weeks" ' + (state.darkMode==='weeks'?'checked':'') + ' /> By Week</label>';
  h += '<label class="' + (state.darkMode==='dates'?'active':'') + '"><input type="radio" name="darkMode" value="dates" ' + (state.darkMode==='dates'?'checked':'') + ' /> Specific Dates</label></div>';

  if (state.darkMode === 'range') {
    h += '<div class="dark-range-list">';
    state.darkRanges.forEach((r, i) => {
      h += '<div class="dark-range-row">';
      h += '<span class="dark-range-num">Range #' + (i+1) + '</span>';
      h += '<label>Start <input type="date" class="darkRangeInput" data-ridx="'+i+'" data-rfield="start" value="'+(r.start||')+'" /></label>';
      h += '<label>End <input type="date" class="darkRangeInput" data-ridx="'+i+'" data-rfield="end" value="'+(r.end||')+'" /></label>';
      h += '<button class="btn btn-danger btn-sm" data-action="removeDarkRange" data-ridx="'+i+'" title="Remove">✕</button>';
      h += '</div>';
    });
    h += '</div>';
    h += '<button class="btn btn-primary btn-sm" data-action="addDarkRange" style="margin-top:10px">+ Add Range</button>';
  } else if (state.darkMode === 'weeks') {
    if (state.flightStartDate && state.flightEndDate && state.flightStartDate <= state.flightEndDate) {
      const start = parseLocalDate(state.flightStartDate);
      const end = parseLocalDate(state.flightEndDate);
      const weeks = generateCampaignWeeks(start, end);
      h += '<div class="dark-weeks-list">';
      weeks.forEach((w) => {
        const monStr = formatDate(w.monday);
        const chk = state.darkWeekOfMondays.includes(monStr);
        h += '<label class="week-checkbox"><input type="checkbox" data-action="toggleDarkWeek" data-monday="'+monStr+'" '+(chk?'checked':'')+' />';
        h += 'Week of '+formatDateDisplay(w.monday)+' – '+formatDateDisplay(w.sunday)+'</label>';
      });
      h += '</div>';
    } else {
      h += '<p class="hint">Set valid flight dates to see available weeks.</p>';
    }
  } else if (state.darkMode === 'dates') {
    h += '<div class="inline-add"><input type="date" id="darkDateInput" />';
    h += '<button class="btn btn-primary btn-sm" data-action="addDarkDate">Add</button></div>';
    h += '<div class="chips-container">';
    state.darkSpecificDates.slice().sort().forEach((ds) => {
      h += '<span class="chip">'+formatDateDisplay(parseLocalDate(ds));
      h += '<button class="chip-remove" data-action="removeDarkDate" data-date="'+ds+'">✕</button></span>';
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function renderResultBlock(r, ri) {
  let h = '<div class="result-block" data-ri="'+ri+'">';
  h += '<div class="result-header"><h3>'+escHtml(r.partnerName)+'</h3>';
  h += '<button class="btn btn-secondary btn-sm" data-action="copyVendor" data-ri="'+ri+'">📋 Copy</button></div>';
  h += '<div class="result-meta">';
  h += '<div><strong>Campaign:</strong> '+escHtml(state.campaignName)+'</div>';
  h += '<div><strong>Quarter Planned Impressions:</strong> '+r.vendorPlannedImpressions.toLocaleString()+'</div>';
  h += '<div><strong>Flight Dates:</strong> '+r.numWeeks+' Weeks '+formatDateDisplay(parseLocalDate(r.flightStart))+' - '+formatDateDisplay(parseLocalDate(r.flightEnd))+'</div></div>';
  if (r.error) {
    h += '<p class="result-error">❌ '+escHtml(r.error)+'</p>';
  } else {
    h += '<div class="result-table-wrapper"><table class="result-table"><thead><tr><th>Week Of</th>';
    r.mondays.forEach((m) => { h += '<th>'+formatDateDisplay(parseLocalDate(m))+'</th>'; });
    h += '<th class="total-col">TOTAL</th></tr></thead><tbody><tr><td><strong>Planned Impressions</strong></td>';
    let total = 0;
    r.weeklyImpressions.forEach((val, i) => {
      total += val;
      if (r.weekStatuses[i]==='Dark') h += '<td class="dark-cell">Dark Week</td>';
      else h += '<td>'+val.toLocaleString()+'</td>';
    });
    h += '<td class="total-col">'+total.toLocaleString()+'</td></tr></tbody></table></div>';
    const dm = r.mondays.filter((_,i) => r.weekStatuses[i]==='Dark');
    h += '<p class="dark-weeks-info"><strong>Dark Weeks:</strong> '+(dm.length ? dm.map((m)=>formatDateDisplay(parseLocalDate(m))).join(', ') : 'N/A')+'</p>';
  }
  h += '</div>';
  return h;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function findVendor(id) { return state.vendors.find((v)=>v.id===Number(id)); }

const DATE_STATE_IDS = new Set(['flightStartDate','flightEndDate']);

function init() {
  const app = document.getElementById('app');

  app.addEventListener('toggle', (e) => {
    if (e.target.tagName==='DETAILS' && e.target.dataset.vid) {
      const v = findVendor(e.target.dataset.vid);
      if (v) v.collapsed = !e.target.open;
    }
  }, true);

  app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id==='campaignName') { state.campaignName=el.value; state.results=null; return; }
    if (el.type==='date' && DATE_STATE_IDS.has(el.id)) { state[el.id]=el.value; state.results=null; return; }
    if (el.classList.contains('darkRangeInput')) {
      const ri=Number(el.dataset.ridx), rf=el.dataset.rfield;
      if (state.darkRanges[ri]) { state.darkRanges[ri][rf]=el.value; state.results=null; }
      return;
    }
    if (el.id==='darkDateInput') return;
    if (el.dataset.vid && el.dataset.field) {
      const v=findVendor(el.dataset.vid);
      if (v && (el.dataset.field==='customName'||el.dataset.field==='vendorPlannedImpressions')) {
        v[el.dataset.field]=el.value; state.results=null;
      }
    }
  });

  app.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.type==='date' && DATE_STATE_IDS.has(el.id)) { setTimeout(()=>render(),60); return; }
    if (el.classList.contains('darkRangeInput')) { setTimeout(()=>render(),60); return; }
    if (el.id==='campaignName') { setTimeout(()=>render(),60); return; }
    if (el.dataset.vid && el.dataset.field) {
      const f=el.dataset.field;
      if (f==='customName'||f==='vendorPlannedImpressions') setTimeout(()=>render(),60);
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type==='date' && DATE_STATE_IDS.has(el.id)) { state[el.id]=el.value; state.results=null; return; }
    if (el.classList.contains('darkRangeInput')) {
      const ri=Number(el.dataset.ridx), rf=el.dataset.rfield;
      if (state.darkRanges[ri]) { state.darkRanges[ri][rf]=el.value; state.results=null; }
      return;
    }
    if (el.id==='darkDateInput') return;
    if (el.id==='darkEnabled') { state.darkEnabled=el.checked; state.results=null; render(); return; }
    if (el.name==='darkMode') { state.darkMode=el.value; state.results=null; render(); return; }
    if (el.dataset.action==='toggleDarkWeek') {
      const mon=el.dataset.monday;
      if (el.checked) { if (!state.darkWeekOfMondays.includes(mon)) state.darkWeekOfMondays.push(mon); }
      else { state.darkWeekOfMondays=state.darkWeekOfMondays.filter((m)=>m!==mon); }
      state.results=null; render(); return;
    }
    if (el.dataset.vid) {
      const v=findVendor(el.dataset.vid); if (!v) return; state.results=null;
      if (el.dataset.field==='partnerName') { v.partnerName=el.value; render(); return; }
      if (el.dataset.field==='customName') { v.customName=el.value; render(); return; }
      if (el.dataset.field==='vendorPlannedImpressions') { v.vendorPlannedImpressions=el.value; render(); return; }
    }
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action],#btnAddVendor,#btnCalculate,#btnReset,#btnResetTop,#btnCopyAll,#btnExport');
    if (!el) return;
    if (el.id==='btnAddVendor') { state.vendors.push(createVendor()); state.results=null; render(); return; }
    if (el.id==='btnCalculate') {
      calculateAllVendors(); render(); showToast('Calculation complete!');
      setTimeout(()=>{ const rs=document.querySelector('.results-section'); if(rs) rs.scrollIntoView({behavior:'smooth'}); },100);
      return;
    }
    if (el.id==='btnReset'||el.id==='btnResetTop') { resetState(); return; }
    if (el.id==='btnCopyAll') {
      if (!state.results) return;
      copyToClipboard(formatAllVendorsText(state.results,state.campaignName)).then(()=>showToast('All vendors copied!'));
      return;
    }
    if (el.id==='btnExport') {
      if (!state.results) return;
      const xml=generateExcelXML(state.results,state.campaignName);
      const fname=(state.campaignName||'export').replace(/[^a-zA-Z0-9_-]/g,'_')+'_weekly_imps.xls';
      downloadFile(xml,fname,'application/vnd.ms-excel');
      showToast('Exported!'); return;
    }
    if (el.dataset.action==='removeVendor') { state.vendors=state.vendors.filter((v)=>v.id!==Number(el.dataset.vid)); state.results=null; render(); return; }
    if (el.dataset.action==='addDarkRange') { state.darkRanges.push({start:'',end:''}); state.results=null; render(); return; }
    if (el.dataset.action==='removeDarkRange') { state.darkRanges.splice(Number(el.dataset.ridx),1); state.results=null; render(); return; }
    if (el.dataset.action==='addDarkDate') {
      const inp=document.getElementById('darkDateInput');
      if (inp&&inp.value) { if(!state.darkSpecificDates.includes(inp.value)) state.darkSpecificDates.push(inp.value); state.results=null; render(); }
      return;
    }
    if (el.dataset.action==='removeDarkDate') { state.darkSpecificDates=state.darkSpecificDates.filter((d)=>d!==el.dataset.date); state.results=null; render(); return; }
    if (el.dataset.action==='copyVendor') {
      const ri=Number(el.dataset.ri);
      if (state.results&&state.results[ri]) {
        copyToClipboard(formatVendorBlockText(state.results[ri],state.campaignName)).then(()=>showToast('Vendor block copied!'));
      }
      return;
    }
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
