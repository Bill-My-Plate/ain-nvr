/**
 * Appends an SDP attribute under its name without losing duplicate values.
 */
export function addAttribute(attributes: Map<string, string[]>, name: string, value: string): void {
  const values = attributes.get(name);
  if (values === undefined) {
    attributes.set(name, [value]);
  } else {
    values.push(value);
  }
}
