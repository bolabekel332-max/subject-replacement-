import jsPDF from "jspdf";

export interface PDFExportData {
  simulation: string;
  analysis: {
    lighting: string;
    angle: string;
    environment: string;
  };
  subjectAttributes: string;
  masterPrompt: string;
  negativePrompt: string;
  poseMode: string;
  anatomyAuthority: string;
  images: {
    main?: string | null;
    target?: string | null;
    outfit?: string | null;
  };
}

export function exportPDFV6(data: PDFExportData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const reportId = `NB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const M = { top: 20, left: 15, right: 15, bottom: 20 };
  const PAGE_W = 210;
  const PAGE_H = 297;
  const CONTENT_W = PAGE_W - M.left - M.right;

  let y = M.top;

  const LINE_H = 5;
  const GAP_SECTION = 12;
  const GAP_BLOCK = 8;

  const COLORS = {
    brand: [15, 23, 42],      // Slate 900
    accent: [79, 70, 229],    // Indigo 600
    muted: [100, 116, 139],   // Slate 500
    bg: [248, 250, 252],      // Slate 50
    border: [226, 232, 240]   // Slate 200
  };

  function safeText(text: string) {
    return (text || "").replace(/[^\x00-\x7F]/g, "");
  }

  function drawImageSafe(img: string, x: number, y: number, maxW: number, maxH: number) {
    try {
      const props = doc.getImageProperties(img);
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * ratio;
      const h = props.height * ratio;
      const offsetX = x + (maxW - w) / 2;
      const offsetY = y + (maxH - h) / 2;
      const format = (props.fileType || "JPEG").toUpperCase();
      doc.addImage(img, format, offsetX, offsetY, w, h);
    } catch (e) {
      console.error("Image draw failed", e);
    }
  }

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - M.bottom) {
      doc.addPage();
      y = M.top;
      return true;
    }
    return false;
  }

  function drawHeader() {
    doc.setFillColor(COLORS.brand[0], COLORS.brand[1], COLORS.brand[2]);
    doc.rect(0, 0, PAGE_W, 40, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("SUBJECT REPLACEMENT", M.left, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("PROMPT GENERATOR REPORT V5.0.0 (GOLD MASTER)", M.left, 28);
    
    doc.setFillColor(34, 197, 94); // Green 500
    doc.rect(PAGE_W - M.right - 40, 15, 40, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text("SYSTEM STATUS: LOCKED", PAGE_W - M.right - 20, 19, { align: "center" });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(`DATE: ${new Date().toLocaleString()}`, PAGE_W - M.right, 28, { align: "right" });
    
    y = 55;
  }

  function sectionTitle(text: string) {
    // Ensure enough space for title AND at least a small part of the content
    ensureSpace(35); 
    doc.setFillColor(COLORS.brand[0], COLORS.brand[1], COLORS.brand[2]);
    doc.rect(M.left, y - 5, 2, 8, "F");
    
    doc.setTextColor(COLORS.brand[0], COLORS.brand[1], COLORS.brand[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(safeText(text).toUpperCase(), M.left + 5, y + 1);
    y += 10;
  }

  function textBlock(text: string) {
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    
    lines.forEach(line => {
      ensureSpace(LINE_H);
      doc.text(safeText(line), M.left, y);
      y += LINE_H;
    });
    y += GAP_BLOCK;
  }

  function codeBlock(text: string, title?: string) {
    if (title) {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
      doc.text(title.toUpperCase(), M.left, y - 1);
    }
    
    const padding = 4;
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    const allLines = doc.splitTextToSize(safeText(text), CONTENT_W - (padding * 2)) as string[];
    let remainingLines = [...allLines];

    while (remainingLines.length > 0) {
      const availableH = (PAGE_H - M.bottom) - y;
      let fitCount = Math.floor((availableH - (padding * 2)) / 4);

      if (fitCount < 3) {
        doc.addPage();
        y = M.top;
        continue;
      }

      const chunk = remainingLines.slice(0, fitCount);
      remainingLines = remainingLines.slice(fitCount);
      const chunkH = (chunk.length * 4) + (padding * 2);

      doc.setFillColor(COLORS.bg[0], COLORS.bg[1], COLORS.bg[2]);
      doc.rect(M.left, y, CONTENT_W, chunkH, "F");
      doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
      doc.rect(M.left, y, CONTENT_W, chunkH, "S");

      doc.setTextColor(30, 41, 59);
      let lineY = y + padding + 2.5;
      chunk.forEach(line => {
        doc.text(line, M.left + padding, lineY);
        lineY += 4;
      });

      y += chunkH + 2;
    }
    y += GAP_BLOCK;
  }

  // --- RENDER ---
  drawHeader();

  // IMAGE SECTION (P1 Only)
  const GAP_IMG = 8;
  const COL_W = (CONTENT_W - GAP_IMG * 2) / 3;
  const IMG_H = 50;
  const labels = ["MAIN SCENE", "REFERENCE", "OUTFIT"];
  const imgs = [data.images.main, data.images.target, data.images.outfit];
  
  imgs.forEach((img, i) => {
    if (!img) return;
    const x = M.left + i * (COL_W + GAP_IMG);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    doc.text(labels[i], x, y - 2);
    drawImageSafe(img, x, y, COL_W, IMG_H);
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.rect(x, y, COL_W, IMG_H, "S");
  });
  y += IMG_H + GAP_SECTION;

  sectionTitle("Execution Strategy & Lock");
  y += 2;
  const info = [
    ["POSE CONTROL ENGINE:", data.poseMode],
    ["ANATOMY AUTHORITY:", data.anatomyAuthority],
    ["SUBJECT INTEGRITY:", "ACTIVE (SUBJECT PURGE ENABLED)"]
  ];
  info.forEach(([label, value], i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(label, M.left, y);
    doc.setFont("helvetica", "normal");
    if (i === 2) doc.setTextColor(34, 197, 94);
    doc.text(value, M.left + 50, y);
    y += LINE_H;
    doc.setTextColor(51, 65, 85);
  });
  y += GAP_BLOCK;

  sectionTitle("Visual Simulation");
  textBlock(data.simulation);

  sectionTitle("Scene Intelligence");
  const stats = [
    ["Lighting:", data.analysis.lighting],
    ["Camera Target:", data.analysis.angle],
    ["Environment:", data.analysis.environment],
    ["Anatomy Ref:", data.subjectAttributes]
  ];
  stats.forEach(([label, val]) => {
    ensureSpace(LINE_H + 2);
    doc.setFont("helvetica", "bold");
    doc.text(label, M.left, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(val, CONTENT_W - 35) as string[];
    wrapped.forEach((line, idx) => {
      if (idx > 0) ensureSpace(LINE_H);
      doc.text(line, M.left + 35, y);
      y += LINE_H;
    });
    y += 1;
  });

  sectionTitle("Master Execution Dossier");
  
  const rawMaster = data.masterPrompt || "";
  const pLines = rawMaster.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  if (pLines.length === 0) {
    textBlock("No execution dossier available for this generation.");
  } else {
    // If it's just a single block without headers, render it all
    if (!rawMaster.includes("###") && !rawMaster.includes("**")) {
      codeBlock(rawMaster, "EXECUTION DATA");
    } else {
      let currentHeader = "PROMPT SPECIFICATIONS";
      let currentGroup: string[] = [];
      let renderedAnything = false;

      const flushGroup = () => {
        if (currentGroup.length > 0) {
          codeBlock(currentGroup.join("\n"), currentHeader);
          currentGroup = [];
          renderedAnything = true;
        }
      };

      pLines.forEach(line => {
        const headerMatch = line.match(/^###\s*(.+)/) || line.match(/^\*\*\s*(.+?)\*\*/);
        if (headerMatch) {
          flushGroup();
          currentHeader = headerMatch[1].replace(/[:—\-\*]/g, "").trim();
        } else {
          currentGroup.push(line);
        }
      });
      flushGroup();

      // Final fallback if group parsing failed to render anything meaningful
      if (!renderedAnything && pLines.length > 0) {
        codeBlock(rawMaster, "EXECUTION DATA (RAW)");
      }
    }
  }

  sectionTitle("Negative Constraint Lock");
  if (data.negativePrompt) {
    codeBlock(data.negativePrompt);
  } else {
    textBlock("Default safety filters active.");
  }

  // --- FINAL FOOTER PASS ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    doc.text(`REPORT ID: ${reportId} | Page ${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 10, { align: "center" });
  }

  doc.save(`NANO-REPORT-${reportId}.pdf`);
}
