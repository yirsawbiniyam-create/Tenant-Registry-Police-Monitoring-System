import ExcelJS from 'exceljs';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ActivityHistory, CriminalRecord, Landlord, Tenant } from '../types';
import { formatDateAm, sanitizeImageSrc } from './crypto';

export interface ReportSectionsConfig {
  summary: boolean;
  charts: boolean;
  areaTable: boolean;
  landlords: boolean;
  tenants: boolean;
  criminalRecords: boolean;
}

export interface ReportPayload {
  commissionName: string;
  customTitle?: string;
  periodLabel: string;
  jurisdictionLabel: string;
  generatedAtLabel: string;
  logoUrl?: string;
  sections?: ReportSectionsConfig;
  summary: {
    totalLandlords: number;
    totalTenants: number;
    activeTenants: number;
    policeTenants: number;
    totalRooms: number;
    criminalRecordsCount?: number;
    wantedAlertsCount?: number;
    repeatOffendersCount?: number;
    arrestedTodayCount?: number;
    totalArrestedCount?: number;
    suspectsCount?: number;
  };
  breakdownByArea: Array<{
    city: string;
    woreda: string;
    kebele: string;
    landlords: number;
    tenants: number;
    policeTenants: number;
  }>;
  landlords: Landlord[];
  tenants: Tenant[];
  criminalRecords?: CriminalRecord[];
  history: ActivityHistory[];
}

const DEFAULT_SECTIONS: ReportSectionsConfig = {
  summary: true,
  charts: true,
  areaTable: true,
  landlords: true,
  tenants: true,
  criminalRecords: true,
};

function safeExcelCell(val: unknown): string | number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val ?? '-');
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

