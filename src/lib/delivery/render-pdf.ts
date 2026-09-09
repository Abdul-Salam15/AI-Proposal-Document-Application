// Section 2: "HTML rendered to PDF server-side." Rather than a separate
// template, this renders the actual live hosted page (/p/[id]) via headless
// Chrome — the PDF and the hosted link are always the same document.
//
// @sparticuz/chromium ships a Linux-only binary (built for Vercel/Lambda),
// so it can't run locally on Windows/macOS dev machines. In development,
// fall back to the full `puppeteer` package (devDependency, bundles its own
// browser) so this is actually testable locally; production uses the
// serverless-friendly puppeteer-core + @sparticuz/chromium pair.
export async function renderProposalPdf(url: string): Promise<Buffer> {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    const { default: puppeteer } = await import("puppeteer");
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: "a4", printBackground: true });
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
    const pdf = await page.pdf({ format: "a4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
