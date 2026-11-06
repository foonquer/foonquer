import { z } from 'zod';
import { env } from '../../config/env';

// 리뷰 글 AI 분석 (Gemini API, ERD review.ai_result). 협찬·리뷰 이벤트 문구와 AI가 쓴 듯한 말투를 찾는다.
// 결과는 운영자 확인용(ad_suspected → ADMIN-03 마패 확인 목록)이고 별점 계산에는 넣지 않는다.
// generateContent는 레거시지만 계속 지원된다(2026-11 문서). 구조화 출력(JSON 스키마)으로 받는다.
// https://ai.google.dev/gemini-api/docs/structured-output

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM = [
  '너는 맛집 리뷰 앱의 리뷰 검수 도우미다. 리뷰 글 하나를 읽고 두 가지를 판단한다.',
  '1) adSuspected: 협찬·광고·리뷰 이벤트로 쓴 글인지. 예) "서비스 받고 작성", "리뷰 이벤트 참여", "체험단", "원고료", "음료 무료 제공 조건", "업체로부터 제공받아". 맛있다·추천한다는 칭찬만으로는 true가 아니다.',
  '2) aiLikeTone: 사람이 직접 겪은 이야기가 아니라 AI가 만든 듯한 틀에 박힌 글인지 (항목 나열, 과장된 홍보 문구, 내용 없는 일반론).',
  'adEvidence에는 1)의 근거가 된 문장을 리뷰에서 그대로 짧게 옮긴다. 없으면 null.',
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    adSuspected: { type: 'BOOLEAN' },
    adEvidence: { type: 'STRING', nullable: true },
    aiLikeTone: { type: 'BOOLEAN' },
  },
  required: ['adSuspected', 'adEvidence', 'aiLikeTone'],
};

const answerSchema = z.object({
  adSuspected: z.boolean(),
  // 근거 문장이 길어도 버리지 않고 잘라서 둔다 (버리면 협찬 글이 운영자 확인 목록에서 빠진다)
  adEvidence: z
    .string()
    .nullable()
    .transform((v) => v?.slice(0, 300) ?? null),
  aiLikeTone: z.boolean(),
});

/** ai_result에 저장하는 값 (글 길이·사진 수는 우리가 센다) */
export type ReviewAiResult = z.infer<typeof answerSchema> & {
  model: string;
  length: number;
  imageCount: number;
};

/**
 * 분석 결과. RATE_LIMITED면 호출 한도에 걸린 것(이번 작업은 멈춘다),
 * UNREADABLE이면 200인데 답을 읽을 수 없는 것(안전 필터로 답이 비었거나 스키마와 다름 — 다시 해도 같아서 대기열에서 뺀다),
 * CONFIG_ERROR면 키·모델 설정이 틀린 것(작업을 멈추고 실패로 알린다),
 * null이면 일시적 실패(5xx·시간 초과·네트워크 — 다음 실행에서 다시)
 */
export type ReviewAiOutcome =
  ReviewAiResult | 'RATE_LIMITED' | 'UNREADABLE' | 'CONFIG_ERROR' | null;

/** 리뷰와 상관없이 키·모델 설정이 틀린 응답 (모든 리뷰가 같은 이유로 실패하므로 작업을 멈춘다) */
async function isConfigError(res: Response) {
  // 401·403: 키가 틀렸거나 막힘(API 꺼짐·제한), 404: GEMINI_MODEL 이름이 없음
  if (res.status === 401 || res.status === 403 || res.status === 404) return true;
  // 400 중에서는 키가 틀린 경우만 (INVALID_ARGUMENT는 글 내용 때문에도 날 수 있다)
  return res.status === 400 && (await res.text().catch(() => '')).includes('API_KEY_INVALID');
}

type GenerateResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

const parseJson = (text: string | undefined): unknown => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

/** 키가 없으면 분석하지 않는다 (score_weight·ad_suspected는 그대로) */
export const reviewAiEnabled = () => Boolean(env.GEMINI_API_KEY);

/** 리뷰 글 하나를 분석한다. 테스트에서는 fetch를 바꿔 끼운다 */
export async function analyzeReview(input: {
  content: string;
  imageCount: number;
}): Promise<ReviewAiOutcome> {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL;
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: `사진 ${input.imageCount}장\n리뷰:\n${input.content}` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          // temperature·top_p·top_k는 3.5 Flash-Lite부터 쓰지 않는 값이라 넣지 않는다 (다음 세대는 400)
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) return 'RATE_LIMITED';
    if (!res.ok) {
      console.error(`Gemini 리뷰 분석 실패: ${res.status}`);
      return (await isConfigError(res)) ? 'CONFIG_ERROR' : null;
    }
    // 본문을 읽다 끊기면(네트워크) 아래 catch로 가서 다시 하고, 읽었는데 JSON이 아니면 UNREADABLE
    const body = parseJson(await res.text()) as GenerateResponse | null;
    const answer = answerSchema.safeParse(
      parseJson(body?.candidates?.[0]?.content?.parts?.[0]?.text),
    );
    if (!answer.success) {
      console.error('Gemini 리뷰 분석 응답을 읽지 못했어요');
      return 'UNREADABLE';
    }
    return {
      ...answer.data,
      model,
      length: input.content.length,
      imageCount: input.imageCount,
    };
  } catch (err) {
    console.error('Gemini 리뷰 분석 호출 실패', err);
    return null;
  }
}
