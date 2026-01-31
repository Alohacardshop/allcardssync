export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          location_gid: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          region_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          location_gid?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          region_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          location_gid?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          region_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          created_at: string
          current_shopify_location_id: string | null
          ebay_offer_id: string | null
          id: string
          shopify_inventory_item_id: string | null
          shopify_variant_id: string | null
          sku: string
          status: Database["public"]["Enums"]["card_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_shopify_location_id?: string | null
          ebay_offer_id?: string | null
          id?: string
          shopify_inventory_item_id?: string | null
          shopify_variant_id?: string | null
          sku: string
          status?: Database["public"]["Enums"]["card_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_shopify_location_id?: string | null
          ebay_offer_id?: string | null
          id?: string
          shopify_inventory_item_id?: string | null
          shopify_variant_id?: string | null
          sku?: string
          status?: Database["public"]["Enums"]["card_status"]
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          data: Json | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cross_region_transfer_items: {
        Row: {
          created_at: string
          id: string
          intake_item_id: string | null
          item_name: string | null
          notes: string | null
          quantity: number
          received_at: string | null
          received_by: string | null
          request_id: string
          sku: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_item_id?: string | null
          item_name?: string | null
          notes?: string | null
          quantity?: number
          received_at?: string | null
          received_by?: string | null
          request_id: string
          sku: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_item_id?: string | null
          item_name?: string | null
          notes?: string | null
          quantity?: number
          received_at?: string | null
          received_by?: string | null
          request_id?: string
          sku?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_region_transfer_items_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_region_transfer_items_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "stale_lot_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_region_transfer_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "cross_region_transfer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_region_transfer_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          destination_region: string
          estimated_arrival: string | null
          id: string
          notes: string | null
          priority: string | null
          source_region: string
          status: string
          total_items: number | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_region: string
          estimated_arrival?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          source_region: string
          status?: string
          total_items?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_region?: string
          estimated_arrival?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          source_region?: string
          status?: string
          total_items?: number | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discord_notified_orders: {
        Row: {
          created_at: string
          id: number
          notified_at: string
          order_id: string
          order_name: string
          store_key: string
        }
        Insert: {
          created_at?: string
          id?: number
          notified_at?: string
          order_id: string
          order_name: string
          store_key: string
        }
        Update: {
          created_at?: string
          id?: number
          notified_at?: string
          order_id?: string
          order_name?: string
          store_key?: string
        }
        Relationships: []
      }
      ebay_category_mappings: {
        Row: {
          brand_match: string[] | null
          category_id: string
          category_name: string
          created_at: string | null
          default_template_id: string | null
          id: string
          is_active: boolean | null
          keyword_pattern: string | null
          main_category: string | null
          priority: number | null
          store_key: string
        }
        Insert: {
          brand_match?: string[] | null
          category_id: string
          category_name: string
          created_at?: string | null
          default_template_id?: string | null
          id?: string
          is_active?: boolean | null
          keyword_pattern?: string | null
          main_category?: string | null
          priority?: number | null
          store_key: string
        }
        Update: {
          brand_match?: string[] | null
          category_id?: string
          category_name?: string
          created_at?: string | null
          default_template_id?: string | null
          id?: string
          is_active?: boolean | null
          keyword_pattern?: string | null
          main_category?: string | null
          priority?: number | null
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_category_mappings_default_template_id_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "ebay_listing_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_fulfillment_policies: {
        Row: {
          created_at: string
          description: string | null
          handling_time: Json | null
          id: string
          is_default: boolean | null
          marketplace_id: string
          name: string
          policy_id: string
          shipping_options: Json | null
          store_key: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          handling_time?: Json | null
          id?: string
          is_default?: boolean | null
          marketplace_id: string
          name: string
          policy_id: string
          shipping_options?: Json | null
          store_key: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          handling_time?: Json | null
          id?: string
          is_default?: boolean | null
          marketplace_id?: string
          name?: string
          policy_id?: string
          shipping_options?: Json | null
          store_key?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ebay_inventory_aggregate: {
        Row: {
          created_at: string
          ebay_quantity: number | null
          id: string
          last_synced_to_ebay_at: string | null
          location_quantities: Json | null
          needs_sync: boolean | null
          sku: string
          store_key: string
          total_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          ebay_quantity?: number | null
          id?: string
          last_synced_to_ebay_at?: string | null
          location_quantities?: Json | null
          needs_sync?: boolean | null
          sku: string
          store_key: string
          total_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          ebay_quantity?: number | null
          id?: string
          last_synced_to_ebay_at?: string | null
          location_quantities?: Json | null
          needs_sync?: boolean | null
          sku?: string
          store_key?: string
          total_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      ebay_listing_templates: {
        Row: {
          aspects_mapping: Json | null
          category_id: string
          category_name: string | null
          condition_id: string
          created_at: string | null
          default_grader: string | null
          description: string | null
          description_template: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          is_graded: boolean | null
          name: string
          store_key: string
          title_template: string | null
          updated_at: string | null
        }
        Insert: {
          aspects_mapping?: Json | null
          category_id: string
          category_name?: string | null
          condition_id?: string
          created_at?: string | null
          default_grader?: string | null
          description?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_graded?: boolean | null
          name: string
          store_key: string
          title_template?: string | null
          updated_at?: string | null
        }
        Update: {
          aspects_mapping?: Json | null
          category_id?: string
          category_name?: string | null
          condition_id?: string
          created_at?: string | null
          default_grader?: string | null
          description?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_graded?: boolean | null
          name?: string
          store_key?: string
          title_template?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ebay_location_priority: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          location_name: string | null
          priority: number
          shopify_location_gid: string
          store_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          location_name?: string | null
          priority?: number
          shopify_location_gid: string
          store_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          location_name?: string | null
          priority?: number
          shopify_location_gid?: string
          store_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ebay_payment_policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          marketplace_id: string
          name: string
          payment_methods: Json | null
          policy_id: string
          store_key: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          marketplace_id: string
          name: string
          payment_methods?: Json | null
          policy_id: string
          store_key: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          marketplace_id?: string
          name?: string
          payment_methods?: Json | null
          policy_id?: string
          store_key?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ebay_return_policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          marketplace_id: string
          name: string
          policy_id: string
          refund_method: string | null
          return_period: string | null
          returns_accepted: boolean | null
          store_key: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          marketplace_id: string
          name: string
          policy_id: string
          refund_method?: string | null
          return_period?: string | null
          returns_accepted?: boolean | null
          store_key: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          marketplace_id?: string
          name?: string
          policy_id?: string
          refund_method?: string | null
          return_period?: string | null
          returns_accepted?: boolean | null
          store_key?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ebay_store_config: {
        Row: {
          created_at: string
          default_category_id: string | null
          default_condition_id: string | null
          default_fulfillment_policy_id: string | null
          default_payment_policy_id: string | null
          default_return_policy_id: string | null
          default_shipping_policy_id: string | null
          description_template: string | null
          dry_run_mode: boolean | null
          ebay_user_id: string | null
          environment: string
          id: string
          is_active: boolean | null
          location_key: string | null
          marketplace_id: string
          oauth_connected_at: string | null
          store_key: string
          sync_enabled: boolean | null
          sync_mode: string | null
          title_template: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          default_condition_id?: string | null
          default_fulfillment_policy_id?: string | null
          default_payment_policy_id?: string | null
          default_return_policy_id?: string | null
          default_shipping_policy_id?: string | null
          description_template?: string | null
          dry_run_mode?: boolean | null
          ebay_user_id?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          location_key?: string | null
          marketplace_id?: string
          oauth_connected_at?: string | null
          store_key: string
          sync_enabled?: boolean | null
          sync_mode?: string | null
          title_template?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          default_condition_id?: string | null
          default_fulfillment_policy_id?: string | null
          default_payment_policy_id?: string | null
          default_return_policy_id?: string | null
          default_shipping_policy_id?: string | null
          description_template?: string | null
          dry_run_mode?: boolean | null
          ebay_user_id?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          location_key?: string | null
          marketplace_id?: string
          oauth_connected_at?: string | null
          store_key?: string
          sync_enabled?: boolean | null
          sync_mode?: string | null
          title_template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ebay_sync_log: {
        Row: {
          after_state: Json | null
          before_state: Json | null
          created_at: string
          created_by: string | null
          dry_run: boolean | null
          ebay_response: Json | null
          error_message: string | null
          id: string
          operation: string
          sku: string | null
          store_key: string
          success: boolean | null
        }
        Insert: {
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          created_by?: string | null
          dry_run?: boolean | null
          ebay_response?: Json | null
          error_message?: string | null
          id?: string
          operation: string
          sku?: string | null
          store_key: string
          success?: boolean | null
        }
        Update: {
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          created_by?: string | null
          dry_run?: boolean | null
          ebay_response?: Json | null
          error_message?: string | null
          id?: string
          operation?: string
          sku?: string | null
          store_key?: string
          success?: boolean | null
        }
        Relationships: []
      }
      ebay_sync_queue: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          error_type: string | null
          id: string
          inventory_item_id: string
          max_retries: number | null
          payload: Json | null
          processor_heartbeat: string | null
          processor_id: string | null
          queue_position: number
          retry_after: string | null
          retry_count: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          inventory_item_id: string
          max_retries?: number | null
          payload?: Json | null
          processor_heartbeat?: string | null
          processor_id?: string | null
          queue_position?: number
          retry_after?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          inventory_item_id?: string
          max_retries?: number | null
          payload?: Json | null
          processor_heartbeat?: string | null
          processor_id?: string | null
          queue_position?: number
          retry_after?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebay_sync_queue_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebay_sync_queue_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "stale_lot_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_sync_rules: {
        Row: {
          auto_queue: boolean | null
          brand_match: string[] | null
          category_match: string[] | null
          created_at: string | null
          graded_only: boolean | null
          id: string
          is_active: boolean | null
          max_price: number | null
          min_price: number | null
          name: string
          priority: number | null
          rule_type: string
          store_key: string
          updated_at: string | null
        }
        Insert: {
          auto_queue?: boolean | null
          brand_match?: string[] | null
          category_match?: string[] | null
          created_at?: string | null
          graded_only?: boolean | null
          id?: string
          is_active?: boolean | null
          max_price?: number | null
          min_price?: number | null
          name: string
          priority?: number | null
          rule_type: string
          store_key: string
          updated_at?: string | null
        }
        Update: {
          auto_queue?: boolean | null
          brand_match?: string[] | null
          category_match?: string[] | null
          created_at?: string | null
          graded_only?: boolean | null
          id?: string
          is_active?: boolean | null
          max_price?: number | null
          min_price?: number | null
          name?: string
          priority?: number | null
          rule_type?: string
          store_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      edge_function_logs: {
        Row: {
          created_at: string
          details: Json
          event: string
          function_name: string
          id: string
          level: string
          request_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event: string
          function_name: string
          id?: string
          level: string
          request_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          event?: string
          function_name?: string
          id?: string
          level?: string
          request_id?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          discovered_at: string | null
          id: string
          name: string
          raw: Json | null
        }
        Insert: {
          discovered_at?: string | null
          id: string
          name: string
          raw?: Json | null
        }
        Update: {
          discovered_at?: string | null
          id?: string
          name?: string
          raw?: Json | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          category_id: number | null
          created_at: string | null
          data: Json | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          category_id?: number | null
          created_at?: string | null
          data?: Json | null
          id: number
          name: string
          updated_at?: string | null
        }
        Update: {
          category_id?: number | null
          created_at?: string | null
          data?: Json | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_items: {
        Row: {
          brand_title: string | null
          card_number: string | null
          catalog_snapshot: Json | null
          category: string | null
          cgc_cert: string | null
          cgc_snapshot: Json | null
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_reason: string | null
          ebay_inventory_item_sku: string | null
          ebay_legacy_import_at: string | null
          ebay_listing_id: string | null
          ebay_listing_url: string | null
          ebay_managed_externally: boolean | null
          ebay_offer_id: string | null
          ebay_price_check: Json | null
          ebay_sync_error: string | null
          ebay_sync_snapshot: Json | null
          ebay_sync_status: string | null
          grade: string | null
          grading_company: string
          grading_data: Json | null
          id: string
          image_urls: Json | null
          intake_batch_id: string | null
          label_snapshot: Json | null
          last_ebay_synced_at: string | null
          last_shopify_correlation_id: string | null
          last_shopify_location_gid: string | null
          last_shopify_removal_error: string | null
          last_shopify_store_key: string | null
          last_shopify_sync_error: string | null
          last_shopify_synced_at: string | null
          list_on_ebay: boolean | null
          list_on_shopify: boolean | null
          lot_id: string | null
          lot_number: string
          main_category: string | null
          original_filename: string | null
          price: number | null
          pricing_snapshot: Json | null
          printed_at: string | null
          processing_notes: string | null
          product_weight: number | null
          psa_cert: string | null
          psa_cert_number: string | null
          psa_last_check: string | null
          psa_snapshot: Json | null
          psa_verified: boolean | null
          purchase_location_id: string | null
          pushed_at: string | null
          quantity: number
          removed_from_batch_at: string | null
          shopify_inventory_item_id: string | null
          shopify_location_gid: string | null
          shopify_order_id: string | null
          shopify_product_id: string | null
          shopify_removal_mode: string | null
          shopify_removed_at: string | null
          shopify_snapshot: Json | null
          shopify_sync_snapshot: Json | null
          shopify_sync_status: string | null
          shopify_variant_id: string | null
          sku: string | null
          sold_at: string | null
          sold_channel: string | null
          sold_currency: string | null
          sold_order_id: string | null
          sold_price: number | null
          source_payload: Json | null
          source_provider: string | null
          source_row_number: number | null
          store_key: string | null
          sub_category: string | null
          subject: string | null
          type: string | null
          unique_item_uid: string
          updated_at: string
          updated_by: string | null
          variant: string | null
          vendor: string | null
          year: string | null
        }
        Insert: {
          brand_title?: string | null
          card_number?: string | null
          catalog_snapshot?: Json | null
          category?: string | null
          cgc_cert?: string | null
          cgc_snapshot?: Json | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          ebay_inventory_item_sku?: string | null
          ebay_legacy_import_at?: string | null
          ebay_listing_id?: string | null
          ebay_listing_url?: string | null
          ebay_managed_externally?: boolean | null
          ebay_offer_id?: string | null
          ebay_price_check?: Json | null
          ebay_sync_error?: string | null
          ebay_sync_snapshot?: Json | null
          ebay_sync_status?: string | null
          grade?: string | null
          grading_company?: string
          grading_data?: Json | null
          id?: string
          image_urls?: Json | null
          intake_batch_id?: string | null
          label_snapshot?: Json | null
          last_ebay_synced_at?: string | null
          last_shopify_correlation_id?: string | null
          last_shopify_location_gid?: string | null
          last_shopify_removal_error?: string | null
          last_shopify_store_key?: string | null
          last_shopify_sync_error?: string | null
          last_shopify_synced_at?: string | null
          list_on_ebay?: boolean | null
          list_on_shopify?: boolean | null
          lot_id?: string | null
          lot_number?: string
          main_category?: string | null
          original_filename?: string | null
          price?: number | null
          pricing_snapshot?: Json | null
          printed_at?: string | null
          processing_notes?: string | null
          product_weight?: number | null
          psa_cert?: string | null
          psa_cert_number?: string | null
          psa_last_check?: string | null
          psa_snapshot?: Json | null
          psa_verified?: boolean | null
          purchase_location_id?: string | null
          pushed_at?: string | null
          quantity?: number
          removed_from_batch_at?: string | null
          shopify_inventory_item_id?: string | null
          shopify_location_gid?: string | null
          shopify_order_id?: string | null
          shopify_product_id?: string | null
          shopify_removal_mode?: string | null
          shopify_removed_at?: string | null
          shopify_snapshot?: Json | null
          shopify_sync_snapshot?: Json | null
          shopify_sync_status?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          sold_at?: string | null
          sold_channel?: string | null
          sold_currency?: string | null
          sold_order_id?: string | null
          sold_price?: number | null
          source_payload?: Json | null
          source_provider?: string | null
          source_row_number?: number | null
          store_key?: string | null
          sub_category?: string | null
          subject?: string | null
          type?: string | null
          unique_item_uid?: string
          updated_at?: string
          updated_by?: string | null
          variant?: string | null
          vendor?: string | null
          year?: string | null
        }
        Update: {
          brand_title?: string | null
          card_number?: string | null
          catalog_snapshot?: Json | null
          category?: string | null
          cgc_cert?: string | null
          cgc_snapshot?: Json | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          ebay_inventory_item_sku?: string | null
          ebay_legacy_import_at?: string | null
          ebay_listing_id?: string | null
          ebay_listing_url?: string | null
          ebay_managed_externally?: boolean | null
          ebay_offer_id?: string | null
          ebay_price_check?: Json | null
          ebay_sync_error?: string | null
          ebay_sync_snapshot?: Json | null
          ebay_sync_status?: string | null
          grade?: string | null
          grading_company?: string
          grading_data?: Json | null
          id?: string
          image_urls?: Json | null
          intake_batch_id?: string | null
          label_snapshot?: Json | null
          last_ebay_synced_at?: string | null
          last_shopify_correlation_id?: string | null
          last_shopify_location_gid?: string | null
          last_shopify_removal_error?: string | null
          last_shopify_store_key?: string | null
          last_shopify_sync_error?: string | null
          last_shopify_synced_at?: string | null
          list_on_ebay?: boolean | null
          list_on_shopify?: boolean | null
          lot_id?: string | null
          lot_number?: string
          main_category?: string | null
          original_filename?: string | null
          price?: number | null
          pricing_snapshot?: Json | null
          printed_at?: string | null
          processing_notes?: string | null
          product_weight?: number | null
          psa_cert?: string | null
          psa_cert_number?: string | null
          psa_last_check?: string | null
          psa_snapshot?: Json | null
          psa_verified?: boolean | null
          purchase_location_id?: string | null
          pushed_at?: string | null
          quantity?: number
          removed_from_batch_at?: string | null
          shopify_inventory_item_id?: string | null
          shopify_location_gid?: string | null
          shopify_order_id?: string | null
          shopify_product_id?: string | null
          shopify_removal_mode?: string | null
          shopify_removed_at?: string | null
          shopify_snapshot?: Json | null
          shopify_sync_snapshot?: Json | null
          shopify_sync_status?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          sold_at?: string | null
          sold_channel?: string | null
          sold_currency?: string | null
          sold_order_id?: string | null
          sold_price?: number | null
          source_payload?: Json | null
          source_provider?: string | null
          source_row_number?: number | null
          store_key?: string | null
          sub_category?: string | null
          subject?: string | null
          type?: string | null
          unique_item_uid?: string
          updated_at?: string
          updated_by?: string | null
          variant?: string | null
          vendor?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "intake_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_items_purchase_location_id_fkey"
            columns: ["purchase_location_id"]
            isOneToOne: false
            referencedRelation: "purchase_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_lots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lot_number: string
          lot_type: string
          notes: string | null
          processing_data: Json | null
          shopify_location_gid: string | null
          status: string | null
          store_key: string | null
          total_items: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_number?: string
          lot_type?: string
          notes?: string | null
          processing_data?: Json | null
          shopify_location_gid?: string | null
          status?: string | null
          store_key?: string | null
          total_items?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_number?: string
          lot_type?: string
          notes?: string | null
          processing_data?: Json | null
          shopify_location_gid?: string | null
          status?: string | null
          store_key?: string | null
          total_items?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_reconciliation_queue: {
        Row: {
          created_at: string | null
          details: Json
          id: string
          intake_item_id: string
          reason: string
        }
        Insert: {
          created_at?: string | null
          details: Json
          id?: string
          intake_item_id: string
          reason: string
        }
        Update: {
          created_at?: string | null
          details?: Json
          id?: string
          intake_item_id?: string
          reason?: string
        }
        Relationships: []
      }
      item_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          intake_item_id: string
          metadata: Json | null
          snapshot_data: Json
          snapshot_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          intake_item_id: string
          metadata?: Json | null
          snapshot_data: Json
          snapshot_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          intake_item_id?: string
          metadata?: Json | null
          snapshot_data?: Json
          snapshot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_snapshots_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_snapshots_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "stale_lot_items"
            referencedColumns: ["id"]
          },
        ]
      }
      justtcg_analytics_snapshots: {
        Row: {
          captured_at: string
          card_id: string
          card_name: string | null
          change_24h: number | null
          change_30d: number | null
          change_7d: number | null
          cheapest_price: number | null
          game: string
          id: number
          raw: Json | null
        }
        Insert: {
          captured_at?: string
          card_id: string
          card_name?: string | null
          change_24h?: number | null
          change_30d?: number | null
          change_7d?: number | null
          cheapest_price?: number | null
          game: string
          id?: number
          raw?: Json | null
        }
        Update: {
          captured_at?: string
          card_id?: string
          card_name?: string | null
          change_24h?: number | null
          change_30d?: number | null
          change_7d?: number | null
          cheapest_price?: number | null
          game?: string
          id?: number
          raw?: Json | null
        }
        Relationships: []
      }
      justtcg_games: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      justtcg_watchlist: {
        Row: {
          card_id: string
          created_at: string | null
          game: string
          id: number
        }
        Insert: {
          card_id: string
          created_at?: string | null
          game: string
          id?: number
        }
        Update: {
          card_id?: string
          created_at?: string | null
          game?: string
          id?: number
        }
        Relationships: []
      }
      label_settings: {
        Row: {
          copies: number | null
          created_at: string
          cut_mode: string | null
          darkness: number | null
          dpi: number | null
          has_cutter: boolean | null
          id: string
          speed: number | null
          updated_at: string
          workstation_id: string
        }
        Insert: {
          copies?: number | null
          created_at?: string
          cut_mode?: string | null
          darkness?: number | null
          dpi?: number | null
          has_cutter?: boolean | null
          id?: string
          speed?: number | null
          updated_at?: string
          workstation_id: string
        }
        Update: {
          copies?: number | null
          created_at?: string
          cut_mode?: string | null
          darkness?: number | null
          dpi?: number | null
          has_cutter?: boolean | null
          id?: string
          speed?: number | null
          updated_at?: string
          workstation_id?: string
        }
        Relationships: []
      }
      label_templates: {
        Row: {
          canvas: Json
          created_at: string
          data: Json | null
          id: string
          is_default: boolean | null
          name: string
          template_type: string | null
          updated_at: string
        }
        Insert: {
          canvas: Json
          created_at?: string
          data?: Json | null
          id?: string
          is_default?: boolean | null
          name: string
          template_type?: string | null
          updated_at?: string
        }
        Update: {
          canvas?: Json
          created_at?: string
          data?: Json | null
          id?: string
          is_default?: boolean | null
          name?: string
          template_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      label_templates_new: {
        Row: {
          body: string
          id: string
          optional_fields: string[] | null
          required_fields: string[] | null
          updated_at: string
        }
        Insert: {
          body: string
          id: string
          optional_fields?: string[] | null
          required_fields?: string[] | null
          updated_at?: string
        }
        Update: {
          body?: string
          id?: string
          optional_fields?: string[] | null
          required_fields?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      location_drift_flags: {
        Row: {
          actual_locations: Json | null
          card_id: string | null
          detected_at: string | null
          drift_type: string
          expected_location_id: string | null
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          sku: string
        }
        Insert: {
          actual_locations?: Json | null
          card_id?: string | null
          detected_at?: string | null
          drift_type: string
          expected_location_id?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sku: string
        }
        Update: {
          actual_locations?: Json | null
          card_id?: string | null
          detected_at?: string | null
          drift_type?: string
          expected_location_id?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_drift_flags_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      location_transfer_items: {
        Row: {
          barcode: string | null
          error_message: string | null
          id: string
          intake_item_id: string
          item_name: string | null
          processed_at: string | null
          quantity: number
          shopify_product_id: string | null
          shopify_variant_id: string | null
          sku: string
          status: string
          transfer_id: string
        }
        Insert: {
          barcode?: string | null
          error_message?: string | null
          id?: string
          intake_item_id: string
          item_name?: string | null
          processed_at?: string | null
          quantity: number
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku: string
          status?: string
          transfer_id: string
        }
        Update: {
          barcode?: string | null
          error_message?: string | null
          id?: string
          intake_item_id?: string
          item_name?: string | null
          processed_at?: string | null
          quantity?: number
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku?: string
          status?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_transfer_items_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_transfer_items_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "stale_lot_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "location_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      location_transfers: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          destination_location_gid: string
          error_details: Json | null
          failed_items: number
          id: string
          notes: string | null
          source_location_gid: string
          status: string
          store_key: string
          successful_items: number
          total_items: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_location_gid: string
          error_details?: Json | null
          failed_items?: number
          id?: string
          notes?: string | null
          source_location_gid: string
          status?: string
          store_key: string
          successful_items?: number
          total_items?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_location_gid?: string
          error_details?: Json | null
          failed_items?: number
          id?: string
          notes?: string | null
          source_location_gid?: string
          status?: string
          store_key?: string
          successful_items?: number
          total_items?: number
        }
        Relationships: []
      }
      main_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pending_notifications: {
        Row: {
          created_at: string
          id: number
          payload: Json
          region_id: string | null
          sent: boolean
        }
        Insert: {
          created_at?: string
          id?: number
          payload: Json
          region_id?: string | null
          sent?: boolean
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          region_id?: string | null
          sent?: boolean
        }
        Relationships: []
      }
      pricing_job_runs: {
        Row: {
          actual_batches: number
          cards_processed: number
          created_at: string
          duration_ms: number
          expected_batches: number
          finished_at: string
          game: string
          id: string
          payload: Json | null
          started_at: string
          updated_at: string
          variants_updated: number
        }
        Insert: {
          actual_batches?: number
          cards_processed?: number
          created_at?: string
          duration_ms?: number
          expected_batches?: number
          finished_at?: string
          game: string
          id?: string
          payload?: Json | null
          started_at?: string
          updated_at?: string
          variants_updated?: number
        }
        Update: {
          actual_batches?: number
          cards_processed?: number
          created_at?: string
          duration_ms?: number
          expected_batches?: number
          finished_at?: string
          game?: string
          id?: string
          payload?: Json | null
          started_at?: string
          updated_at?: string
          variants_updated?: number
        }
        Relationships: []
      }
      print_jobs: {
        Row: {
          claimed_at: string | null
          copies: number
          created_at: string | null
          data: Json
          error: string | null
          id: string
          printed_at: string | null
          status: string
          target: Json
          template_id: string | null
          template_version: string | null
          tspl_body: string | null
          workstation_id: string
        }
        Insert: {
          claimed_at?: string | null
          copies?: number
          created_at?: string | null
          data: Json
          error?: string | null
          id?: string
          printed_at?: string | null
          status?: string
          target: Json
          template_id?: string | null
          template_version?: string | null
          tspl_body?: string | null
          workstation_id: string
        }
        Update: {
          claimed_at?: string | null
          copies?: number
          created_at?: string | null
          data?: Json
          error?: string | null
          id?: string
          printed_at?: string | null
          status?: string
          target?: Json
          template_id?: string | null
          template_version?: string | null
          tspl_body?: string | null
          workstation_id?: string
        }
        Relationships: []
      }
      print_profiles: {
        Row: {
          add_tags: string[] | null
          copies: number | null
          created_at: string | null
          darkness: number | null
          description: string | null
          field_mappings: Json | null
          id: string
          is_active: boolean | null
          match_category: string | null
          match_tags: string[] | null
          match_type: string | null
          name: string
          priority: number
          remove_tags: string[] | null
          speed: number | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          add_tags?: string[] | null
          copies?: number | null
          created_at?: string | null
          darkness?: number | null
          description?: string | null
          field_mappings?: Json | null
          id?: string
          is_active?: boolean | null
          match_category?: string | null
          match_tags?: string[] | null
          match_type?: string | null
          name: string
          priority?: number
          remove_tags?: string[] | null
          speed?: number | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          add_tags?: string[] | null
          copies?: number | null
          created_at?: string | null
          darkness?: number | null
          description?: string | null
          field_mappings?: Json | null
          id?: string
          is_active?: boolean | null
          match_category?: string | null
          match_tags?: string[] | null
          match_type?: string | null
          name?: string
          priority?: number
          remove_tags?: string[] | null
          speed?: number | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_profiles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "label_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_settings: {
        Row: {
          created_at: string | null
          id: string
          printer_name: string | null
          selected_printer_name: string | null
          updated_at: string | null
          workstation_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          printer_name?: string | null
          selected_printer_name?: string | null
          updated_at?: string | null
          workstation_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          printer_name?: string | null
          selected_printer_name?: string | null
          updated_at?: string | null
          workstation_id?: string
        }
        Relationships: []
      }
      product_sync_status: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          product_id: number | null
          shopify_id: string | null
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          product_id?: number | null
          shopify_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          product_id?: number | null
          shopify_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sync_status_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          group_id: number | null
          id: number
          name: string
          tcgcsv_data: Json | null
          tcgplayer_data: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: number | null
          id: number
          name: string
          tcgcsv_data?: Json | null
          tcgplayer_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: number | null
          id?: number
          name?: string
          tcgcsv_data?: Json | null
          tcgplayer_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      psa_certificates: {
        Row: {
          brand: string | null
          card_number: string | null
          category: string | null
          cert_number: string
          created_at: string | null
          firecrawl_response: Json | null
          grade: string | null
          id: string
          image_url: string | null
          image_urls: Json | null
          is_valid: boolean
          psa_url: string | null
          raw_html: string | null
          raw_markdown: string | null
          scraped_at: string
          subject: string | null
          updated_at: string | null
          variety_pedigree: string | null
          year: string | null
        }
        Insert: {
          brand?: string | null
          card_number?: string | null
          category?: string | null
          cert_number: string
          created_at?: string | null
          firecrawl_response?: Json | null
          grade?: string | null
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          is_valid?: boolean
          psa_url?: string | null
          raw_html?: string | null
          raw_markdown?: string | null
          scraped_at?: string
          subject?: string | null
          updated_at?: string | null
          variety_pedigree?: string | null
          year?: string | null
        }
        Update: {
          brand?: string | null
          card_number?: string | null
          category?: string | null
          cert_number?: string
          created_at?: string | null
          firecrawl_response?: Json | null
          grade?: string | null
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          is_valid?: boolean
          psa_url?: string | null
          raw_html?: string | null
          raw_markdown?: string | null
          scraped_at?: string
          subject?: string | null
          updated_at?: string | null
          variety_pedigree?: string | null
          year?: string | null
        }
        Relationships: []
      }
      psa_request_log: {
        Row: {
          cert_number: string | null
          created_at: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          response_time_ms: number | null
          success: boolean | null
        }
        Insert: {
          cert_number?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          response_time_ms?: number | null
          success?: boolean | null
        }
        Update: {
          cert_number?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          response_time_ms?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      purchase_locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      region_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          region_id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          region_id: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          region_id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      regions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      retry_jobs: {
        Row: {
          attempts: number | null
          created_at: string | null
          id: string
          job_type: Database["public"]["Enums"]["retry_job_type"]
          last_error: string | null
          max_attempts: number | null
          next_run_at: string | null
          payload: Json | null
          sku: string
          status: Database["public"]["Enums"]["retry_job_status"]
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          id?: string
          job_type: Database["public"]["Enums"]["retry_job_type"]
          last_error?: string | null
          max_attempts?: number | null
          next_run_at?: string | null
          payload?: Json | null
          sku: string
          status?: Database["public"]["Enums"]["retry_job_status"]
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          id?: string
          job_type?: Database["public"]["Enums"]["retry_job_type"]
          last_error?: string | null
          max_attempts?: number | null
          next_run_at?: string | null
          payload?: Json | null
          sku?: string
          status?: Database["public"]["Enums"]["retry_job_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_events: {
        Row: {
          created_at: string
          error: string | null
          id: string
          processed_at: string | null
          sku: string
          source: Database["public"]["Enums"]["sale_source"]
          source_event_id: string
          status: Database["public"]["Enums"]["sale_event_status"]
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          processed_at?: string | null
          sku: string
          source: Database["public"]["Enums"]["sale_source"]
          source_event_id: string
          status?: Database["public"]["Enums"]["sale_event_status"]
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          processed_at?: string | null
          sku?: string
          source?: Database["public"]["Enums"]["sale_source"]
          source_event_id?: string
          status?: Database["public"]["Enums"]["sale_event_status"]
        }
        Relationships: []
      }
      scheduled_ebay_listings: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          intake_item_id: string | null
          published_at: string | null
          region_id: string
          scheduled_time: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          intake_item_id?: string | null
          published_at?: string | null
          region_id: string
          scheduled_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          intake_item_id?: string | null
          published_at?: string | null
          region_id?: string
          scheduled_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_ebay_listings_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_ebay_listings_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "stale_lot_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          cards_count: number | null
          discovered_at: string | null
          game: string
          id: string
          name: string
          raw: Json | null
          released_at: string | null
        }
        Insert: {
          cards_count?: number | null
          discovered_at?: string | null
          game: string
          id: string
          name: string
          raw?: Json | null
          released_at?: string | null
        }
        Update: {
          cards_count?: number | null
          discovered_at?: string | null
          game?: string
          id?: string
          name?: string
          raw?: Json | null
          released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sets_game_fkey"
            columns: ["game"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_dead_letter_queue: {
        Row: {
          action: string
          archived_at: string | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          failure_context: Json | null
          id: string
          inventory_item_id: string
          item_snapshot: Json | null
          original_queue_id: string
          resolution_notes: string | null
          resolved_at: string | null
          retry_count: number | null
        }
        Insert: {
          action: string
          archived_at?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          failure_context?: Json | null
          id?: string
          inventory_item_id: string
          item_snapshot?: Json | null
          original_queue_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          retry_count?: number | null
        }
        Update: {
          action?: string
          archived_at?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          failure_context?: Json | null
          id?: string
          inventory_item_id?: string
          item_snapshot?: Json | null
          original_queue_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      shopify_location_cache: {
        Row: {
          cached_at: string
          expires_at: string
          location_gid: string
          location_id: string
          location_name: string | null
          store_key: string
        }
        Insert: {
          cached_at?: string
          expires_at?: string
          location_gid: string
          location_id: string
          location_name?: string | null
          store_key: string
        }
        Update: {
          cached_at?: string
          expires_at?: string
          location_gid?: string
          location_id?: string
          location_name?: string | null
          store_key?: string
        }
        Relationships: []
      }
      shopify_location_vendors: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          location_gid: string | null
          store_key: string
          updated_at: string
          vendor_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          location_gid?: string | null
          store_key: string
          updated_at?: string
          vendor_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          location_gid?: string | null
          store_key?: string
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_location_vendors_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "shopify_stores"
            referencedColumns: ["key"]
          },
        ]
      }
      shopify_product_cache: {
        Row: {
          cached_at: string | null
          expires_at: string | null
          id: string
          shopify_inventory_item_id: string | null
          shopify_product_id: string | null
          shopify_variant_id: string | null
          sku: string
          store_key: string
        }
        Insert: {
          cached_at?: string | null
          expires_at?: string | null
          id?: string
          shopify_inventory_item_id?: string | null
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku: string
          store_key: string
        }
        Update: {
          cached_at?: string | null
          expires_at?: string | null
          id?: string
          shopify_inventory_item_id?: string | null
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          sku?: string
          store_key?: string
        }
        Relationships: []
      }
      shopify_stores: {
        Row: {
          api_version: string | null
          created_at: string | null
          domain: string | null
          key: string
          name: string
          region_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          api_version?: string | null
          created_at?: string | null
          domain?: string | null
          key: string
          name: string
          region_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          api_version?: string | null
          created_at?: string | null
          domain?: string | null
          key?: string
          name?: string
          region_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_stores_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_sync_queue: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          error_type: string | null
          id: string
          inventory_item_id: string
          max_retries: number
          processor_heartbeat: string | null
          processor_id: string | null
          quantity: number
          queue_position: number
          retry_after: string | null
          retry_count: number
          shopify_product_id: string | null
          sold_at: string | null
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
          variant: string | null
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          inventory_item_id: string
          max_retries?: number
          processor_heartbeat?: string | null
          processor_id?: string | null
          quantity?: number
          queue_position?: number
          retry_after?: string | null
          retry_count?: number
          shopify_product_id?: string | null
          sold_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          variant?: string | null
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          inventory_item_id?: string
          max_retries?: number
          processor_heartbeat?: string | null
          processor_id?: string | null
          quantity?: number
          queue_position?: number
          retry_after?: string | null
          retry_count?: number
          shopify_product_id?: string | null
          sold_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_sync_queue_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_sync_queue_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "stale_lot_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          main_category_id: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          main_category_id: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          main_category_id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_categories_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_queue: {
        Row: {
          created_at: string
          game: string
          id: string
          job_type: string
          last_error: string | null
          mode: string
          retries: number
          set_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          game: string
          id?: string
          job_type?: string
          last_error?: string | null
          mode: string
          retries?: number
          set_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          game?: string
          id?: string
          job_type?: string
          last_error?: string | null
          mode?: string
          retries?: number
          set_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          context: Json | null
          created_at: string
          error_details: Json | null
          id: string
          level: string
          message: string
          metadata: Json | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_details?: Json | null
          id?: string
          level: string
          message: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_details?: Json | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_encrypted: boolean | null
          key_name: string
          key_value: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          key_name: string
          key_value?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          key_name?: string
          key_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trade_ins: {
        Row: {
          card_number: string | null
          condition: string | null
          cost_each: number | null
          created_at: string
          id: string
          language: string | null
          name: string | null
          price_each: number | null
          printing: string | null
          product_id: number | null
          quantity: number | null
          rarity: string | null
          set: string | null
          set_code: string | null
          sku: string | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          card_number?: string | null
          condition?: string | null
          cost_each?: number | null
          created_at?: string
          id?: string
          language?: string | null
          name?: string | null
          price_each?: number | null
          printing?: string | null
          product_id?: number | null
          quantity?: number | null
          rarity?: string | null
          set?: string | null
          set_code?: string | null
          sku?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          card_number?: string | null
          condition?: string | null
          cost_each?: number | null
          created_at?: string
          id?: string
          language?: string | null
          name?: string | null
          price_each?: number | null
          printing?: string | null
          product_id?: number | null
          quantity?: number | null
          rarity?: string | null
          set?: string | null
          set_code?: string | null
          sku?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_printer_preferences: {
        Row: {
          created_at: string
          id: string
          location_gid: string | null
          printer_name: string | null
          printer_type: string
          store_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_gid?: string | null
          printer_name?: string | null
          printer_type: string
          store_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_gid?: string | null
          printer_name?: string | null
          printer_type?: string
          store_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          default_location_id: string | null
          default_show_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_location_id?: string | null
          default_show_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_location_id?: string | null
          default_show_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_shopify_assignments: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          location_gid: string
          location_name: string | null
          region_id: string | null
          store_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          location_gid: string
          location_name?: string | null
          region_id?: string | null
          store_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          location_gid?: string
          location_name?: string | null
          region_id?: string | null
          store_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_shopify_assignments_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_shopify_assignments_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "shopify_stores"
            referencedColumns: ["key"]
          },
        ]
      }
      user_sync_preferences: {
        Row: {
          created_at: string
          force_resync: boolean
          id: string
          last_used_at: string
          only_new_sets: boolean
          selected_games: string[]
          selected_sets: string[]
          sets_game_filter: string
          since_days: number
          skip_recently_updated: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          force_resync?: boolean
          id?: string
          last_used_at?: string
          only_new_sets?: boolean
          selected_games?: string[]
          selected_sets?: string[]
          sets_game_filter?: string
          since_days?: number
          skip_recently_updated?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          force_resync?: boolean
          id?: string
          last_used_at?: string
          only_new_sets?: boolean
          selected_games?: string[]
          selected_sets?: string[]
          sets_game_filter?: string
          since_days?: number
          skip_recently_updated?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          last_retry_at: string | null
          payload: Json
          processed_at: string | null
          retry_count: number | null
          status: string | null
          webhook_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          last_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          retry_count?: number | null
          status?: string | null
          webhook_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number | null
          status?: string | null
          webhook_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dead_letter_failure_analysis: {
        Row: {
          error_type: string | null
          failure_count: number | null
          first_failure: string | null
          last_failure: string | null
          unresolved_count: number | null
        }
        Relationships: []
      }
      stale_lot_items: {
        Row: {
          age: unknown
          created_at: string | null
          id: string | null
          last_modified: string | null
          lot_id: string | null
          psa_cert: string | null
          sku: string | null
          updated_at: string | null
        }
        Insert: {
          age?: never
          created_at?: string | null
          id?: string | null
          last_modified?: never
          lot_id?: string | null
          psa_cert?: string | null
          sku?: string | null
          updated_at?: string | null
        }
        Update: {
          age?: never
          created_at?: string | null
          id?: string | null
          last_modified?: never
          lot_id?: string | null
          psa_cert?: string | null
          sku?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "intake_lots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _norm_gid: { Args: { t: string }; Returns: string }
      acquire_shopify_processor_lock: {
        Args: { processor_instance_id: string }
        Returns: boolean
      }
      add_system_log: {
        Args: {
          context_in?: Json
          error_details_in?: Json
          level_in: string
          message_in: string
          metadata_in?: Json
          source_in?: string
          user_id_in?: string
        }
        Returns: string
      }
      add_to_ebay_sync_queue: {
        Args: { item_ids: string[]; sync_action?: string }
        Returns: Json
      }
      add_to_shopify_sync_queue: {
        Args: { item_ids: string[]; sync_action?: string }
        Returns: Json
      }
      admin_cleanup_psa_duplicates: { Args: never; Returns: Json }
      admin_clear_shopify_sync_queue: {
        Args: { clear_type?: string }
        Returns: Json
      }
      admin_delete_batch: {
        Args: { lot_id_in: string; reason_in?: string }
        Returns: number
      }
      atomic_catalog_swap: { Args: { game_name: string }; Returns: undefined }
      atomic_mark_card_sold: {
        Args: {
          p_sku: string
          p_source: Database["public"]["Enums"]["sale_source"]
          p_source_event_id: string
        }
        Returns: {
          card_id: string
          previous_status: Database["public"]["Enums"]["card_status"]
          result: string
        }[]
      }
      atomic_release_card: {
        Args: { p_sku: string }
        Returns: {
          card_id: string
          result: string
        }[]
      }
      atomic_reserve_card: {
        Args: { p_sku: string }
        Returns: {
          card_id: string
          result: string
        }[]
      }
      batch_queue_shopify_sync: {
        Args: { item_ids: string[]; sync_action?: string }
        Returns: {
          failed_count: number
          queued_count: number
        }[]
      }
      bootstrap_user_admin: {
        Args: { _target_user_id?: string }
        Returns: Json
      }
      can_delete_batch_item: { Args: { _item_id: string }; Returns: boolean }
      catalog_v2_browse_cards: {
        Args: {
          filter_japanese?: boolean
          game_in: string
          limit_in?: number
          page_in?: number
          rarity_in?: string
          search_in?: string
          set_id_in?: string
          sort_by?: string
          sort_order?: string
        }
        Returns: Json
      }
      catalog_v2_browse_sets: {
        Args: {
          filter_japanese?: boolean
          game_in: string
          limit_in?: number
          page_in?: number
          search_in?: string
          sort_by?: string
          sort_order?: string
        }
        Returns: Json
      }
      catalog_v2_browse_variants: {
        Args: {
          condition_in?: string
          filter_japanese?: boolean
          game_in: string
          language_in?: string
          limit_in?: number
          page_in?: number
          price_max?: number
          price_min?: number
          printing_in?: string
          search_in?: string
          set_id_in?: string
          sort_by?: string
          sort_order?: string
        }
        Returns: Json
      }
      catalog_v2_clear_shadow_for_game: {
        Args: { game_in: string }
        Returns: undefined
      }
      catalog_v2_clear_sync_errors: {
        Args: { before_in?: string; game_in: string }
        Returns: number
      }
      catalog_v2_find_set_id_by_name: {
        Args: { game_in: string; name_in: string }
        Returns: string
      }
      catalog_v2_find_set_name_by_id: {
        Args: { game_in: string; id_in: string }
        Returns: string
      }
      catalog_v2_get_next_queue_item: {
        Args: { game_in: string }
        Returns: {
          game: string
          id: string
          set_id: string
        }[]
      }
      catalog_v2_get_next_queue_item_by_mode: {
        Args: { mode_in: string }
        Returns: {
          game: string
          id: string
          mode: string
          set_id: string
        }[]
      }
      catalog_v2_get_pending_sets_for_game: {
        Args: { game_in: string }
        Returns: {
          name: string
          provider_id: string
        }[]
      }
      catalog_v2_get_recent_sync_errors: {
        Args: { game_in?: string; limit_in?: number }
        Returns: {
          card_id: string
          created_at: string
          message: string
          set_id: string
          step: string
        }[]
      }
      catalog_v2_get_sets_for_backfill: {
        Args: { force_in?: boolean; game_in: string }
        Returns: {
          name: string
          provider_id: string
          set_id: string
        }[]
      }
      catalog_v2_get_stale_sets: {
        Args: { game_in: string; since_timestamp: string }
        Returns: {
          last_seen_at: string
          name: string
          set_id: string
        }[]
      }
      catalog_v2_guardrail_sets_new: {
        Args: { api_sets: Json; game_in: string }
        Returns: {
          not_found: number
          rolled_back: number
        }[]
      }
      catalog_v2_log_error: { Args: { payload: Json }; Returns: undefined }
      catalog_v2_mark_queue_item_done: {
        Args: { item_id: string }
        Returns: undefined
      }
      catalog_v2_mark_queue_item_error: {
        Args: { error_message: string; item_id: string; max_retries?: number }
        Returns: undefined
      }
      catalog_v2_pending_sets: {
        Args: { game_in: string; limit_in?: number }
        Returns: {
          name: string
          set_id: string
        }[]
      }
      catalog_v2_queue_pending_sets: {
        Args: { functions_base: string; game_in: string }
        Returns: number
      }
      catalog_v2_queue_pending_sets_by_mode: {
        Args: { filter_japanese?: boolean; game_in: string; mode_in: string }
        Returns: number
      }
      catalog_v2_queue_pending_sets_generic: {
        Args: { function_path: string; functions_base: string; game_in: string }
        Returns: number
      }
      catalog_v2_queue_pending_sets_to_queue: {
        Args: { game_in: string }
        Returns: number
      }
      catalog_v2_queue_stats: {
        Args: { game_in: string }
        Returns: {
          done: number
          error: number
          processing: number
          queued: number
        }[]
      }
      catalog_v2_queue_stats_by_mode: {
        Args: { mode_in: string }
        Returns: {
          done: number
          error: number
          processing: number
          queued: number
        }[]
      }
      catalog_v2_sets_new_null_provider_count: {
        Args: { game_in: string }
        Returns: number
      }
      catalog_v2_stats: {
        Args: { game_in: string }
        Returns: {
          cards_count: number
          pending_count: number
          sets_count: number
        }[]
      }
      catalog_v2_upsert_cards: { Args: { rows: Json }; Returns: undefined }
      catalog_v2_upsert_cards_new: { Args: { rows: Json }; Returns: undefined }
      catalog_v2_upsert_sets: { Args: { rows: Json }; Returns: undefined }
      catalog_v2_upsert_sets_new: { Args: { rows: Json }; Returns: undefined }
      catalog_v2_upsert_variants: { Args: { rows: Json }; Returns: undefined }
      catalog_v2_upsert_variants_new: {
        Args: { rows: Json }
        Returns: undefined
      }
      check_shopify_product_id_dupes: {
        Args: never
        Returns: {
          id: string
          shopify_product_id: string
          sku: string
          store_key: string
        }[]
      }
      check_shopify_queue_health: { Args: never; Returns: Json }
      check_sku_dupes: {
        Args: never
        Returns: {
          id: string
          shopify_product_id: string
          sku: string
          store_key: string
        }[]
      }
      claim_next_print_job: {
        Args: { ws: string }
        Returns: {
          claimed_at: string | null
          copies: number
          created_at: string | null
          data: Json
          error: string | null
          id: string
          printed_at: string | null
          status: string
          target: Json
          template_id: string | null
          template_version: string | null
          tspl_body: string | null
          workstation_id: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_retry_jobs: {
        Args: { p_limit?: number; p_processor_id?: string }
        Returns: {
          attempts: number | null
          created_at: string | null
          id: string
          job_type: Database["public"]["Enums"]["retry_job_type"]
          last_error: string | null
          max_attempts: number | null
          next_run_at: string | null
          payload: Json | null
          sku: string
          status: Database["public"]["Enums"]["retry_job_status"]
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "retry_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_webhook_events: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_shopify_sync_queue: { Args: never; Returns: undefined }
      cleanup_user_session: { Args: never; Returns: undefined }
      clear_stale_lot_items: { Args: never; Returns: undefined }
      close_empty_lot_and_create_new: {
        Args: { _location_gid: string; _store_key: string }
        Returns: {
          new_lot_id: string
          new_lot_number: string
          old_lot_id: string
          old_lot_number: string
        }[]
      }
      complete_retry_job: { Args: { p_job_id: string }; Returns: undefined }
      create_raw_intake_item: {
        Args: {
          brand_title_in?: string
          card_number_in?: string
          catalog_snapshot_in?: Json
          category_in?: string
          cost_in?: number
          grade_in?: string
          main_category_in?: string
          price_in?: number
          pricing_snapshot_in?: Json
          processing_notes_in?: string
          quantity_in?: number
          shopify_location_gid_in: string
          sku_in?: string
          source_provider_in?: string
          store_key_in: string
          sub_category_in?: string
          subject_in?: string
          variant_in?: string
        }
        Returns: {
          created_at: string
          id: string
          lot_number: string
        }[]
      }
      debug_eval_intake_access: {
        Args: { _location_gid: string; _store_key: string; _user_id: string }
        Returns: Json
      }
      debug_user_auth: { Args: { _user_id?: string }; Returns: Json }
      decrement_inventory_waterfall: {
        Args: {
          p_dry_run?: boolean
          p_qty_to_remove: number
          p_sku: string
          p_store_key: string
        }
        Returns: Json
      }
      ensure_card_exists: {
        Args: { p_sku: string; p_source?: string }
        Returns: {
          card_id: string
          status: Database["public"]["Enums"]["card_status"]
          was_created: boolean
        }[]
      }
      fail_retry_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      flag_location_drift: {
        Args: {
          p_actual_locations: Json
          p_card_id: string
          p_drift_type: string
          p_expected_location: string
          p_sku: string
        }
        Returns: string
      }
      force_new_lot: {
        Args: { _location_gid: string; _reason?: string; _store_key: string }
        Returns: {
          new_lot_id: string
          new_lot_number: string
          old_lot_id: string
          old_lot_number: string
        }[]
      }
      generate_lot_number: { Args: never; Returns: string }
      get_decrypted_secret: { Args: { secret_name: string }; Returns: string }
      get_distinct_categories:
        | {
            Args: never
            Returns: {
              category: string
            }[]
          }
        | {
            Args: { location_gid_in?: string; store_key_in: string }
            Returns: {
              category_value: string
            }[]
          }
      get_game_catalog_stats: {
        Args: never
        Returns: {
          cards_count: number
          game_id: string
          game_name: string
          sets_count: number
        }[]
      }
      get_group_sync_status: {
        Args: never
        Returns: {
          category_id: number
          id: number
          is_fully_synced: boolean
          name: string
          synced_products: number
          total_products: number
        }[]
      }
      get_or_create_active_lot: {
        Args: { _location_gid: string; _store_key: string }
        Returns: {
          id: string
          lot_number: string
        }[]
      }
      get_or_create_active_lot_for_user: {
        Args: { _location_gid: string; _store_key: string; _user_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          lot_number: string
          lot_type: string
          notes: string | null
          processing_data: Json | null
          shopify_location_gid: string | null
          status: string | null
          store_key: string | null
          total_items: number | null
          total_value: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "intake_lots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_sync_queue_metrics: {
        Args: { hours_back?: number }
        Returns: {
          avg_processing_time_ms: number
          by_action: Json
          by_hour: Json
          items_per_hour: number
          max_processing_time_ms: number
          success_rate: number
          total_failed: number
          total_processed: number
        }[]
      }
      get_webhook_health_stats: {
        Args: never
        Returns: {
          avg_processing_time_seconds: number
          failed_count: number
          last_24h_failed: number
          last_24h_total: number
          pending_count: number
          processed_count: number
          success_rate: number
          total_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      http_post_async: {
        Args: { body: Json; headers: Json; url: string }
        Returns: number
      }
      is_inventory_sync_enabled: { Args: never; Returns: boolean }
      normalize_game_slug: { Args: { slug_in: string }; Returns: string }
      queue_ebay_end_listing: {
        Args: { p_ebay_offer_id: string; p_sku: string }
        Returns: string
      }
      queue_shopify_sync: {
        Args: { item_id: string; sync_action?: string }
        Returns: string
      }
      queue_shopify_zero: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_sku: string
          p_store_key: string
        }
        Returns: string
      }
      recalculate_ebay_aggregate: {
        Args: { p_sku: string; p_store_key: string }
        Returns: Json
      }
      record_location_enforcement: {
        Args: {
          p_desired_location_id: string
          p_sku: string
          p_store_key: string
        }
        Returns: string
      }
      release_shopify_processor_lock: { Args: never; Returns: boolean }
      resolve_location_drift: {
        Args: { p_flag_id: string; p_notes?: string; p_resolved_by: string }
        Returns: undefined
      }
      restore_intake_item: {
        Args: { item_id: string; reason_in?: string }
        Returns: {
          id: string
        }[]
      }
      search_cards: {
        Args: { game_in?: string; lim?: number; off?: number; q?: string }
        Returns: {
          game_name: string
          id: string
          image_url: string
          name: string
          number: string
          rank: number
          rarity: string
          set_name: string
        }[]
      }
      secure_get_secret: { Args: { secret_name: string }; Returns: string }
      send_and_queue_inventory: { Args: { item_ids: string[] }; Returns: Json }
      set_template_default: {
        Args: { template_id: string; template_type_param?: string }
        Returns: undefined
      }
      set_user_default_location:
        | {
            Args: { _location_gid: string; _store_key: string }
            Returns: undefined
          }
        | {
            Args: {
              _location_gid: string
              _store_key: string
              _user_id: string
            }
            Returns: undefined
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_intake_item: {
        Args: { item_id: string; reason_in?: string }
        Returns: {
          item_id_out: string
        }[]
      }
      soft_delete_intake_items: {
        Args: { ids: string[]; reason?: string }
        Returns: Json
      }
      upsert_shopify_intake_item: {
        Args: {
          p_brand_title: string
          p_category: string
          p_image_urls: Json
          p_price: number
          p_quantity: number
          p_removed_from_batch_at: string
          p_shopify_inventory_item_id: string
          p_shopify_location_gid: string
          p_shopify_product_id: string
          p_shopify_snapshot: Json
          p_shopify_variant_id: string
          p_sku: string
          p_source_provider: string
          p_store_key: string
          p_subject: string
        }
        Returns: undefined
      }
      user_can_access_region: {
        Args: { _region_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_store_location: {
        Args: { _location_gid?: string; _store_key: string; _user_id: string }
        Returns: boolean
      }
      verify_user_access: { Args: { _user_id?: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "staff" | "manager"
      card_status: "available" | "reserved" | "sold"
      retry_job_status: "queued" | "running" | "done" | "dead"
      retry_job_type: "END_EBAY" | "SET_SHOPIFY_ZERO" | "ENFORCE_LOCATION"
      sale_event_status: "received" | "processed" | "ignored" | "failed"
      sale_source: "shopify" | "ebay"
      sync_status: "pending" | "synced" | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "manager"],
      card_status: ["available", "reserved", "sold"],
      retry_job_status: ["queued", "running", "done", "dead"],
      retry_job_type: ["END_EBAY", "SET_SHOPIFY_ZERO", "ENFORCE_LOCATION"],
      sale_event_status: ["received", "processed", "ignored", "failed"],
      sale_source: ["shopify", "ebay"],
      sync_status: ["pending", "synced", "error"],
    },
  },
} as const
