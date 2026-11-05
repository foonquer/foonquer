import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';

// 네이버 CLOVA OCR 영수증 특화 모델. 응답 중 인증에 필요한 값만 꺼낸다.
// https://api.ncloud-docs.com/docs/ai-application-service-ocr-ocrdocumentocr-receipt

export interface ReceiptItem {
  menuName: string;
  quantity: number;
  price: number | null;
}

export interface ParsedReceipt {
  storeName: string | null;
  businessNo: string | null;
  /** 결제 일시 (KST로 읽은 값을 UTC 순간으로) */
  paidAt: Date | null;
  totalAmount: number | null;
  approvalNo: string | null;
  items: ReceiptItem[];
  /** ocr_raw에 저장할 부분 (영수증 결과만) */
  raw: unknown;
}

type Field = { text?: string; formatted?: Record<string, string | undefined> } | undefined;

/** CLOVA 영수증 응답 중 읽는 부분 */
interface ClovaReceiptResult {
  storeInfo?: { name?: Field; bizNum?: Field };
  paymentInfo?: { date?: Field; time?: Field; confirmNum?: Field };
  totalPrice?: { price?: Field };
  subResults?: { items?: { name?: Field; count?: Field; price?: { price?: Field } }[] }[];
}
interface ClovaBody {
  images?: { receipt?: { result?: ClovaReceiptResult } }[];
}

const text = (f: Field) => f?.formatted?.value ?? f?.text ?? null;
const digits = (v: string | null) => (v ? v.replace(/\D/g, '') : null);
const toInt = (v: string | null) => {
  const n = digits(v);
  return n ? Number(n) : null;
};

/** CLOVA 영수증 응답(JSON) → 인증에 쓰는 값 */
export function parseClovaReceipt(body: unknown): ParsedReceipt | null {
  const result = (body as ClovaBody | null)?.images?.[0]?.receipt?.result;
  if (!result) return null;
  const store = result.storeInfo ?? {};
  const payment = result.paymentInfo ?? {};
  const date = payment.date?.formatted;
  const time = payment.time?.formatted;
  let paidAt: Date | null = null;
  if (date?.year && date.month && date.day) {
    const y = Number(date.year.length === 2 ? `20${date.year}` : date.year);
    const [h, mi, s] = [
      Number(time?.hour ?? 12),
      Number(time?.minute ?? 0),
      Number(time?.second ?? 0),
    ];
    const utc = Date.UTC(y, Number(date.month) - 1, Number(date.day), h - 9, mi, s);
    paidAt = Number.isNaN(utc) ? null : new Date(utc);
  }
  const items: ReceiptItem[] = [];
  for (const sub of result.subResults ?? []) {
    for (const item of sub.items ?? []) {
      const name = text(item.name)?.trim();
      if (!name) continue;
      items.push({
        menuName: name.slice(0, 50),
        quantity: Math.max(1, Math.min(999, toInt(text(item.count)) ?? 1)),
        price: toInt(text(item.price?.price)),
      });
    }
  }
  const bizNum = digits(text(store.bizNum));
  return {
    storeName: text(store.name)?.trim() || null,
    businessNo: bizNum && bizNum.length === 10 ? bizNum : null,
    paidAt,
    totalAmount: toInt(text(result.totalPrice?.price)),
    approvalNo: digits(text(payment.confirmNum)) || null,
    items: items.slice(0, 50),
    raw: result,
  };
}

/**
 * 영수증 사진 URL을 CLOVA OCR로 읽는다. 설정이 없거나 실패하면 null (→ UNREADABLE).
 * 테스트에서는 이 함수를 mock한다.
 */
export async function readReceipt(imageUrl: string, format: string): Promise<ParsedReceipt | null> {
  if (!env.CLOVA_OCR_URL || !env.CLOVA_OCR_SECRET) return null;
  try {
    const res = await fetch(env.CLOVA_OCR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': env.CLOVA_OCR_SECRET },
      body: JSON.stringify({
        version: 'V2',
        requestId: randomUUID(),
        timestamp: Date.now(),
        images: [{ format, name: 'receipt', url: imageUrl }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(`CLOVA OCR 실패: ${res.status}`);
      return null;
    }
    return parseClovaReceipt(await res.json());
  } catch (err) {
    console.error('CLOVA OCR 호출 실패', err);
    return null;
  }
}
