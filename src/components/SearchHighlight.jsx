function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function SearchHighlight({ value, query }) {
  const text = String(value ?? "-");
  const term = query.trim();

  if (!term) {
    return text;
  }

  return text.split(new RegExp(`(${escapeRegExp(term)})`, "ig")).map((part, index) => (
    part.toLowerCase() === term.toLowerCase()
      ? <mark className="search-highlight" key={`${part}-${index}`}>{part}</mark>
      : part
  ));
}