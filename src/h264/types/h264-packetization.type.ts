/**
 * RTP payload layouts supported by the inspector: one NAL (`single`),
 * length-prefixed NALs (`stap-a`), or one NAL fragment (`fu-a`).
 */
export type H264Packetization = 'single' | 'stap-a' | 'fu-a';
