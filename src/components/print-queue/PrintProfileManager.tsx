import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Save, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface PrintProfile {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  priority: number;
  match_type?: string;
  match_category?: string;
  match_tags?: string[];
  template_id?: string;
  copies?: number;
  speed?: number;
  darkness?: number;
  add_tags?: string[];
  remove_tags?: string[];
  created_at: string;
  updated_at: string;
}

export default function PrintProfileManager() {
  const [profiles, setProfiles] = useState<PrintProfile[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editingProfile, setEditingProfile] = useState<Partial<PrintProfile> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfiles();
    fetchTemplates();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('print_profiles')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
      toast.error('Failed to load print profiles');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!editingProfile?.name) {
      toast.error('Profile name is required');
      return;
    }

    try {
      if (editingProfile.id) {
        const { error } = await supabase
          .from('print_profiles')
          .update({
            ...editingProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProfile.id);

        if (error) throw error;
        toast.success('Profile updated');
      } else {
        const { error } = await supabase
          .from('print_profiles')
          .insert([{
            ...editingProfile,
            name: editingProfile.name!,
            priority: profiles.length,
          }]);

        if (error) throw error;
        toast.success('Profile created');
      }

      setEditingProfile(null);
      fetchProfiles();
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile');
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Delete this print profile?')) return;

    try {
      const { error } = await supabase
        .from('print_profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Profile deleted');
      fetchProfiles();
    } catch (error) {
      console.error('Failed to delete profile:', error);
      toast.error('Failed to delete profile');
    }
  };

  const handleUpdatePriority = async (id: string, newPriority: number) => {
    try {
      const { error } = await supabase
        .from('print_profiles')
        .update({ priority: newPriority })
        .eq('id', id);

      if (error) throw error;
      fetchProfiles();
    } catch (error) {
      console.error('Failed to update priority:', error);
      toast.error('Failed to update priority');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Print Profiles</h3>
        <Button onClick={() => setEditingProfile({ is_active: true, priority: profiles.length })}>
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {editingProfile && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>{editingProfile.id ? 'Edit Profile' : 'New Profile'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profile Name *</Label>
                <Input
                  value={editingProfile.name || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  placeholder="e.g., Graded Cards - High Priority"
                />
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select
                  value={editingProfile.template_id || ''}
                  onValueChange={(value) => setEditingProfile({ ...editingProfile, template_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editingProfile.description || ''}
                onChange={(e) => setEditingProfile({ ...editingProfile, description: e.target.value })}
                placeholder="Describe when this profile should be used"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Match Type</Label>
                <Input
                  value={editingProfile.match_type || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, match_type: e.target.value })}
                  placeholder="e.g., Graded"
                />
              </div>
              <div className="space-y-2">
                <Label>Match Category</Label>
                <Input
                  value={editingProfile.match_category || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, match_category: e.target.value })}
                  placeholder="e.g., Sports Cards"
                />
              </div>
              <div className="space-y-2">
                <Label>Match Tags (comma separated)</Label>
                <Input
                  value={editingProfile.match_tags?.join(', ') || ''}
                  onChange={(e) => setEditingProfile({ 
                    ...editingProfile, 
                    match_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="e.g., psa, high-value"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Copies</Label>
                <Input
                  type="number"
                  min="1"
                  value={editingProfile.copies || 1}
                  onChange={(e) => setEditingProfile({ ...editingProfile, copies: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Speed (2-6 IPS)</Label>
                <Input
                  type="number"
                  min="2"
                  max="6"
                  value={editingProfile.speed || 4}
                  onChange={(e) => setEditingProfile({ ...editingProfile, speed: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Darkness (0-30)</Label>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={editingProfile.darkness || 10}
                  onChange={(e) => setEditingProfile({ ...editingProfile, darkness: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Add Tags After Print (comma separated)</Label>
                <Input
                  value={editingProfile.add_tags?.join(', ') || 'printed'}
                  onChange={(e) => setEditingProfile({ 
                    ...editingProfile, 
                    add_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="e.g., printed, ready-to-ship"
                />
              </div>
              <div className="space-y-2">
                <Label>Remove Tags After Print (comma separated)</Label>
                <Input
                  value={editingProfile.remove_tags?.join(', ') || ''}
                  onChange={(e) => setEditingProfile({ 
                    ...editingProfile, 
                    remove_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="e.g., needs-label"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={editingProfile.is_active}
                onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, is_active: checked })}
              />
              <Label>Active</Label>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveProfile}>
                <Save className="h-4 w-4 mr-2" />
                Save Profile
              </Button>
              <Button variant="outline" onClick={() => setEditingProfile(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">Loading profiles...</div>
            </CardContent>
          </Card>
        ) : profiles.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                No print profiles yet. Create one to automate your printing workflow!
              </div>
            </CardContent>
          </Card>
        ) : (
          profiles.map((profile, index) => (
            <Card key={profile.id} className={!profile.is_active ? 'opacity-50' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => handleUpdatePriority(profile.id, profile.priority - 1)}
                    >
                      ↑
                    </Button>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === profiles.length - 1}
                      onClick={() => handleUpdatePriority(profile.id, profile.priority + 1)}
                    >
                      ↓
                    </Button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{profile.name}</span>
                      {!profile.is_active && (
                        <span className="text-xs text-muted-foreground">(Inactive)</span>
                      )}
                    </div>
                    {profile.description && (
                      <div className="text-sm text-muted-foreground">{profile.description}</div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {profile.match_type && <span>Type: {profile.match_type}</span>}
                      {profile.match_category && <span>Category: {profile.match_category}</span>}
                      {profile.match_tags && profile.match_tags.length > 0 && (
                        <span>Tags: {profile.match_tags.join(', ')}</span>
                      )}
                      {profile.copies && <span>Copies: {profile.copies}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingProfile(profile)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteProfile(profile.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
