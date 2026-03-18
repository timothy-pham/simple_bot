const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
};

const normalizeVietnamese = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  escapeMarkdown,
  normalizeVietnamese,
  escapeRegex,
};
