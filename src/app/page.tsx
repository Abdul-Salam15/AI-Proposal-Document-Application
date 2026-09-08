const SWATCHES = [
  { name: "Ink", className: "bg-ink", hex: "#1B2430" },
  { name: "Paper", className: "bg-paper", hex: "#EFEBE1" },
  { name: "Brass", className: "bg-brass", hex: "#A67C3A" },
  { name: "Oxblood", className: "bg-oxblood", hex: "#7A2E2E" },
  { name: "Slate", className: "bg-slate", hex: "#5B7B96" },
  { name: "Rule", className: "bg-rule", hex: "#D6D0C0" },
  { name: "Draft", className: "bg-draft", hex: "#8B8879" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center gap-12 bg-paper px-8 py-16 font-sans text-ink">
      <div className="flex max-w-2xl flex-col gap-2 text-center">
        <p className="text-sm font-medium text-slate">Scaffold check</p>
        <h1 className="text-2xl font-medium">Design tokens &amp; fonts</h1>
        <p className="text-sm text-ink/70">
          Placeholder page confirming the Ledger palette and typefaces are
          wired up. No application pages yet.
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {SWATCHES.map((swatch) => (
          <div key={swatch.name} className="flex flex-col gap-2">
            <div
              className={`h-16 w-full rounded-none border border-rule ${swatch.className}`}
            />
            <div className="text-sm">
              <p className="font-medium">{swatch.name}</p>
              <p className="text-ink/60">{swatch.hex}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-6 border-t border-rule pt-8">
        <div>
          <p className="mb-2 text-sm font-medium text-slate">
            Dashboard chrome — Public Sans (400 / 500)
          </p>
          <p className="font-sans text-lg font-normal">
            The quick brown fox jumps over the lazy dog. 0123456789
          </p>
          <p className="font-sans text-lg font-medium">
            The quick brown fox jumps over the lazy dog. 0123456789
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate">
            Proposal document — Source Serif 4 (400 / 500)
          </p>
          <p className="font-serif text-lg font-normal">
            The quick brown fox jumps over the lazy dog. 0123456789
          </p>
          <p className="font-serif text-lg font-medium">
            The quick brown fox jumps over the lazy dog. 0123456789
          </p>
        </div>
      </div>
    </div>
  );
}
