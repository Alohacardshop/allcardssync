import { useLocalStorageString } from './useLocalStorage';
import { AVAILABLE_TEMPLATES } from '@/lib/labelTemplates';

// Single source of truth for the app-wide default template
export const APP_DEFAULT_TEMPLATE_ID = 'graded-card';

export function useTemplateDefault() {
  const [selectedTemplateId, setSelectedTemplateId] = useLocalStorageString(
    'selected-template', 
    APP_DEFAULT_TEMPLATE_ID
  );

  // Fallback safety: if stored template doesn't exist, use app default
  const safeTemplateId = AVAILABLE_TEMPLATES.find(t => t.id === selectedTemplateId)?.id || APP_DEFAULT_TEMPLATE_ID;

  const setAsDefault = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const resetToAppDefault = () => {
    setSelectedTemplateId(APP_DEFAULT_TEMPLATE_ID);
  };

  const isUsingAppDefault = safeTemplateId === APP_DEFAULT_TEMPLATE_ID;

  return {
    selectedTemplateId: safeTemplateId,
    setSelectedTemplateId: setSelectedTemplateId,
    setAsDefault,
    resetToAppDefault,
    isUsingAppDefault,
    appDefaultTemplateId: APP_DEFAULT_TEMPLATE_ID
  };
}