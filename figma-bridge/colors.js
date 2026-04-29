const COLOR_MAP = {
  '빨간색': '#E30613', '빨강': '#E30613', 'red': '#E30613',
  '파란색': '#1B4FBF', '파랑': '#1B4FBF', 'blue': '#1B4FBF',
  '네이비': '#001C5C', '남색': '#001C5C', 'navy': '#001C5C',
  '초록색': '#03C75A', '초록': '#03C75A', 'green': '#03C75A',
  '흰색': '#FFFFFF', '화이트': '#FFFFFF', 'white': '#FFFFFF',
  '검정색': '#111827', '검정': '#111827', 'black': '#111827',
  '회색': '#6B7280', 'gray': '#6B7280', 'grey': '#6B7280',
  '주황색': '#FF6000', '주황': '#FF6000', 'orange': '#FF6000',
  '신한레드': '#E30613', '신한네이비': '#001C5C', '신한블루': '#1B4FBF',
};

/** HEX 또는 자연어 색상을 { r, g, b } (0~1 범위)로 변환 */
export function parseColor(input) {
  const lower = input.toLowerCase().trim();
  const hex = COLOR_MAP[lower] ?? (lower.startsWith('#') ? lower : null);
  if (!hex) throw new Error(`알 수 없는 색상: "${input}"`);

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}
