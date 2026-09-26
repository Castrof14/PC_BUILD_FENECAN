interface StickerProps {
  children: string;
  variant: 'burst' | 'bay';
}

export function Sticker({ children, variant }: StickerProps) {
  return <span className={`sticker sticker-${variant}`}>{children}</span>;
}
