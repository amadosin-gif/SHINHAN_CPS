import { load } from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dirname, '../mockups/shopping-benefit-popup.html');

/**
 * HTML 파일 수정
 * @param {'css'|'text'|'attr'} type
 * @param {string} selector  - CSS 셀렉터 (예: '.guide-banner', '#mainTitle')
 * @param {string} property  - CSS 속성명 또는 attr 이름 (type=text 일 때는 불필요)
 * @param {string} value     - 변경할 값
 */
export function updateHtml({ type, selector, property, value }) {
  const html = readFileSync(HTML_PATH, 'utf-8');
  const $ = load(html, { decodeEntities: false });

  if (type === 'text') {
    $(selector).first().text(value);
  } else if (type === 'css') {
    const el = $(selector).first();
    let style = el.attr('style') ?? '';
    const re = new RegExp(`${property}\\s*:[^;]+;?`, 'i');
    if (re.test(style)) {
      style = style.replace(re, `${property}: ${value};`);
    } else {
      style += ` ${property}: ${value};`;
    }
    el.attr('style', style.trim());
  } else if (type === 'attr') {
    $(selector).first().attr(property, value);
  } else {
    throw new Error(`알 수 없는 type: ${type}`);
  }

  writeFileSync(HTML_PATH, $.html(), 'utf-8');
  return { success: true };
}
