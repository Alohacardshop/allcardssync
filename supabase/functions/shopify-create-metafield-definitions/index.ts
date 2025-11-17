import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth, requireRole } from '../_shared/auth.ts'

const METAFIELD_DEFINITIONS = [
  {
    name: "External ID",
    key: "external_id",
    namespace: "acs.sync",
    description: "Internal tracking ID from ACS system",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Intake ID",
    key: "intake_id",
    namespace: "acs.sync",
    description: "Intake item ID from ACS system",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Main Category",
    key: "main_category",
    namespace: "acs.sync",
    description: "Primary category (TCG, Comics)",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Sub Category",
    key: "sub_category",
    namespace: "acs.sync",
    description: "Specific subcategory (Pokemon, Baseball, Marvel, etc.)",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Item Type",
    key: "item_type",
    namespace: "acs.sync",
    description: "Item condition type (graded or raw)",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Grading Company",
    key: "grading_company",
    namespace: "acs.sync",
    description: "Professional grading company (PSA, CGC, BGS)",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Grade",
    key: "grade",
    namespace: "acs.sync",
    description: "Professional grading score or condition",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Certificate Number",
    key: "cert_number",
    namespace: "acs.sync",
    description: "Grading certificate number",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Certificate URL",
    key: "cert_url",
    namespace: "acs.sync",
    description: "Link to grading certificate verification page",
    type: "url",
    ownerType: "PRODUCT"
  },
  {
    name: "Brand/Set Title",
    key: "brand_title",
    namespace: "acs.sync",
    description: "Set name or brand (Base Set, 1989 Topps, etc.)",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Card Number",
    key: "card_number",
    namespace: "acs.sync",
    description: "Card number within the set",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Year",
    key: "year",
    namespace: "acs.sync",
    description: "Release year",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Variant",
    key: "variant",
    namespace: "acs.sync",
    description: "Card variant (Holo, First Edition, etc.)",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Subject",
    key: "subject",
    namespace: "acs.sync",
    description: "Player name or character name",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Rarity",
    key: "rarity",
    namespace: "acs.sync",
    description: "Card rarity level",
    type: "single_line_text_field",
    ownerType: "PRODUCT"
  },
  {
    name: "Catalog Snapshot",
    key: "catalog_snapshot",
    namespace: "acs.sync",
    description: "Full catalog metadata (JSON)",
    type: "json",
    ownerType: "PRODUCT"
  },
  {
    name: "PSA Snapshot",
    key: "psa_snapshot",
    namespace: "acs.sync",
    description: "PSA verification data (JSON)",
    type: "json",
    ownerType: "PRODUCT"
  },
  {
    name: "Grading Data",
    key: "grading_data",
    namespace: "acs.sync",
    description: "Complete grading details (JSON)",
    type: "json",
    ownerType: "PRODUCT"
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const user = await requireAuth(req);
    await requireRole(user.id, ['admin']);

    const { storeKey } = await req.json();
    
    // Get Shopify credentials
    const storeUpper = storeKey.toUpperCase();
    const domain = Deno.env.get(`SHOPIFY_${storeUpper}_STORE_DOMAIN`);
    const token = Deno.env.get(`SHOPIFY_${storeUpper}_ACCESS_TOKEN`);

    if (!domain || !token) {
      throw new Error(`Missing Shopify credentials for ${storeKey}`);
    }

    const results = [];

    for (const def of METAFIELD_DEFINITIONS) {
      try {
        const mutation = `
          mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
                namespace
                key
                type {
                  name
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const graphqlEndpoint = `https://${domain}/admin/api/2024-07/graphql.json`;
        
        const response = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: mutation,
            variables: {
              definition: {
                name: def.name,
                namespace: def.namespace,
                key: def.key,
                description: def.description,
                type: def.type,
                ownerType: def.ownerType,
                access: {
                  storefront: def.key === 'cert_url' ? 'PUBLIC_READ' : 'NONE'
                }
              }
            }
          })
        });

        const body = await response.json();
        const errors = body?.data?.metafieldDefinitionCreate?.userErrors || [];
        
        results.push({
          key: def.key,
          name: def.name,
          success: response.ok && errors.length === 0,
          status: response.status,
          definition: body?.data?.metafieldDefinitionCreate?.createdDefinition,
          errors: errors
        });

      } catch (error) {
        results.push({
          key: def.key,
          name: def.name,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(JSON.stringify({
      success: true,
      totalDefinitions: METAFIELD_DEFINITIONS.length,
      successCount,
      failedCount: METAFIELD_DEFINITIONS.length - successCount,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating metafield definitions:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
