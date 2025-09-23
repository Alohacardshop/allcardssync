import { useEffect, useState } from 'react';
import { getTemplate, codeDefaultRawCard2x1 } from '@/lib/labels/templateStore';
import type { LabelTemplate } from '@/lib/labels/types';

export function useTemplateDefault(id: string = 'raw_card_2x1') {
  const [tpl, setTpl] = useState<LabelTemplate>(codeDefaultRawCard2x1());
  useEffect(() => { (async () => setTpl(await getTemplate(id)))(); }, [id]);
  return tpl;
}

// Legacy exports for backward compatibility
export const APP_DEFAULT_TEMPLATE_ID = 'raw_card_2x1';

export function useTemplateDefaultLegacy() {
  const template = useTemplateDefault();
  return {
    selectedTemplateId: template.id,
    setSelectedTemplateId: () => {}, // No-op for now
    setAsDefault: () => {},
    resetToAppDefault: () => {},
    isUsingAppDefault: template.scope === 'code',
    appDefaultTemplateId: APP_DEFAULT_TEMPLATE_ID
  };
}