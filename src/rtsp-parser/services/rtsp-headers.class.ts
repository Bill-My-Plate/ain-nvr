/** RTSP field names are case-insensitive. Store lowercase names for stable iteration. */
export class RtspHeaders extends Map<string, string> {
  public override get(name: string): string | undefined {
    return super.get(name.toLowerCase());
  }

  public override set(name: string, value: string): this {
    return super.set(name.toLowerCase(), value);
  }

  public override has(name: string): boolean {
    return super.has(name.toLowerCase());
  }

  public override delete(name: string): boolean {
    return super.delete(name.toLowerCase());
  }
}
