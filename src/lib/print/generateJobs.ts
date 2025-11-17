import { supabase } from '@/integrations/supabase/client';

interface GenerateJobsOptions {
  storeKey?: string;
  locationGid?: string;
  hoursAgo?: number;
  workstationId: string;
}

interface GenerateJobsResult {
  created: number;
  skipped: number;
  errors: string[];
}

export async function generatePrintJobsFromIntakeItems(
  options: GenerateJobsOptions
): Promise<GenerateJobsResult> {
  const result: GenerateJobsResult = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Fetch items that haven't been printed yet
    let query = supabase
      .from('intake_items')
      .select('*')
      .is('printed_at', null)
      .is('deleted_at', null);

    if (options.storeKey) {
      query = query.eq('store_key', options.storeKey);
    }

    if (options.locationGid) {
      query = query.eq('shopify_location_gid', options.locationGid);
    }

    if (options.hoursAgo) {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - options.hoursAgo);
      query = query.gte('created_at', cutoff.toISOString());
    }

    const { data: items, error: itemsError } = await query;

    if (itemsError) {
      result.errors.push(`Failed to fetch items: ${itemsError.message}`);
      return result;
    }

    if (!items || items.length === 0) {
      return result;
    }

    // Fetch active print profiles ordered by priority
    const { data: profiles, error: profilesError } = await supabase
      .from('print_profiles')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (profilesError) {
      result.errors.push(`Failed to fetch profiles: ${profilesError.message}`);
      return result;
    }

    if (!profiles || profiles.length === 0) {
      result.errors.push('No active print profiles found');
      return result;
    }

    // Check existing print jobs to avoid duplicates
    const itemIds = items.map(i => i.id);
    const { data: existingJobs } = await supabase
      .from('print_jobs')
      .select('data')
      .eq('workstation_id', options.workstationId)
      .in('status', ['queued', 'claimed', 'processing']);

    const existingItemIds = new Set(
      (existingJobs || [])
        .map(job => (job.data as any)?.itemId)
        .filter(Boolean)
    );

    // Match items to profiles and create jobs
    const jobsToCreate = [];

    for (const item of items) {
      // Skip if already has a job
      if (existingItemIds.has(item.id)) {
        result.skipped++;
        continue;
      }

      // Find matching profile
      const matchingProfile = profiles.find(profile => {
        // Check category match
        if (profile.match_category && item.main_category !== profile.match_category) {
          return false;
        }

        // Check type match
        if (profile.match_type && item.type !== profile.match_type) {
          return false;
        }

        // Check tags match (if item has tags in source_payload or shopify_snapshot)
        if (profile.match_tags && profile.match_tags.length > 0) {
          const itemTags = [
            ...((item.shopify_snapshot as any)?.tags || []),
            ...((item.source_payload as any)?.tags || []),
          ];
          
          const hasMatchingTag = profile.match_tags.some(tag => 
            itemTags.some((itemTag: string) => 
              itemTag.toLowerCase().includes(tag.toLowerCase())
            )
          );

          if (!hasMatchingTag) {
            return false;
          }
        }

        return true;
      });

      if (!matchingProfile) {
        result.skipped++;
        continue;
      }

      // Create print job data
      jobsToCreate.push({
        workstation_id: options.workstationId,
        template_id: matchingProfile.template_id,
        copies: matchingProfile.copies || 1,
        status: 'queued',
        data: {
          itemId: item.id,
          sku: item.sku,
          title: item.brand_title || item.subject,
          price: item.price,
          condition: item.variant || 'NM',
          category: item.main_category,
          storeKey: item.store_key,
          profileId: matchingProfile.id,
        },
        target: {
          type: 'intake_item',
          itemId: item.id,
          storeKey: item.store_key,
          locationGid: item.shopify_location_gid,
          addTags: matchingProfile.add_tags || [],
          removeTags: matchingProfile.remove_tags || [],
        },
      });
    }

    if (jobsToCreate.length === 0) {
      return result;
    }

    // Insert jobs in batches
    const batchSize = 100;
    for (let i = 0; i < jobsToCreate.length; i += batchSize) {
      const batch = jobsToCreate.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('print_jobs')
        .insert(batch);

      if (insertError) {
        result.errors.push(`Batch insert error: ${insertError.message}`);
      } else {
        result.created += batch.length;
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Unexpected error: ${error}`);
    return result;
  }
}
