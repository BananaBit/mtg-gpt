const SECTION_NAMES = new Map([
  ["commander", "commander"], ["commanders", "commander"],
  ["mainboard", "mainboard"], ["deck", "mainboard"],
  ["sideboard", "sideboard"], ["maybeboard", "maybeboard"],
  ["companion", "companion"]
]);

export function parseDecklist(decklist) {
  const sections = { commander: [], mainboard: [], sideboard: [], maybeboard: [], companion: [] };
  const unparsed_lines = [];
  if (typeof decklist !== "string") return { sections, unparsed_lines };

  let section = "mainboard";
  for (const [index, original] of decklist.split(/\r?\n/).entries()) {
    let line = original.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const header = line.replace(/:$/, "").trim().toLowerCase();
    if (SECTION_NAMES.has(header)) {
      section = SECTION_NAMES.get(header);
      continue;
    }
    if (/^SB:\s*/i.test(line)) {
      section = "sideboard";
      line = line.replace(/^SB:\s*/i, "");
    }
    const match = line.match(/^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)(?:\s+(\S+))?)?\s*$/i);
    if (!match || Number(match[1]) < 1) {
      unparsed_lines.push({ line_number: index + 1, text: original });
      continue;
    }
    const entry = {
      quantity: Number(match[1]), name: match[2].trim(),
      set_code: match[3]?.toLowerCase() || null,
      collector_number: match[4] || null,
      section, line_number: index + 1
    };
    sections[section].push(entry);
  }
  return { sections, unparsed_lines };
}

export function flattenDeck(parsed, { includeSideboard = false } = {}) {
  const names = includeSideboard
    ? Object.keys(parsed.sections)
    : ["commander", "mainboard", "companion"];
  return names.flatMap((name) => parsed.sections[name] || []);
}
