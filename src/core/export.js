(() => {
  const { canonicalColumns } = window.MFCleanerCSV;

  function sortOutputRows(rows) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount || a.sourceIndex - b.sourceIndex);
  }

  function toDelimited(rows, delimiter) {
    const lines = [canonicalColumns.join(delimiter)];
    rows.forEach((row) => {
      lines.push(canonicalColumns.map((k) => {
        let v = row[k];
        if (typeof v === "boolean") v = v ? "true" : "false";
        if (typeof v === "number") v = String(v);
        v = String(v ?? "");
        if (v.includes("\"")) v = v.replace(/"/g, "\"\"");
        if (delimiter === "," && /[",\n]/.test(v)) v = `"${v}"`;
        if (delimiter === "\t") v = v.replace(/\t/g, " ").replace(/\r?\n/g, " ");
        return v;
      }).join(delimiter));
    });
    return lines.join("\n");
  }

  function xmlEsc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function toExcelXml(rows) {
    const headerCells = canonicalColumns.map((c) => `<Cell><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`).join("");
    const dataRows = rows.map((row) => {
      const cells = canonicalColumns.map((k) => {
        const v = row[k];
        if (typeof v === "number") return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
        if (typeof v === "boolean") return `<Cell><Data ss:Type="String">${v ? "true" : "false"}</Data></Cell>`;
        return `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
      }).join("");
      return `<Row>${cells}</Row>`;
    }).join("");

    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
      + "<?mso-application progid=\"Excel.Sheet\"?>\n"
      + "<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\" "
      + "xmlns:o=\"urn:schemas-microsoft-com:office:office\" "
      + "xmlns:x=\"urn:schemas-microsoft-com:office:excel\" "
      + "xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">\n"
      + "<Worksheet ss:Name=\"mf-cleaned\">\n"
      + `<Table>\n<Row>${headerCells}</Row>\n${dataRows}\n</Table>\n`
      + "</Worksheet>\n</Workbook>";
  }

  function buildDownloadPayload(rows, format) {
    if (format === "csv_utf8") return { text: toDelimited(rows, ","), mime: "text/csv;charset=utf-8;", ext: "csv" };
    if (format === "tsv_utf8_bom") return { text: "\uFEFF" + toDelimited(rows, "\t"), mime: "text/tab-separated-values;charset=utf-8;", ext: "tsv" };
    if (format === "excel_xml") return { text: toExcelXml(rows), mime: "application/vnd.ms-excel;charset=utf-8;", ext: "xml" };
    return { text: "\uFEFF" + toDelimited(rows, ","), mime: "text/csv;charset=utf-8;", ext: "csv" };
  }

  window.MFCleanerExport = { sortOutputRows, toDelimited, buildDownloadPayload };
})();
