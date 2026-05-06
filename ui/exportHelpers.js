import { formatDateDisplay, parseLocalDate } from './darkHelpers.js';

export function formatVendorBlockText(result, campaignName) {
  const lines = [];
  const startDisp = formatDateDisplay(parseLocalDate(result.flightStart));
  const endDisp = formatDateDisplay(parseLocalDate(result.flightEnd));
  lines.push('Partner Name:\t' + result.partnerName);
  lines.push('');
  lines.push('Campaign name:\t' + campaignName);
  lines.push('Quarter Planned Impressions:\t' + result.vendorPlannedImpressions.toLocaleString());
  lines.push('Flight Dates:\t' + result.numWeeks + ' Weeks ' + startDisp + ' - ' + endDisp);
  lines.push('');
  const mondayHeaders = result.mondays.map((m) => formatDateDisplay(parseLocalDate(m)));
  lines.push(['Week Of', ...mondayHeaders, 'TOTAL'].join('\t'));
  const total = result.weeklyImpressions.reduce((a, b) => a + b, 0);
  const values = result.weeklyImpressions.map((val, i) =>
    result.weekStatuses[i] === 'Dark' ? 'Dark Week' : val.toLocaleString()
  );
  lines.push(['Planned Impressions', ...values, total.toLocaleString()].join('\t'));
  lines.push('');
  const darkMondays = result.mondays.filter((_, i) => result.weekStatuses[i] === 'Dark');
  if (darkMondays.length > 0) {
    lines.push('Dark Weeks:\t' + darkMondays.map((m) => formatDateDisplay(parseLocalDate(m))).join(', '));
  } else {
    lines.push('Dark Weeks:\tN/A');
  }
  return lines.join('\n');
}

export function formatAllVendorsText(results, campaignName) {
  return results.map((r) => formatVendorBlockText(r, campaignName)).join('\n\n\n');
}

function escXml(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlCell(style, type, value) {
  if (type === 'Number') return '<Cell ss:StyleID="' + style + '"><Data ss:Type="Number">' + value + '</Data></Cell>';
  return '<Cell ss:StyleID="' + style + '"><Data ss:Type="String">' + escXml(value) + '</Data></Cell>';
}

function xmlRow(cells) { return '<Row>' + cells.join('') + '</Row>\n'; }
function blankRow() { return '<Row><Cell><Data ss:Type="String"></Data></Cell></Row>\n'; }

export function generateExcelXML(results, campaignName) {
  let xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel">\n';

  xml += '<Styles>\n';
  xml += '<Style ss:ID="Default"><Alignment ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="10"/>';
  xml += '<Interior ss:Color="#2563EB" ss:Pattern="Solid"/>';
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/>';
  xml += '<Borders><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1D4ED8"/></Borders></Style>\n';
  xml += '<Style ss:ID="HeaderTotal"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="10"/>';
  xml += '<Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/>';
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="Label"><Font ss:Bold="1" ss:Size="10"/><Alignment ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="PartnerName"><Font ss:Bold="1" ss:Color="#2563EB" ss:Size="12"/><Alignment ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="NumberCell"><NumberFormat ss:Format="#,##0"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="DarkCell"><Font ss:Italic="1" ss:Color="#6B7280"/>';
  xml += '<Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/>';
  xml += '<Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="TotalCell"><Font ss:Bold="1" ss:Color="#1D4ED8"/>';
  xml += '<Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>';
  xml += '<NumberFormat ss:Format="#,##0"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>\n';
  xml += '<Style ss:ID="Value"><Alignment ss:Vertical="Center"/></Style>\n';
  xml += '</Styles>\n';

  xml += '<Worksheet ss:Name="Weekly Impressions">\n<Table>\n';
  const maxWeeks = Math.max(...results.map((r) => r.mondays.length));
  xml += '<Column ss:Width="180"/>\n';
  for (let i = 0; i < maxWeeks; i++) xml += '<Column ss:Width="110"/>\n';
  xml += '<Column ss:Width="120"/>\n';

  for (let ri = 0; ri < results.length; ri++) {
    const r = results[ri];
    const startDisp = formatDateDisplay(parseLocalDate(r.flightStart));
    const endDisp = formatDateDisplay(parseLocalDate(r.flightEnd));

    xml += xmlRow([xmlCell('PartnerName', 'String', 'Partner Name: ' + r.partnerName)]);
    xml += blankRow();
    xml += xmlRow([xmlCell('Label', 'String', 'Campaign name:'), xmlCell('Value', 'String', campaignName)]);
    xml += xmlRow([xmlCell('Label', 'String', 'Quarter Planned Impressions:'), xmlCell('NumberCell', 'Number', r.vendorPlannedImpressions)]);
    xml += xmlRow([xmlCell('Label', 'String', 'Flight Dates:'), xmlCell('Value', 'String', r.numWeeks + ' Weeks ' + startDisp + ' - ' + endDisp)]);
    xml += blankRow();

    if (r.error) {
      xml += xmlRow([xmlCell('Label', 'String', 'ERROR: ' + r.error)]);
    } else {
      const hCells = [xmlCell('Header', 'String', 'Week Of')];
      r.mondays.forEach((m) => hCells.push(xmlCell('Header', 'String', formatDateDisplay(parseLocalDate(m)))));
      hCells.push(xmlCell('HeaderTotal', 'String', 'TOTAL'));
      xml += xmlRow(hCells);

      const total = r.weeklyImpressions.reduce((a, b) => a + b, 0);
      const dCells = [xmlCell('Label', 'String', 'Planned Impressions')];
      r.weeklyImpressions.forEach((val, i) => {
        if (r.weekStatuses[i] === 'Dark') dCells.push(xmlCell('DarkCell', 'String', 'Dark Week'));
        else dCells.push(xmlCell('NumberCell', 'Number', val));
      });
      dCells.push(xmlCell('TotalCell', 'Number', total));
      xml += xmlRow(dCells);
      xml += blankRow();

      const darkMondays = r.mondays.filter((_, i) => r.weekStatuses[i] === 'Dark');
      const darkText = darkMondays.length > 0
        ? darkMondays.map((m) => formatDateDisplay(parseLocalDate(m))).join(', ')
        : 'N/A';
      xml += xmlRow([xmlCell('Label', 'String', 'Dark Weeks:'), xmlCell('Value', 'String', darkText)]);
    }
    xml += blankRow();
    xml += blankRow();
  }

  xml += '</Table>\n</Worksheet>\n</Workbook>';
  return xml;
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); resolve(); }
    catch (e) { reject(e); }
    finally { document.body.removeChild(ta); }
  });
}
