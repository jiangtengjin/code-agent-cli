export function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const diff: string[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      diff.push(`  ${oldLine}`);
    } else {
      if (oldLine !== undefined) {
        diff.push(`- ${oldLine}`);
      }
      if (newLine !== undefined) {
        diff.push(`+ ${newLine}`);
      }
    }
  }

  return diff.join("\n");
}
