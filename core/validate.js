// core/validate.js  (간단 버전)
export const isValidPhone = (v) => /^010\d{8}$/.test(String(v));
export const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

export function assertCreateMember(body) {
  const { name, phone } = body ?? {};
  if (!name || !phone) throw Object.assign(new Error('이름/연락처는 필수'), { status: 400 });
  if (!isValidPhone(phone)) throw Object.assign(new Error('휴대폰 번호 형식 오류'), { status: 400 });
}
