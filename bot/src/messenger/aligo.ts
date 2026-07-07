/**
 * 알리고 알림톡·친구톡·SMS 발송 래퍼
 * https://smartsms.aligo.in/admin/api/spec.html
 *
 * 환경변수:
 *   ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER (발신번호), ALIGO_PROFILE_KEY (알림톡 프로필)
 */

const ALIGO_ENDPOINT = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

export interface AlimtalkPayload {
  templateCode: string;
  receiver: string; // 010-1234-5678
  message: string; // 승인된 템플릿과 매칭되는 실제 문구
  buttons?: {
    name: string;
    linkType: 'WL' | 'AL' | 'DS' | 'BK' | 'MD'; // WL=웹 링크, AL=앱 링크 등
    linkTypeName?: string;
    linkMo?: string;
    linkPc?: string;
    linkAnd?: string;
    linkIos?: string;
  }[];
}

export async function sendAlimtalk(p: AlimtalkPayload): Promise<{
  ok: boolean;
  code?: number;
  message?: string;
  raw?: unknown;
}> {
  const apikey = process.env.ALIGO_API_KEY;
  const userid = process.env.ALIGO_USER_ID;
  const senderkey = process.env.ALIGO_PROFILE_KEY;
  const sender = process.env.ALIGO_SENDER;

  if (!apikey || !userid || !senderkey || !sender) {
    throw new Error(
      '알리고 환경변수 미설정: ALIGO_API_KEY / ALIGO_USER_ID / ALIGO_PROFILE_KEY / ALIGO_SENDER',
    );
  }

  const form = new URLSearchParams({
    apikey,
    userid,
    senderkey,
    tpl_code: p.templateCode,
    sender,
    receiver_1: p.receiver.replace(/-/g, ''),
    subject_1: '알림', // 알림톡 실패 시 SMS 대체 시 사용
    message_1: p.message,
  });

  if (p.buttons?.length) {
    form.set('button_1', JSON.stringify({ button: p.buttons }));
  }

  const res = await fetch(ALIGO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await res.json();
  return {
    ok: data.code === 0,
    code: data.code,
    message: data.message,
    raw: data,
  };
}
