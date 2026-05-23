import { NextResponse } from 'next/server';
import { callJSON, MODEL_SMART } from '@/lib/openai';
import { getLang } from '@/lib/lang';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_ZH = `你是一个文字润色助手。将用户的笔记改写得更有逻辑、更有条理。

规则：
1. 保留原意，不添加原文没有的内容，不删除关键信息。
2. 理清句子顺序，让因果、时序、层次关系更清晰。
3. 去掉口语化的冗余，但保持第一人称的个人视角。
4. 如果原文有多个观点，可以用分段或短列表呈现。
5. 不要加标题、不要加"总结"之类的固定套话。
6. 输出长度与原文相近，不要无故扩写。

返回 JSON：{ "polished": "润色后的文字" }`;

const SYSTEM_EN = `You are a writing polish assistant. Rewrite the user's note to be more logical and well-structured.

Rules:
1. Preserve the original meaning — do not add content that isn't there, do not drop key information.
2. Clarify the order of ideas so cause-effect, sequence, and hierarchy are explicit.
3. Remove conversational filler while keeping the first-person perspective.
4. If there are multiple points, use paragraphs or a short list.
5. Do not add headings or boilerplate phrases like "In summary."
6. Keep the output length similar to the input — do not pad.

Return JSON: { "polished": "polished text" }`;

export async function POST(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    const lang = getLang();
    const { polished } = await callJSON<{ polished: string }>({
      model: MODEL_SMART,
      system: lang === 'en' ? SYSTEM_EN : SYSTEM_ZH,
      user: content,
      maxTokens: 1000,
    });
    return NextResponse.json({ polished });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
