export function splitPersonName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function formatPersonName(firstName, lastName) {
  return [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ").trim();
}