function formatCrimeStatusLabel(type: CriminalRecord['recordType']): string {
  switch (type) {
    case 'suspect':
      return 'ተጠርጣሪ (Suspect)';
    case 'arrested':
      return 'ታስሯል (Arrested)';
    case 'convicted':
      return 'ተፈርዶበታል (Convicted)';
    case 'released':
      return 'ተፈትቷል (Released)';
    default:
      return type;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function styleWorksheetTable(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  const titleRow = sheet.addRow([safeExcelCell(title)]);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  const subRow = sheet.addRow([safeExcelCell(subtitle)]);
  subRow.font = { size: 10, color: { argb: 'FF475569' } };
  sheet.addRow([]);

  const headerRow = sheet.addRow(headers.map((h) => safeExcelCell(h)));
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  rows.forEach((rowVals, idx) => {
    const r = sheet.addRow(rowVals.map((v) => safeExcelCell(v)));
    r.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  headers.forEach((h, i) => {
    const maxDataLen = rows.reduce((max, r) => {
      const len = String(r[i] ?? '').length;
      return len > max ? len : max;
    }, h.length);
    sheet.getColumn(i + 1).width = Math.min(48, Math.max(14, maxDataLen + 4));
  });
}

export async function exportToExcel(
  report: ReportPayload,
  filePrefix = 'Begu_Rent_Police_Report'
): Promise<void> {
  const sections = { ...DEFAULT_SECTIONS, ...report.sections };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Begu Rent — Benishangul-Gumuz Police Commission';
  wb.created = new Date();

  const reportTitle = report.customTitle?.trim() || `${report.commissionName} — ${report.periodLabel}`;
  const subtitle = `አካባቢ: ${report.jurisdictionLabel} | የተዘጋጀበት ቀን: ${report.generatedAtLabel}`;

  if (sections.summary) {
    const summarySheet = wb.addWorksheet('Summary_ማጠቃለያ');
    const summaryRows: Array<[string, string | number]> = [
      ['ተቋም (Commission)', report.commissionName],
      ['የሪፖርት ጊዜ (Period)', report.periodLabel],
      ['አካባቢ / አድራሻ (Jurisdiction)', report.jurisdictionLabel],
      ['የተዘጋጀበት ቀን (Generated)', report.generatedAtLabel],
      ['ጠቅላላ አከራዮች (Total Landlords)', report.summary.totalLandlords],
      ['ጠቅላላ ተከራዮች (Total Tenants)', report.summary.totalTenants],
      ['ንቁ ተከራዮች (Active Tenants)', report.summary.activeTenants],
      ['የፖሊስ አባል ተከራዮች (Police Tenants)', report.summary.policeTenants],
      ['ጠቅላላ የሚከራዩ ክፍሎች (Total Rooms)', report.summary.totalRooms],
    ];
    if (typeof report.summary.criminalRecordsCount === 'number') {
      summaryRows.push(['የወንጀል ሪከርዶች (Criminal Records)', report.summary.criminalRecordsCount]);
    }
    if (typeof report.summary.suspectsCount === 'number') {
      summaryRows.push(['ተጠርጣሪዎች (Suspects)', report.summary.suspectsCount]);
    }
    if (typeof report.summary.repeatOffendersCount === 'number') {
      summaryRows.push(['ደጋጋሚ ወንጀለኞች (Repeat Offenders)', report.summary.repeatOffendersCount]);
    }
    if (typeof report.summary.arrestedTodayCount === 'number') {
      summaryRows.push(['ዛሬ የታሰሩ (Arrested Today)', report.summary.arrestedTodayCount]);
    }
    if (typeof report.summary.totalArrestedCount === 'number') {
      summaryRows.push(['ጠቅላላ የታሰሩ (Total Arrested)', report.summary.totalArrestedCount]);
    }
    if (typeof report.summary.wantedAlertsCount === 'number') {
      summaryRows.push(['የተፈላጊ ማንቂያዎች (Wanted Alerts)', report.summary.wantedAlertsCount]);
    }
    styleWorksheetTable(summarySheet, reportTitle, subtitle, ['መለኪያ (Metric)', 'ዋጋ (Value)'], summaryRows);
  }

  if (sections.areaTable) {
    const areaSheet = wb.addWorksheet('Area_Statistics_በአድራሻ');
    styleWorksheetTable(
      areaSheet,
      `${reportTitle} — በአድራሻ ዝርዝር`,
      subtitle,
      ['ከተማ (City)', 'ወረዳ (Woreda)', 'ቀበሌ (Kebele)', 'አከራዮች', 'ተከራዮች', 'የፖሊስ ተከራዮች'],
      report.breakdownByArea.map((a) => [a.city, a.woreda, a.kebele, a.landlords, a.tenants, a.policeTenants])
    );
  }

  if (sections.landlords) {
    const landlordsSheet = wb.addWorksheet('Landlords_አከራዮች');
    styleWorksheetTable(
      landlordsSheet,
      `${reportTitle} — የአከራዮች መዝገብ`,
      subtitle,
      ['ሙሉ ስም', 'ስልክ ቁጥር', 'የፋይዳ ቁጥር', 'ከተማ', 'ወረዳ', 'ቀበሌ', 'የቤት ቁጥር', 'ክፍል ብዛት', 'ሁኔታ', 'የተመዘገበበት ቀን'],
      report.landlords.map((l) => [
        l.fullName,
        l.phone,
        l.faydaId,
        l.city,
        l.woreda,
        l.kebele,
        l.houseNumber,
        l.roomCount,
        l.status === 'active' ? 'ንቁ' : l.status === 'replaced' ? 'ተቀይሯል' : 'ታግዷል',
        formatDateAm(l.createdAt),
      ])
    );
  }

  if (sections.tenants) {
    const tenantsSheet = wb.addWorksheet('Tenants_ተከራዮች');
    styleWorksheetTable(
      tenantsSheet,
      `${reportTitle} — የተከራዮች መዝገብ`,
      subtitle,
      [
        'ሙሉ ስም',
        'ስልክ ቁጥር',
        'የጋብቻ ሁኔታ',
        'አኗኗር',
        'ስራ',
        'ፖሊስ ተከራይ',
        'መታወቂያ ዓይነት',
        'መታወቂያ ቁጥር',
        'አከራይ ስም',
        'አከራይ ስልክ',
        'ከተማ',
        'ወረዳ',
        'ቀበሌ',
        'የቤት ቁጥር',
        'የገባበት ቀን',
        'ሁኔታ',
      ],
      report.tenants.map((t) => [
        t.fullName,
        t.phone,
        t.maritalStatus === 'married' ? 'ባለትዳር' : 'ያላገባ',
        t.livingArrangement === 'alone'
          ? 'ብቻውን'
          : `ከ${t.coResidents.length} ሰው ጋር (${t.coResidents.join(', ')})`,
        t.occupation,
        t.isPoliceTenant ? 'አዎ (ፖሊስ)' : 'አይደለም',
        t.idType === 'police_digital' ? 'የፖሊስ ዲጅታል' : 'ፋይዳ',
        t.idNumber,
        t.landlordName,
        t.landlordPhone,
        t.city,
        t.woreda,
        t.kebele,
        t.houseNumber,
        t.moveInDate,
        t.status === 'active' ? 'በመኖር ላይ' : 'ለቋል',
      ])
    );
  }

  if (sections.criminalRecords) {
    const crimeSheet = wb.addWorksheet('Criminal_Records_ወንጀል');
    styleWorksheetTable(
      crimeSheet,
      `${reportTitle} — የወንጀል እና የተጠርጣሪ ሪከርዶች`,
      subtitle,
      ['የግለሰብ ስም', 'ስልክ', 'ፋይዳ ቁጥር', 'ሁኔታ', 'ጥፋት / ጉዳይ', 'ዝርዝር', 'ጣቢያ', 'ከተማ', 'ወረዳ', 'ቀበሌ', 'ቀን', 'የመዘገበው ኦፊሰር'],
      (report.criminalRecords || []).map((c) => [
        c.personName,
        c.phone || '-',
        c.faydaId || '-',
        formatCrimeStatusLabel(c.recordType),
        c.offenseTitle,
        c.description,
        c.stationName,
        c.city,
        c.woreda,
        c.kebele,
        c.incidentDate,
        c.recordedByName,
      ])
    );
  }

  if (wb.worksheets.length === 0) {
    const fallback = wb.addWorksheet('Report');
    styleWorksheetTable(fallback, reportTitle, subtitle, ['Info'], [['No sections selected']]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `${filePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function makeDocCell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || '-', bold, size: 19 })],
      }),
    ],
  });
}

export async function exportToWord(
  report: ReportPayload,
  filePrefix = 'Begu_Rent_Police_Report'
) {
  const sections = { ...DEFAULT_SECTIONS, ...report.sections };
  const docChildren: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: report.commissionName, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text:
            report.customTitle?.trim() ||
            `የአከራይ ተከራይ እና የወንጀል ክትትል ስታቲስቲክስ ሪፖርት (${report.periodLabel})`,
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `አካባቢ: ${report.jurisdictionLabel}  |  ቀን: ${report.generatedAtLabel}`,
          size: 20,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
  ];

  if (sections.summary) {
    const summaryTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [makeDocCell('የመለኪያ አይነት', true), makeDocCell('ብዛት / መረጃ', true)],
        }),
        new TableRow({
          children: [makeDocCell('ጠቅላላ የተመዘገቡ አከራዮች'), makeDocCell(String(report.summary.totalLandlords))],
        }),
        new TableRow({
          children: [makeDocCell('ጠቅላላ የተመዘገቡ ተከራዮች'), makeDocCell(String(report.summary.totalTenants))],
        }),
        new TableRow({
          children: [makeDocCell('በአሁኑ ጊዜ በመኖር ላይ ያሉ ተከራዮች'), makeDocCell(String(report.summary.activeTenants))],
        }),
        new TableRow({
          children: [
            makeDocCell('የፖሊስ አባል ተከራዮች (ዲጅታል መታወቂያ)'),
            makeDocCell(String(report.summary.policeTenants)),
          ],
        }),
        new TableRow({
          children: [makeDocCell('ጠቅላላ የሚከራዩ ቤቶች/ክፍሎች'), makeDocCell(String(report.summary.totalRooms))],
        }),
        ...(typeof report.summary.suspectsCount === 'number'
          ? [
              new TableRow({
                children: [makeDocCell('ተጠርጣሪዎች ብዛት'), makeDocCell(String(report.summary.suspectsCount))],
              }),
            ]
          : []),
        ...(typeof report.summary.repeatOffendersCount === 'number'
          ? [
              new TableRow({
                children: [makeDocCell('ደጋጋሚ ወንጀለኞች ብዛት'), makeDocCell(String(report.summary.repeatOffendersCount))],
              }),
            ]
          : []),
        ...(typeof report.summary.totalArrestedCount === 'number'
          ? [
              new TableRow({
                children: [
                  makeDocCell('ጠቅላላ የታሰሩ ሰዎች (ዛሬ / ጠቅላላ)'),
                  makeDocCell(`${report.summary.arrestedTodayCount ?? 0} / ${report.summary.totalArrestedCount}`),
                ],
              }),
            ]
          : []),
      ],
    });
    docChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'ዋና ማጠቃለያ', bold: true })] }),
      summaryTable,
      new Paragraph({ text: '' })
    );
  }

  if (sections.areaTable) {
    const areaRows = [
      new TableRow({
        children: [
          makeDocCell('ከተማ', true),
          makeDocCell('ወረዳ', true),
          makeDocCell('ቀበሌ', true),
          makeDocCell('አከራዮች', true),
          makeDocCell('ተከራዮች', true),
          makeDocCell('ፖሊስ ተከራዮች', true),
        ],
      }),
      ...report.breakdownByArea.slice(0, 60).map(
        (a) =>
          new TableRow({
            children: [
              makeDocCell(a.city),
              makeDocCell(a.woreda),
              makeDocCell(a.kebele),
              makeDocCell(String(a.landlords)),
              makeDocCell(String(a.tenants)),
              makeDocCell(String(a.policeTenants)),
            ],
          })
      ),
    ];
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'በከተማ፣ ወረዳ እና ቀበሌ ስርጭት', bold: true })],
      }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: areaRows }),
      new Paragraph({ text: '' })
    );
  }

  if (sections.landlords) {
    const landlordRows = [
      new TableRow({
        children: [
          makeDocCell('አከራይ ስም', true),
          makeDocCell('ስልክ', true),
          makeDocCell('ፋይዳ ቁጥር', true),
          makeDocCell('አድራሻ (ከተማ/ወረዳ/ቀበሌ)', true),
          makeDocCell('ቤት / ክፍል', true),
        ],
      }),
      ...report.landlords.slice(0, 100).map(
        (l) =>
          new TableRow({
            children: [
              makeDocCell(l.fullName),
              makeDocCell(l.phone),
              makeDocCell(l.faydaId),
              makeDocCell(`${l.city} / ${l.woreda} / ${l.kebele}`),
              makeDocCell(`#${l.houseNumber} (${l.roomCount})`),
            ],
          })
      ),
    ];
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'የአከራዮች ዝርዝር መረጃ', bold: true })],
      }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: landlordRows }),
      new Paragraph({ text: '' })
    );
  }

  if (sections.tenants) {
    const tenantRows = [
      new TableRow({
        children: [
          makeDocCell('ተከራይ ስም', true),
          makeDocCell('ስልክ', true),
          makeDocCell('ስራ / መታወቂያ', true),
          makeDocCell('አድራሻ (ከተማ/ወረዳ/ቀበሌ)', true),
          makeDocCell('አከራይ', true),
        ],
      }),
      ...report.tenants.slice(0, 100).map(
        (t) =>
          new TableRow({
            children: [
              makeDocCell(t.fullName),
              makeDocCell(t.phone),
              makeDocCell(`${t.occupation} (${t.idNumber})`),
              makeDocCell(`${t.city} / ${t.woreda} / ${t.kebele}`),
              makeDocCell(`${t.landlordName} (${t.landlordPhone})`),
            ],
          })
      ),
    ];
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'የተከራዮች ዝርዝር መረጃ', bold: true })],
      }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tenantRows }),
      new Paragraph({ text: '' })
    );
  }

  if (sections.criminalRecords) {
    const crimeList = report.criminalRecords || [];
    const crimeRows = [
      new TableRow({
        children: [
          makeDocCell('የግለሰብ ስም', true),
          makeDocCell('ስልክ / ፋይዳ', true),
          makeDocCell('ሁኔታ', true),
          makeDocCell('ጥፋት / ጉዳይ', true),
          makeDocCell('ጣቢያ እና አድራሻ', true),
          makeDocCell('ቀን', true),
        ],
      }),
      ...crimeList.slice(0, 120).map(
        (c) =>
          new TableRow({
            children: [
              makeDocCell(c.personName),
              makeDocCell(`${c.phone || '-'} / ${c.faydaId || '-'}`),
              makeDocCell(formatCrimeStatusLabel(c.recordType)),
              makeDocCell(`${c.offenseTitle}${c.description ? ` — ${c.description.slice(0, 90)}` : ''}`),
              makeDocCell(`${c.stationName} (${c.city}/${c.woreda}/${c.kebele})`),
              makeDocCell(c.incidentDate),
            ],
          })
      ),
    ];
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'የእስር፣ የተጠርጣሪ እና የወንጀል ሪከርዶች', bold: true })],
      }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: crimeRows })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${filePrefix}_${new Date().toISOString().slice(0, 10)}.docx`);
}

export async function exportToPowerPoint(
  report: ReportPayload,
  filePrefix = 'Begu_Rent_Police_Report'
) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  const slide1 = pptx.addSlide();
  slide1.background = { color: '0F172A' };
  const safeLogoUrl = sanitizeImageSrc(report.logoUrl);
  let pptLogoData = safeLogoUrl.startsWith('data:image/') ? safeLogoUrl : '';
  if (!pptLogoData && safeLogoUrl.startsWith('/assets/')) {
    try {
      const resp = await fetch(safeLogoUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        pptLogoData = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      pptLogoData = '';
    }
  }
  if (pptLogoData.startsWith('data:image/')) {
    slide1.addImage({ data: pptLogoData, x: 4.35, y: 0.5, w: 1.3, h: 1.3 });
  }
  slide1.addText(report.commissionName, {
    x: 0.6,
    y: 2.0,
    w: 8.8,
    h: 0.7,
    fontSize: 26,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
  });
  slide1.addText(
    report.customTitle?.trim() || `የአከራይ ተከራይ እና የወንጀል ክትትል ሪፖርት — ${report.periodLabel}`,
    {
      x: 0.8,
      y: 2.8,
      w: 8.4,
      h: 0.6,
      fontSize: 18,
      color: 'FBBF24',
      align: 'center',
    }
  );
  slide1.addText(`አካባቢ: ${report.jurisdictionLabel}   |   ቀን: ${report.generatedAtLabel}`, {
    x: 0.8,
    y: 3.6,
    w: 8.4,
    h: 0.5,
    fontSize: 13,
    color: 'CBD5E1',
    align: 'center',
  });

  const slide2 = pptx.addSlide();
  slide2.addText('1. የስታቲስቲክስ ማጠቃለያ', {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: '0F172A',
  });
  const kpiRows = [
    [
      { text: 'መለኪያ', options: { bold: true, fill: { color: '0F172A' }, color: 'FFFFFF' } },
      { text: 'ብዛት', options: { bold: true, fill: { color: '0F172A' }, color: 'FFFFFF' } },
    ],
    [{ text: 'ጠቅላላ የተመዘገቡ አከራዮች' }, { text: String(report.summary.totalLandlords) }],
    [{ text: 'ጠቅላላ የተመዘገቡ ተከራዮች' }, { text: String(report.summary.totalTenants) }],
    [{ text: 'በአሁኑ ወቅት የሚኖሩ ተከራዮች' }, { text: String(report.summary.activeTenants) }],
    [{ text: 'የፖሊስ አባል ተከራዮች (ዲጅታል መታወቂያ)' }, { text: String(report.summary.policeTenants) }],
    [{ text: 'ጠቅላላ የሚከራዩ ቤቶች/ክፍሎች' }, { text: String(report.summary.totalRooms) }],
    [{ text: 'የወንጀልና የተጠርጣሪ ሪከርዶች' }, { text: String(report.summary.criminalRecordsCount ?? 0) }],
  ];
  slide2.addTable(kpiRows, { x: 0.6, y: 1.1, w: 8.8, fontSize: 13, border: { pt: 1, color: 'CBD5E1' } });

  const slide3 = pptx.addSlide();
  slide3.addText('2. በከተማ፣ ወረዳ እና ቀበሌ ስርጭት', {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: '0F172A',
  });
  const areaTableRows = [
    [
      { text: 'ከተማ', options: { bold: true, fill: { color: '1E293B' }, color: 'FFFFFF' } },
      { text: 'ወረዳ', options: { bold: true, fill: { color: '1E293B' }, color: 'FFFFFF' } },
      { text: 'ቀበሌ', options: { bold: true, fill: { color: '1E293B' }, color: 'FFFFFF' } },
      { text: 'አከራዮች', options: { bold: true, fill: { color: '1E293B' }, color: 'FFFFFF' } },
      { text: 'ተከራዮች', options: { bold: true, fill: { color: '1E293B' }, color: 'FFFFFF' } },
      { text: 'ፖሊስ ተከራይ', options: { bold: true, fill: { color: '1E293B' }, color: 'FFFFFF' } },
    ],
    ...report.breakdownByArea.slice(0, 12).map((a) => [
      { text: a.city },
      { text: a.woreda },
      { text: a.kebele },
      { text: String(a.landlords) },
      { text: String(a.tenants) },
      { text: String(a.policeTenants) },
    ]),
  ];
  slide3.addTable(areaTableRows, { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, border: { pt: 1, color: 'CBD5E1' } });

  await pptx.writeFile({ fileName: `${filePrefix}_${new Date().toISOString().slice(0, 10)}.pptx` });
}

export async function exportElementToPdf(
  element: HTMLElement,
  filePrefix = 'Begu_Rent_Police_Report'
) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 8;
  const marginY = 10;
  const contentWidth = pageWidth - marginX * 2;
  const usablePageHeight = pageHeight - marginY * 2;

  const imgProps = pdf.getImageProperties(imgData);
  const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

  let heightLeft = imgHeight;
  let position = marginY;
  let pageCount = 1;

  pdf.addImage(imgData, 'PNG', marginX, position, contentWidth, imgHeight);
  heightLeft -= usablePageHeight;

  while (heightLeft > 0) {
    position = marginY - (imgHeight - heightLeft);
    pdf.addPage();
    pageCount += 1;
    pdf.addImage(imgData, 'PNG', marginX, position, contentWidth, imgHeight);
    heightLeft -= usablePageHeight;
  }

  for (let p = 1; p <= pageCount; p += 1) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Begu Rent  |  Page ${p} / ${pageCount}`, pageWidth - marginX, pageHeight - 4, {
      align: 'right',
    });
  }

  pdf.save(`${filePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
