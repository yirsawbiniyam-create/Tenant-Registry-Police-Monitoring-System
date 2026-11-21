import * as XLSX from 'xlsx';
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
import { formatDateAm } from './crypto';

export interface ReportPayload {
  commissionName: string;
  periodLabel: string;
  jurisdictionLabel: string;
  generatedAtLabel: string;
  logoUrl?: string;
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

export function exportToExcel(report: ReportPayload, filePrefix = 'BG_Police_Report') {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { መለኪያ: 'ተቋም', ዋጋ: report.commissionName },
    { መለኪያ: 'የሪፖርት ጊዜ', ዋጋ: report.periodLabel },
    { መለኪያ: 'አካባቢ / አድራሻ', ዋጋ: report.jurisdictionLabel },
    { መለኪያ: 'የተዘጋጀበት ቀን', ዋጋ: report.generatedAtLabel },
    { መለኪያ: 'ጠቅላላ አከራዮች', ዋጋ: report.summary.totalLandlords },
    { መለኪያ: 'ጠቅላላ ተከራዮች', ዋጋ: report.summary.totalTenants },
    { መለኪያ: 'በአሁኑ ወቅት የሚኖሩ ተከራዮች', ዋጋ: report.summary.activeTenants },
    { መለኪያ: 'የፖሊስ አባል ተከራዮች', ዋጋ: report.summary.policeTenants },
    { መለኪያ: 'ጠቅላላ የሚከራዩ ክፍሎች', ዋጋ: report.summary.totalRooms },
  ];
  if (typeof report.summary.criminalRecordsCount === 'number') {
    summaryRows.push({ መለኪያ: 'የወንጀል ሪከርዶች', ዋጋ: report.summary.criminalRecordsCount });
  }
  if (typeof report.summary.repeatOffendersCount === 'number') {
    summaryRows.push({ መለኪያ: 'ደጋጋሚ ወንጀለኞች', ዋጋ: report.summary.repeatOffendersCount });
  }
  if (typeof report.summary.arrestedTodayCount === 'number') {
    summaryRows.push({ መለኪያ: 'ዛሬ የታሰሩ', ዋጋ: report.summary.arrestedTodayCount });
  }
  if (typeof report.summary.totalArrestedCount === 'number') {
    summaryRows.push({ መለኪያ: 'ጠቅላላ የታሰሩ', ዋጋ: report.summary.totalArrestedCount });
  }
  if (typeof report.summary.suspectsCount === 'number') {
    summaryRows.push({ መለኪያ: 'ተጠርጣሪዎች', ዋጋ: report.summary.suspectsCount });
  }
  if (typeof report.summary.wantedAlertsCount === 'number') {
    summaryRows.push({ መለኪያ: 'የተፈላጊ ማንቂያዎች', ዋጋ: report.summary.wantedAlertsCount });
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ማጠቃለያ');

  const areaRows = report.breakdownByArea.map((a) => ({
    ከተማ: a.city,
    ወረዳ: a.woreda,
    ቀበሌ: a.kebele,
    አከራዮች: a.landlords,
    ተከራዮች: a.tenants,
    'የፖሊስ ተከራዮች': a.policeTenants,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(areaRows), 'በአድራሻ_ዝርዝር');

  const tenantRows = report.tenants.map((t) => ({
    'ሙሉ ስም': t.fullName,
    'ስልክ ቁጥር': t.phone,
    'የጋብቻ ሁኔታ': t.maritalStatus === 'married' ? 'ባለትዳር' : 'ያላገባ',
    'አኗኗር': t.livingArrangement === 'alone' ? 'ብቻውን' : `ከ${t.coResidents.length} ሰው ጋር (${t.coResidents.join(', ')})`,
    'ስራ': t.occupation,
    'ፖሊስ ተከራይ': t.isPoliceTenant ? 'አዎ (የፖሊስ ዲጅታል መታወቂያ)' : 'አይደለም',
    'የመታወቂያ ዓይነት': t.idType === 'police_digital' ? 'የፖሊስ ዲጅታል' : 'ፋይዳ',
    'መታወቂያ ቁጥር': t.idNumber,
    'አከራይ ስም': t.landlordName,
    'አከራይ ስልክ': t.landlordPhone,
    ከተማ: t.city,
    ወረዳ: t.woreda,
    ቀበሌ: t.kebele,
    'የቤት ቁጥር': t.houseNumber,
    'የገባበት ቀን': t.moveInDate,
    ሁኔታ: t.status === 'active' ? 'በመኖር ላይ' : 'ለቋል',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tenantRows), 'ተከራዮች');

  const landlordRows = report.landlords.map((l) => ({
    'ሙሉ ስም': l.fullName,
    'ስልክ ቁጥር': l.phone,
    'የፋይዳ ቁጥር': l.faydaId,
    ከተማ: l.city,
    ወረዳ: l.woreda,
    ቀበሌ: l.kebele,
    'የቤት ቁጥር': l.houseNumber,
    'የክፍል ብዛት': l.roomCount,
    ሁኔታ: l.status === 'active' ? 'ንቁ' : l.status === 'replaced' ? 'ተቀይሯል' : 'ታግዷል',
    'የተመዘገበበት ቀን': formatDateAm(l.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(landlordRows), 'አከራዮች');

  if (report.criminalRecords && report.criminalRecords.length > 0) {
    const crimeRows = report.criminalRecords.map((c) => ({
      'የግለሰብ ስም': c.personName,
      ስልክ: c.phone || '-',
      'ፋይዳ ቁጥር': c.faydaId || '-',
      ሁኔታ: c.recordType,
      ጥፋት: c.offenseTitle,
      ዝርዝር: c.description,
      ጣቢያ: c.stationName,
      ከተማ: c.city,
      ወረዳ: c.woreda,
      ቀበሌ: c.kebele,
      ቀን: c.incidentDate,
      'የመዘገበው ኦፊሰር': c.recordedByName,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(crimeRows), 'የወንጀል_ሪከርድ');
  }

  XLSX.writeFile(wb, `${filePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function makeDocCell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || '-', bold, size: 20 })],
      }),
    ],
  });
}

export async function exportToWord(report: ReportPayload, filePrefix = 'BG_Police_Report') {
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [makeDocCell('የመለኪያ አይነት', true), makeDocCell('ብዛት / መረጃ', true)],
      }),
      new TableRow({ children: [makeDocCell('ጠቅላላ የተመዘገቡ አከራዮች'), makeDocCell(String(report.summary.totalLandlords))] }),
      new TableRow({ children: [makeDocCell('ጠቅላላ የተመዘገቡ ተከራዮች'), makeDocCell(String(report.summary.totalTenants))] }),
      new TableRow({ children: [makeDocCell('በአሁኑ ጊዜ በመኖር ላይ ያሉ ተከራዮች'), makeDocCell(String(report.summary.activeTenants))] }),
      new TableRow({ children: [makeDocCell('የፖሊስ አባል ተከራዮች (ዲጅታል መታወቂያ)'), makeDocCell(String(report.summary.policeTenants))] }),
      new TableRow({ children: [makeDocCell('ጠቅላላ የሚከራዩ ቤቶች/ክፍሎች'), makeDocCell(String(report.summary.totalRooms))] }),
      ...(typeof report.summary.repeatOffendersCount === 'number'
        ? [new TableRow({ children: [makeDocCell('ደጋጋሚ ወንጀለኞች ብዛት'), makeDocCell(String(report.summary.repeatOffendersCount))] })]
        : []),
      ...(typeof report.summary.totalArrestedCount === 'number'
        ? [new TableRow({ children: [makeDocCell('ጠቅላላ የታሰሩ ሰዎች (ዛሬ / ጠቅላላ)'), makeDocCell(`${report.summary.arrestedTodayCount ?? 0} / ${report.summary.totalArrestedCount}`)] })]
        : []),
    ],
  });

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

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: report.commissionName, bold: true, size: 32 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `የአከራይ ተከራይ ክትትልና ስታቲስቲክስ ሪፖርት (${report.periodLabel})`,
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
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '1. ዋና ማጠቃለያ', bold: true })] }),
          summaryTable,
          new Paragraph({ text: '' }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '2. በከተማ፣ ወረዳ እና ቀበሌ ስርጭት', bold: true })] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: areaRows }),
          new Paragraph({ text: '' }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '3. የተከራዮች ዝርዝር መረጃ', bold: true })] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tenantRows }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${filePrefix}_${new Date().toISOString().slice(0, 10)}.docx`);
}

export async function exportToPowerPoint(report: ReportPayload, filePrefix = 'BG_Police_Report') {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  // Slide 1: Cover
  const slide1 = pptx.addSlide();
  slide1.background = { color: '0F172A' };
  if (report.logoUrl && report.logoUrl.startsWith('data:image/')) {
    slide1.addImage({ data: report.logoUrl, x: 4.35, y: 0.5, w: 1.3, h: 1.3 });
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
  slide1.addText(`የአከራይ ተከራይ ክትትል ሪፖርት — ${report.periodLabel}`, {
    x: 0.8,
    y: 2.8,
    w: 8.4,
    h: 0.6,
    fontSize: 18,
    color: 'FBBF24',
    align: 'center',
  });
  slide1.addText(`አካባቢ: ${report.jurisdictionLabel}   |   ቀን: ${report.generatedAtLabel}`, {
    x: 0.8,
    y: 3.6,
    w: 8.4,
    h: 0.5,
    fontSize: 13,
    color: 'CBD5E1',
    align: 'center',
  });

  // Slide 2: Executive KPIs
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
  ];
  slide2.addTable(kpiRows, { x: 0.6, y: 1.1, w: 8.8, fontSize: 13, border: { pt: 1, color: 'CBD5E1' } });

  // Slide 3: Area Breakdown
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

export async function exportElementToPdf(element: HTMLElement, filePrefix = 'BG_Police_Report') {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgProps = pdf.getImageProperties(imgData);
  const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
  heightLeft -= pdfHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
  }

  pdf.save(`${filePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
