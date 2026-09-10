// Section 2: "HTML rendered to PDF server-side." Rather than a separate
// template, this renders the actual live hosted page (/p/[id]) via headless
// Chrome — the PDF and the hosted link are always the same document.
//
// @sparticuz/chromium ships a Linux-only binary (built for Vercel/Lambda),
// so it can't run locally on Windows/macOS dev machines. In development,
// fall back to the full `puppeteer` package (devDependency, bundles its own
// browser) so this is actually testable locally; production uses the
// serverless-friendly puppeteer-core + @sparticuz/chromium pair.
//
// Margin/header/footer are set here rather than via CSS @page: Chromium's
// print-to-PDF only honors @page size/margin when preferCSSPageSize is on,
// and page numbers have no CSS equivalent at all — Puppeteer's
// header/footer templates are the only way to get them. The running
// company-name header also needs to repeat identically on every page
// (including the cover), which is exactly what these templates do and an
// in-page `position: fixed` element does not for a single continuously
// laid-out document being paginated into a PDF.
const PDF_MARGIN = { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function headerTemplate(companyName: string): string {
  return `
    <div style="width: 100%; padding: 0 16mm; font-family: Georgia, 'Times New Roman', serif; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: #8b8879; text-align: center;">
      ${escapeHtml(companyName)}
    </div>
  `;
}

const PDF_FOOTER_TEMPLATE = `
  <div style="width: 100%; font-family: Georgia, 'Times New Roman', serif; font-size: 9px; color: #8b8879; text-align: center;">
    — <span class="pageNumber"></span> —
  </div>
`;

export async function renderProposalPdf(url: string, companyName: string): Promise<Buffer> {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    const { default: puppeteer } = await import("puppeteer");
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "a4",
        printBackground: true,
        margin: PDF_MARGIN,
        displayHeaderFooter: true,
        headerTemplate: headerTemplate(companyName),
        footerTemplate: PDF_FOOTER_TEMPLATE,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  const { default: chromium } = await import("@sparticuz/chromium");
  const { default: puppeteerCore } = await import("puppeteer-core");

  const browser = await puppeteerCore.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: PDF_MARGIN,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(companyName),
      footerTemplate: PDF_FOOTER_TEMPLATE,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
