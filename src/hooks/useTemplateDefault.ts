import { useEffect, useState } from 'react';
import { getTemplate, codeDefaultRawCard2x1 } from '@/lib/labels/templateStore';
import type { LabelTemplate } from '@/lib/labels/types';

export const APP_DEFAULT_TEMPLATE_ID = 'raw_card_2x1';

export function useTemplateDefault(id: string = APP_DEFAULT_TEMPLATE_ID) {
  const [tpl, setTpl] = useState<LabelTemplate>(codeDefaultRawCard2x1());
  useEffect(() => { (async () => setTpl(await getTemplate(id)))(); }, [id]);
  return tpl;
}