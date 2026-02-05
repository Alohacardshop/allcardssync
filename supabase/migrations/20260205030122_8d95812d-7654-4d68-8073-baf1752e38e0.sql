-- Create table for user-saved inventory views
CREATE TABLE public.user_inventory_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  filters JSONB NOT NULL DEFAULT '{}',
  visible_columns TEXT[] NOT NULL DEFAULT '{}',
  sort_column TEXT,
  sort_direction TEXT DEFAULT 'desc',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.user_inventory_views ENABLE ROW LEVEL SECURITY;

-- Users can only see their own views
CREATE POLICY "Users can view their own inventory views"
ON public.user_inventory_views
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own views
CREATE POLICY "Users can create their own inventory views"
ON public.user_inventory_views
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own views
CREATE POLICY "Users can update their own inventory views"
ON public.user_inventory_views
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own non-system views
CREATE POLICY "Users can delete their own non-system views"
ON public.user_inventory_views
FOR DELETE
USING (auth.uid() = user_id AND is_system = false);

-- Index for fast user lookups
CREATE INDEX idx_user_inventory_views_user_id ON public.user_inventory_views(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_inventory_views_updated_at
BEFORE UPDATE ON public.user_inventory_views
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();