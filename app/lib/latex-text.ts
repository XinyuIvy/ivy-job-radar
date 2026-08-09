export function latexToPlainText(value: string) {
  return value
    .replace(/%.*$/gm, " ")
    // Keep spaces around extracted text so adjacent LaTeX commands cannot absorb it.
    .replace(/\\(?:href|url)\{[^{}]*\}\{([^{}]*)\}/g, " $1 ")
    .replace(/\\(?:section|subsection|subsubsection|textbf|textit|emph|small|footnotesize)\*?\{([^{}]*)\}/g, " $1 ")
    .replace(/\\&/g, "&")
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/[{}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
